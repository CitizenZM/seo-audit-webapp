import { describe, it, expect } from 'vitest';
import {
  detectFixNeeds,
  validateSeoTitle,
  validateSeoDescription,
  fallbackTitle,
  applyFix,
  rollbackFix,
  type ShopifyPort,
  type FixRecord,
  type ProductSnapshot,
} from './fixEngine';

const product = (over: Partial<ProductSnapshot> = {}): ProductSnapshot => ({
  id: 'gid://shopify/Product/1',
  title: 'Leather Collar & Leash Set',
  handle: 'leather-collar',
  description: 'Premium full-grain leather collar with matching leash.',
  seoTitle: 'Leather Collar & Leash Set | Dark Fantasy',
  seoDescription: 'Premium full-grain leather collar and matching leash, hand-finished for comfort and durability. Discreet shipping on every order.',
  images: [{ id: 'gid://shopify/MediaImage/9', alt: 'Leather collar front view' }],
  ...over,
});

describe('detectFixNeeds', () => {
  it('finds nothing on a healthy product', () => {
    expect(detectFixNeeds([product()])).toEqual([]);
  });

  it('flags missing / over-long SEO titles and missing / out-of-range descriptions', () => {
    const needs = detectFixNeeds([
      product({ id: 'p1', seoTitle: null }),
      product({ id: 'p2', seoTitle: 'x'.repeat(75) }),
      product({ id: 'p3', seoDescription: null }),
      product({ id: 'p4', seoDescription: 'too short' }),
      product({ id: 'p5', seoDescription: 'y'.repeat(200) }),
    ]);
    expect(needs.map((n) => `${n.resourceId}:${n.field}:${n.reason}`)).toEqual([
      'p1:seo_title:missing',
      'p2:seo_title:too_long',
      'p3:seo_description:missing',
      'p4:seo_description:too_short',
      'p5:seo_description:too_long',
    ]);
  });

  it('flags every image without alt text, with the image as the resource', () => {
    const needs = detectFixNeeds([product({ images: [{ id: 'm1', alt: '' }, { id: 'm2', alt: null }, { id: 'm3', alt: 'ok' }] })]);
    expect(needs.map((n) => `${n.resourceId}:${n.field}`)).toEqual(['m1:image_alt', 'm2:image_alt']);
    expect(needs[0].productId).toBe('gid://shopify/Product/1');
  });
});

describe('validators', () => {
  it('title: 15–60 chars, non-empty', () => {
    expect(validateSeoTitle('Leather Collar & Leash Set | Dark Fantasy')).toBe(true);
    expect(validateSeoTitle('x'.repeat(61))).toBe(false);
    expect(validateSeoTitle('short')).toBe(false);
  });
  it('description: 70–160 chars', () => {
    expect(validateSeoDescription('d'.repeat(130))).toBe(true);
    expect(validateSeoDescription('d'.repeat(50))).toBe(false);
    expect(validateSeoDescription('d'.repeat(161))).toBe(false);
  });
  it('fallback title stays within 60 chars and appends the brand when it fits', () => {
    // Themes append the shop name to <title> ("… – Dark Fantasy"), so the SEO
    // title must never carry the brand itself (pilot found "| DF – DF" risk).
    expect(fallbackTitle('Leather Collar', 'Dark Fantasy')).toBe('Leather Collar');
    expect(fallbackTitle('A '.repeat(40).trim(), 'Dark Fantasy').length).toBeLessThanOrEqual(60);
  });
});

/** In-memory Shopify double that records writes and can simulate failures. */
function fakeShopify(initial: Record<string, string | null>, opts: { rejectWrite?: string; silentlyIgnore?: boolean } = {}) {
  const store = { ...initial };
  const writes: string[] = [];
  const port: ShopifyPort = {
    async readField(resourceId, field) {
      return store[`${resourceId}:${field}`] ?? null;
    },
    async writeField(resourceId, field, value) {
      writes.push(`${resourceId}:${field}=${value}`);
      if (opts.rejectWrite) return { ok: false, error: opts.rejectWrite };
      if (!opts.silentlyIgnore) store[`${resourceId}:${field}`] = value;
      return { ok: true };
    },
  };
  return { port, store, writes };
}

const fix = (over: Partial<FixRecord> = {}): FixRecord => ({
  id: 'f1',
  resourceId: 'p1',
  productId: 'p1',
  field: 'seo_title',
  beforeValue: null,
  proposedValue: 'Leather Collar | Dark Fantasy',
  ...over,
});

describe('applyFix — write + mandatory second check', () => {
  it('writes, re-reads, and marks verified only when the platform record matches', async () => {
    const { port, store } = fakeShopify({ 'p1:seo_title': null });
    const r = await applyFix(port, fix());
    expect(r).toMatchObject({ status: 'verified', observedValue: 'Leather Collar | Dark Fantasy' });
    expect(store['p1:seo_title']).toBe('Leather Collar | Dark Fantasy');
  });

  it('refuses to write when the live value drifted from the proposal baseline (conflict)', async () => {
    const { port, writes } = fakeShopify({ 'p1:seo_title': 'Edited by merchant' });
    const r = await applyFix(port, fix());
    expect(r.status).toBe('conflict');
    expect(writes).toEqual([]);
  });

  it('reports failed with the platform error when Shopify returns userErrors', async () => {
    const { port } = fakeShopify({ 'p1:seo_title': null }, { rejectWrite: 'Title is too long' });
    const r = await applyFix(port, fix());
    expect(r).toMatchObject({ status: 'failed', error: 'Title is too long' });
  });

  it('a "successful" write that did not actually persist is FAILED, not verified', async () => {
    const { port } = fakeShopify({ 'p1:seo_title': null }, { silentlyIgnore: true });
    const r = await applyFix(port, fix());
    expect(r.status).toBe('failed');
    expect(r.error).toMatch(/second check/i);
  });
});

describe('rollbackFix', () => {
  it('restores the before value and verifies it', async () => {
    const { port, store } = fakeShopify({ 'p1:seo_title': 'Leather Collar | Dark Fantasy' });
    const r = await rollbackFix(port, fix({ beforeValue: 'Old title here ok' }));
    expect(r.status).toBe('rolled_back');
    expect(store['p1:seo_title']).toBe('Old title here ok');
  });

  it('refuses to roll back over a value someone changed after we applied', async () => {
    const { port, writes } = fakeShopify({ 'p1:seo_title': 'Merchant changed it again' });
    const r = await rollbackFix(port, fix({ beforeValue: 'Old title here ok' }));
    expect(r.status).toBe('conflict');
    expect(writes).toEqual([]);
  });
});

describe('fallback copy is clean text (live Dark Fantasy data had &amp; entities)', () => {
  it('decodes HTML entities and strips tags in the description fallback', async () => {
    const { fallbackDescription } = await import('./fixEngine');
    const out = fallbackDescription('<p>The Wrist &amp; Thigh Cuffs&nbsp;set &mdash; padded &quot;soft&quot; restraints for couples, adjustable and lockable for many scenarios.</p>', 'Cuffs', 'DF')!;
    expect(out).not.toMatch(/&amp;|&nbsp;|&quot;|&mdash;|<p>/);
    expect(out).toContain('Wrist & Thigh');
  });
});

describe('stripBrand', () => {
  it('removes a trailing brand with any separator, case-insensitively', async () => {
    const { stripBrand } = await import('./fixEngine');
    expect(stripBrand('Latex Lingerie Set - Cupless 3-Piece | Dark Fantasy', 'Dark Fantasy')).toBe('Latex Lingerie Set - Cupless 3-Piece');
    expect(stripBrand('Velvet Blindfold – dark fantasy', 'Dark Fantasy')).toBe('Velvet Blindfold');
    expect(stripBrand('Dark Fantasy Collar', 'Dark Fantasy')).toBe('Dark Fantasy Collar');
  });
});
