import { aiText, extractJson } from './ai';

/**
 * Content Activation Artifacts — turn audit findings into files a site owner
 * can immediately ship: an llms.txt, ready-to-paste JSON-LD, and a FAQ block
 * with embedded FAQPage schema. All generators here are pure (no network, no
 * DOM parsing of a live page) so they're cheap to test and safe to call from
 * an API route on arbitrary audit data.
 */

export interface LlmsTxtInput {
  domain: string;
  title: string;
  description: string;
  categories?: { name: string; links: { title: string; url: string }[] }[];
  keyPages?: { title: string; url: string; description?: string }[];
}

/** Build a spec-compliant llms.txt (https://llmstxt.org). */
export function generateLlmsTxt({ domain, title, description, categories, keyPages }: LlmsTxtInput): string {
  const heading = title?.trim() || domain;
  const lines: string[] = [`# ${heading}`, '', `> ${description?.trim() || `Official site for ${domain}.`}`, ''];

  if (keyPages && keyPages.length) {
    lines.push('## Key Pages', '');
    for (const p of keyPages) {
      const desc = p.description ? `: ${p.description}` : '';
      lines.push(`- [${p.title}](${p.url})${desc}`);
    }
    lines.push('');
  }

  if (categories && categories.length) {
    for (const cat of categories) {
      lines.push(`## ${cat.name}`, '');
      for (const link of cat.links) {
        lines.push(`- [${link.title}](${link.url})`);
      }
      lines.push('');
    }
  }

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}

// ---------------------------------------------------------------------------
// Structured data (JSON-LD)
// ---------------------------------------------------------------------------

export interface OrganizationSchemaInput {
  name: string;
  url: string;
  logo?: string;
  sameAs?: string[];
  description?: string;
}

export interface ProductSchemaInput {
  name: string;
  description?: string;
  image?: string | string[];
  sku?: string;
  brand?: string;
  price?: number | string;
  priceCurrency?: string;
  availability?: 'InStock' | 'OutOfStock' | 'PreOrder';
  url?: string;
  ratingValue?: number;
  reviewCount?: number;
}

export interface FaqSchemaInput {
  questions: { q: string; a: string }[];
}

export type SchemaJsonLdInput =
  | { type: 'Organization'; input: OrganizationSchemaInput }
  | { type: 'Product'; input: ProductSchemaInput }
  | { type: 'FAQPage'; input: FaqSchemaInput };

/** Build a well-formed JSON-LD object for the given schema.org type. */
export function generateSchemaJsonLd(args: SchemaJsonLdInput): Record<string, unknown> {
  switch (args.type) {
    case 'Organization': {
      const { name, url, logo, sameAs, description } = args.input;
      return {
        '@context': 'https://schema.org',
        '@type': 'Organization',
        name,
        url,
        ...(logo ? { logo } : {}),
        ...(description ? { description } : {}),
        ...(sameAs && sameAs.length ? { sameAs } : {}),
      };
    }
    case 'Product': {
      const { name, description, image, sku, brand, price, priceCurrency, availability, url, ratingValue, reviewCount } = args.input;
      const schema: Record<string, unknown> = {
        '@context': 'https://schema.org',
        '@type': 'Product',
        name,
        ...(description ? { description } : {}),
        ...(image ? { image } : {}),
        ...(sku ? { sku } : {}),
        ...(brand ? { brand: { '@type': 'Brand', name: brand } } : {}),
        ...(url ? { url } : {}),
      };
      if (price !== undefined) {
        schema['offers'] = {
          '@type': 'Offer',
          price: String(price),
          priceCurrency: priceCurrency || 'USD',
          availability: `https://schema.org/${availability || 'InStock'}`,
          ...(url ? { url } : {}),
        };
      }
      if (ratingValue !== undefined && reviewCount !== undefined) {
        schema['aggregateRating'] = {
          '@type': 'AggregateRating',
          ratingValue: String(ratingValue),
          reviewCount: String(reviewCount),
        };
      }
      return schema;
    }
    case 'FAQPage': {
      const { questions } = args.input;
      return {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: questions.map((qa) => ({
          '@type': 'Question',
          name: qa.q,
          acceptedAnswer: { '@type': 'Answer', text: qa.a },
        })),
      };
    }
  }
}

/** Escape text for safe interpolation into HTML. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Render a ready-to-embed FAQ HTML block with FAQPage JSON-LD included. */
export function generateFaqMarkup(questions: { q: string; a: string }[]): string {
  const jsonLd = generateSchemaJsonLd({ type: 'FAQPage', input: { questions } });
  const items = questions
    .map(
      (qa) => `  <div class="faq-item">
    <h3 class="faq-question">${escapeHtml(qa.q)}</h3>
    <div class="faq-answer">${escapeHtml(qa.a)}</div>
  </div>`,
    )
    .join('\n');

  return `<section class="faq" itemscope itemtype="https://schema.org/FAQPage">
<script type="application/ld+json">${JSON.stringify(jsonLd, null, 2)}</script>
${items}
</section>
`;
}

// ---------------------------------------------------------------------------
// AI-assisted FAQ drafting (optional, graceful-degrades to null)
// ---------------------------------------------------------------------------

export interface AuditSummaryInput {
  domain: string;
  title?: string;
  description?: string;
  topIssues?: string[];
  count?: number;
}

/**
 * Draft FAQ question/answer pairs from an audit summary using whichever AI
 * provider is configured. Returns null (never throws) if no provider is
 * available or the call/parse fails — callers should fall back to a manual
 * FAQ builder in that case.
 */
export async function generateFaqContent(input: AuditSummaryInput): Promise<{ q: string; a: string }[] | null> {
  const count = input.count ?? 5;
  const system =
    'You write concise, accurate FAQ content for websites based on an SEO/GEO audit summary. ' +
    'Return ONLY a JSON array of objects with "q" and "a" string fields — no prose, no markdown fences.';
  const user = [
    `Site: ${input.domain}`,
    input.title ? `Title: ${input.title}` : null,
    input.description ? `Description: ${input.description}` : null,
    input.topIssues?.length ? `Known issues: ${input.topIssues.join('; ')}` : null,
    `Write ${count} likely visitor questions with helpful, accurate, non-salesy answers (2-3 sentences each) about this site.`,
  ]
    .filter(Boolean)
    .join('\n');

  const raw = await aiText(system, user, { maxTokens: 900 });
  if (!raw) return null;

  const parsed = extractJson(raw);
  if (!Array.isArray(parsed)) return null;

  const questions = parsed
    .filter((item): item is { q: unknown; a: unknown } => typeof item === 'object' && item !== null)
    .map((item) => ({ q: String((item as Record<string, unknown>).q ?? ''), a: String((item as Record<string, unknown>).a ?? '') }))
    .filter((qa) => qa.q.trim().length > 0 && qa.a.trim().length > 0);

  return questions.length ? questions : null;
}
