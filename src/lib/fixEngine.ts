/**
 * Implementation engine (Tier 1) — writes SEO fixes to a client store and
 * enforces the operator's second-check rule in code:
 *
 *   1. Pre-read: the live value must still equal the baseline captured when
 *      the fix was proposed; otherwise → 'conflict' (never overwrite a
 *      merchant's edit).
 *   2. Write: platform-level errors (Shopify userErrors) → 'failed'.
 *   3. Second check: re-read the platform record and compare. Only an exact
 *      match is 'verified'; a write that "succeeded" but didn't persist is
 *      'failed'. A tool's success return value never counts on its own.
 *   4. Rollback: same discipline in reverse (current must equal what we
 *      applied; restored value is re-read and compared).
 *
 * The platform is behind ShopifyPort so this logic is unit-testable; the real
 * adapter lives in shopify.ts.
 */

export type FixField = 'seo_title' | 'seo_description' | 'image_alt';
export type FixReason = 'missing' | 'too_long' | 'too_short';

export interface ProductSnapshot {
  id: string;
  title: string;
  handle: string;
  description: string;
  seoTitle: string | null;
  seoDescription: string | null;
  images: { id: string; alt: string | null }[];
}

export interface FixNeed {
  resourceId: string; // product gid (seo fields) or media-image gid (alt)
  productId: string;
  productTitle: string;
  field: FixField;
  reason: FixReason;
  currentValue: string | null;
}

export const TITLE_MIN = 15;
export const TITLE_MAX = 60;
export const DESC_MIN = 70;
export const DESC_MAX = 160;

const blank = (v: string | null | undefined) => !v || !v.trim();
const same = (a: string | null | undefined, b: string | null | undefined) => (a ?? '').trim() === (b ?? '').trim();

export function detectFixNeeds(products: ProductSnapshot[]): FixNeed[] {
  const needs: FixNeed[] = [];
  for (const p of products) {
    const base = { productId: p.id, productTitle: p.title };
    if (blank(p.seoTitle)) needs.push({ ...base, resourceId: p.id, field: 'seo_title', reason: 'missing', currentValue: p.seoTitle });
    else if (p.seoTitle!.length > TITLE_MAX) needs.push({ ...base, resourceId: p.id, field: 'seo_title', reason: 'too_long', currentValue: p.seoTitle });

    if (blank(p.seoDescription)) needs.push({ ...base, resourceId: p.id, field: 'seo_description', reason: 'missing', currentValue: p.seoDescription });
    else if (p.seoDescription!.length < DESC_MIN) needs.push({ ...base, resourceId: p.id, field: 'seo_description', reason: 'too_short', currentValue: p.seoDescription });
    else if (p.seoDescription!.length > DESC_MAX) needs.push({ ...base, resourceId: p.id, field: 'seo_description', reason: 'too_long', currentValue: p.seoDescription });

    for (const img of p.images) {
      if (blank(img.alt)) needs.push({ ...base, resourceId: img.id, field: 'image_alt', reason: 'missing', currentValue: img.alt });
    }
  }
  return needs;
}

export const validateSeoTitle = (v: string) => v.trim().length >= TITLE_MIN && v.trim().length <= TITLE_MAX;
export const validateSeoDescription = (v: string) => v.trim().length >= DESC_MIN && v.trim().length <= DESC_MAX;

/**
 * Deterministic title when the AI draft is unavailable/invalid. Never adds
 * the brand: Shopify themes append the shop name to <title> themselves
 * (live pilot: "… – Dark Fantasy"), so a branded SEO title would duplicate it.
 */
export function fallbackTitle(productTitle: string, _brand?: string): string {
  void _brand;
  const t = productTitle.replace(/\s+/g, ' ').trim();
  if (t.length <= TITLE_MAX) return t;
  const cut = t.slice(0, TITLE_MAX - 1);
  return `${cut.slice(0, cut.lastIndexOf(' ') > TITLE_MIN ? cut.lastIndexOf(' ') : cut.length).replace(/[\s,;:|–—-]+$/, '')}…`;
}

/** Remove a trailing "| Brand" / "- Brand" / "– Brand" (themes append the shop name). */
export function stripBrand(title: string, brand: string): string {
  const esc = brand.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return title.replace(new RegExp(`\\s*[|–—:-]\\s*${esc}\\s*$`, 'i'), '').trim();
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–', hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“' };

/** Plain text from product copy that may contain HTML tags and entities. */
export function toPlainText(input: string): string {
  return input
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&([a-z]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m)
    .replace(/\s+/g, ' ')
    .trim();
}

/** Deterministic description fallback built from the product's own copy. */
export function fallbackDescription(description: string, productTitle: string, brand: string): string | null {
  const clean = toPlainText(description);
  const base = clean.length >= DESC_MIN ? clean : `${productTitle} from ${brand}. ${clean}`.trim();
  if (base.length < DESC_MIN) return null; // not enough real copy — leave for AI/manual
  if (base.length <= DESC_MAX) return base;
  const cut = base.slice(0, DESC_MAX - 1);
  return `${cut.slice(0, cut.lastIndexOf(' ') > DESC_MIN ? cut.lastIndexOf(' ') : cut.length).trimEnd()}…`;
}

export function fallbackAlt(productTitle: string, index: number, total: number): string {
  return total > 1 ? `${productTitle} — image ${index + 1}` : productTitle;
}

/* ------------------------------------------------------------------ */
/* Execution                                                           */
/* ------------------------------------------------------------------ */

export interface ShopifyPort {
  readField(resourceId: string, field: FixField, productId: string): Promise<string | null>;
  writeField(resourceId: string, field: FixField, value: string, productId: string): Promise<{ ok: true } | { ok: false; error: string }>;
}

export interface FixRecord {
  id: string;
  resourceId: string;
  productId: string;
  field: FixField;
  beforeValue: string | null;
  proposedValue: string;
}

export type ApplyStatus = 'verified' | 'failed' | 'conflict';
export interface ApplyResult {
  status: ApplyStatus | 'rolled_back';
  observedValue?: string | null;
  error?: string;
}

export async function applyFix(port: ShopifyPort, fix: FixRecord): Promise<ApplyResult> {
  let current: string | null;
  try {
    current = await port.readField(fix.resourceId, fix.field, fix.productId);
  } catch (e) {
    return { status: 'failed', error: `pre-read failed: ${e instanceof Error ? e.message : e}` };
  }
  if (same(current, fix.proposedValue)) return { status: 'verified', observedValue: current }; // already in place
  if (!same(current, fix.beforeValue)) {
    return { status: 'conflict', observedValue: current, error: 'Live value changed since the fix was proposed — not overwriting.' };
  }

  const write = await port.writeField(fix.resourceId, fix.field, fix.proposedValue, fix.productId).catch((e) => ({
    ok: false as const,
    error: e instanceof Error ? e.message : String(e),
  }));
  if (!write.ok) return { status: 'failed', error: write.error };

  const observed = await port.readField(fix.resourceId, fix.field, fix.productId).catch(() => undefined);
  if (observed === undefined) return { status: 'failed', error: 'second check could not re-read the platform record' };
  if (!same(observed, fix.proposedValue)) {
    return { status: 'failed', observedValue: observed, error: 'second check mismatch: platform record does not show the written value' };
  }
  return { status: 'verified', observedValue: observed };
}

export async function rollbackFix(port: ShopifyPort, fix: FixRecord): Promise<ApplyResult> {
  const current = await port.readField(fix.resourceId, fix.field, fix.productId).catch(() => undefined);
  if (current === undefined) return { status: 'failed', error: 'pre-read failed' };
  if (same(current, fix.beforeValue)) return { status: 'rolled_back', observedValue: current };
  if (!same(current, fix.proposedValue)) {
    return { status: 'conflict', observedValue: current, error: 'Live value changed after the fix was applied — not rolling back over it.' };
  }
  const write = await port.writeField(fix.resourceId, fix.field, fix.beforeValue ?? '', fix.productId).catch((e) => ({
    ok: false as const,
    error: e instanceof Error ? e.message : String(e),
  }));
  if (!write.ok) return { status: 'failed', error: write.error };
  const observed = await port.readField(fix.resourceId, fix.field, fix.productId).catch(() => undefined);
  if (observed === undefined || !same(observed, fix.beforeValue)) {
    return { status: 'failed', observedValue: observed ?? null, error: 'second check mismatch after rollback' };
  }
  return { status: 'rolled_back', observedValue: observed };
}
