import { z } from 'zod';
import { zodResponseFormat } from 'openai/helpers/zod';
import { activeProvider } from '@/lib/ai';
import {
  fallbackAlt,
  fallbackDescription,
  fallbackTitle,
  stripBrand,
  validateSeoDescription,
  validateSeoTitle,
  DESC_MAX,
  DESC_MIN,
  type FixField,
  type FixNeed,
  type ProductSnapshot,
} from '@/lib/fixEngine';

/**
 * Turns detected fix needs into concrete proposals: AI drafts for SEO titles
 * and meta descriptions (validated against hard length rules), deterministic
 * fallbacks when a draft is missing or invalid, and product-title-based alt
 * text (we don't caption images we haven't seen). Never proposes a value
 * identical to the current one, and never invents a description when there's
 * no real product copy to build from.
 */

export interface Proposal {
  resourceId: string;
  productId: string;
  productTitle: string;
  field: FixField;
  reason: FixNeed['reason'];
  beforeValue: string | null;
  proposedValue: string;
  source: 'ai' | 'fallback';
}

/**
 * Fit copy into the SEO description range (70–160). Keeps whole sentences
 * when possible; otherwise word-cuts with an ellipsis. Null if too short.
 */
export function fitDescription(text: string): string | null {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= DESC_MAX) return t.length >= DESC_MIN ? t : null;
  const sentences = t.match(/[^.!?]+[.!?]+(\s|$)/g)?.map((x) => x.trim()) ?? [];
  let acc = '';
  for (const sen of sentences) {
    const next = acc ? `${acc} ${sen}` : sen;
    if (next.length > DESC_MAX) break;
    acc = next;
  }
  if (acc.length >= DESC_MIN) return acc;
  const cut = t.slice(0, DESC_MAX - 1);
  const atWord = cut.slice(0, cut.lastIndexOf(' ')).replace(/[\s,;:–—-]+$/, '');
  return atWord.length >= DESC_MIN ? `${atWord}…` : null;
}

const norm = (v: string) => v.toLowerCase().replace(/[^a-z0-9]+/g, '');

export type Drafts = Record<string, { seoTitle?: string; seoDescription?: string }>;

export function buildProposals(needs: FixNeed[], products: ProductSnapshot[], drafts: Drafts, brand: string): Proposal[] {
  const byId = new Map(products.map((p) => [p.id, p]));
  const out: Proposal[] = [];

  for (const n of needs) {
    const p = byId.get(n.productId);
    if (!p) continue;
    let value: string | null = null;
    let source: Proposal['source'] = 'fallback';

    if (n.field === 'seo_title') {
      const raw = drafts[p.id]?.seoTitle?.trim();
      const d = raw ? stripBrand(raw, brand) : null;
      if (d && validateSeoTitle(d)) { value = d; source = 'ai'; }
      else value = fallbackTitle(p.title, brand);
      // Missing SEO title → Shopify already renders the product title; a
      // proposal identical to it changes nothing.
      if (n.reason === 'missing' && norm(value) === norm(p.title)) continue;
    } else if (n.field === 'seo_description') {
      const raw = drafts[p.id]?.seoDescription?.trim();
      const d = raw ? fitDescription(raw) : null;
      if (d && validateSeoDescription(d)) { value = d; source = 'ai'; }
      else value = fallbackDescription(p.description, p.title, brand);
    } else {
      const idx = p.images.findIndex((img) => img.id === n.resourceId);
      value = fallbackAlt(p.title, Math.max(0, idx), p.images.length);
    }

    if (!value || value.trim() === (n.currentValue ?? '').trim()) {
      // Draft equals current value (e.g. model echoed an over-long title): use the fallback instead, if it differs.
      if (n.field === 'seo_title') {
        const fb = fallbackTitle(p.title, brand);
        if (fb !== (n.currentValue ?? '').trim() && fb.length <= 60) { value = fb; source = 'fallback'; } else continue;
      } else continue;
    }

    out.push({
      resourceId: n.resourceId,
      productId: p.id,
      productTitle: p.title,
      field: n.field,
      reason: n.reason,
      beforeValue: n.currentValue,
      proposedValue: value,
      source,
    });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* AI drafting (best effort — buildProposals works without it)         */
/* ------------------------------------------------------------------ */

// Loose wire schema (Gemini 400s on nested array length constraints).
const DraftSchema = z.object({
  items: z.array(z.object({ id: z.string(), seoTitle: z.string(), seoDescription: z.string() })),
});

export async function draftSeoCopy(products: ProductSnapshot[], brand: string): Promise<Drafts> {
  const provider = activeProvider();
  if (!provider || products.length === 0) return {};
  const drafts: Drafts = {};
  const batches: ProductSnapshot[][] = [];
  for (let i = 0; i < products.length; i += 10) batches.push(products.slice(i, i + 10));

  await Promise.all(
    batches.map(async (batch) => {
      const list = batch
        .map((p) => `- id: ${p.id}\n  title: ${p.title}\n  copy: ${p.description.replace(/\s+/g, ' ').slice(0, 400)}`)
        .join('\n');
      try {
        const r = await provider.client.chat.completions.parse({
          model: provider.model,
          max_tokens: 8000,
          // Gemini 2.5's hidden "thinking" otherwise eats the token budget and
          // truncates the JSON (live: 6-product batch returned nothing).
          reasoning_effort: 'low',
          messages: [
            {
              role: 'system',
              content:
                `You write Shopify product SEO metadata for the brand "${brand}". Rules: seoTitle 30-55 characters, front-load the product type/keyword, must add search value beyond the product name (use-case, key attribute), and NEVER include the brand name (the theme appends it); seoDescription ONE or TWO short sentences, at most 24 words (~150 characters), factual, based ONLY on the provided copy (never invent specs, prices, materials or claims), end with a soft benefit or call to action. No quotes, no emojis, no ALL CAPS.`,
            },
            { role: 'user', content: `Products:\n${list}\n\nReturn one item per product id.` },
          ],
          response_format: zodResponseFormat(DraftSchema, 'seo_drafts'),
        });
        for (const it of r.choices[0]?.message?.parsed?.items ?? []) {
          drafts[it.id] = { seoTitle: it.seoTitle, seoDescription: it.seoDescription };
        }
      } catch (e) {
        console.warn('SEO draft batch failed (fallbacks will be used):', e instanceof Error ? e.message : e);
      }
    }),
  );
  return drafts;
}
