import { describe, it, expect } from 'vitest';
import { buildProposals } from './fixProposals';
import type { FixNeed, ProductSnapshot } from './fixEngine';

const prod = (id: string, over: Partial<ProductSnapshot> = {}): ProductSnapshot => ({
  id, title: 'Velvet Blindfold Noir', handle: 'velvet', description: 'Soft velvet blindfold with an adjustable strap, lined for comfort and made to block light completely during play.',
  seoTitle: null, seoDescription: null, images: [{ id: `${id}-m1`, alt: null }, { id: `${id}-m2`, alt: '' }], ...over,
});
const need = (p: ProductSnapshot, field: FixNeed['field'], resourceId = p.id): FixNeed => ({
  resourceId, productId: p.id, productTitle: p.title, field, reason: 'missing', currentValue: null,
});

describe('buildProposals', () => {
  const p = prod('p1');
  const needs = [need(p, 'seo_title'), need(p, 'seo_description'), need(p, 'image_alt', 'p1-m1'), need(p, 'image_alt', 'p1-m2')];

  it('uses valid AI drafts and marks their source', () => {
    const out = buildProposals(needs, [p], { p1: { seoTitle: 'Velvet Blindfold Noir – Lined & Adjustable', seoDescription: 'A'.repeat(140) } }, 'Dark Fantasy');
    expect(out.find((x) => x.field === 'seo_title')).toMatchObject({ proposedValue: 'Velvet Blindfold Noir – Lined & Adjustable', source: 'ai' });
    expect(out.find((x) => x.field === 'seo_description')!.source).toBe('ai');
  });

  it('falls back deterministically when the AI draft is missing or violates length rules', () => {
    const out = buildProposals(needs, [p], { p1: { seoTitle: 'x'.repeat(80), seoDescription: 'too short' } }, 'Dark Fantasy');
    const t = out.find((x) => x.field === 'seo_title')!;
    expect(t).toMatchObject({ proposedValue: 'Velvet Blindfold Noir | Dark Fantasy', source: 'fallback' });
    const d = out.find((x) => x.field === 'seo_description')!;
    expect(d.source).toBe('fallback');
    expect(d.proposedValue.length).toBeGreaterThanOrEqual(70);
    expect(d.proposedValue.length).toBeLessThanOrEqual(160);
  });

  it('numbers alt text when a product has several images', () => {
    const alts = buildProposals(needs, [p], {}, 'Dark Fantasy').filter((x) => x.field === 'image_alt').map((x) => x.proposedValue);
    expect(alts).toEqual(['Velvet Blindfold Noir — image 1', 'Velvet Blindfold Noir — image 2']);
  });

  it('skips a description need when there is no usable copy and no valid draft (never invents)', () => {
    const bare = prod('p2', { description: '' });
    const out = buildProposals([need(bare, 'seo_description')], [bare], {}, 'DF');
    expect(out).toEqual([]);
  });

  it('never proposes a value identical to the current one', () => {
    const cur = prod('p3', { seoTitle: 'x'.repeat(70) });
    const n: FixNeed = { ...need(cur, 'seo_title'), reason: 'too_long', currentValue: cur.seoTitle };
    const out = buildProposals([n], [cur], { p3: { seoTitle: 'x'.repeat(70) } }, 'DF');
    expect(out[0].proposedValue).not.toBe(cur.seoTitle);
  });
});

describe('fitDescription (LLMs ignore char limits: live drafts were 219–275 chars)', () => {
  it('keeps whole sentences within 160 chars', async () => {
    const { fitDescription } = await import('./fixProposals');
    const out = fitDescription('The Velvet Noir Blindfold offers complete light elimination with a supple PU leather exterior and adjustable elastic strap. Lightweight and comfortable for extended wear, it is an effortless entry point.')!;
    expect(out).toBe('The Velvet Noir Blindfold offers complete light elimination with a supple PU leather exterior and adjustable elastic strap.');
  });
  it('word-cuts with an ellipsis when the first sentence alone is too long', async () => {
    const { fitDescription } = await import('./fixProposals');
    const out = fitDescription('word '.repeat(60).trim() + '.')!;
    expect(out.length).toBeLessThanOrEqual(160);
    expect(out.endsWith('…')).toBe(true);
    expect(out).not.toMatch(/\s…$/);
  });
  it('returns null when the text is too short to be a useful description', async () => {
    const { fitDescription } = await import('./fixProposals');
    expect(fitDescription('Too short.')).toBeNull();
  });
  it('AI drafts that are too long are fitted, not discarded', () => {
    const p = { id: 'p1', title: 'Velvet Blindfold', handle: 'v', description: '', seoTitle: 'Velvet Blindfold | DF', seoDescription: null, images: [] };
    const long = 'The Velvet Noir Blindfold offers complete light elimination with a supple PU leather exterior and adjustable elastic strap. Lightweight and comfortable for extended wear.';
    const out = buildProposals([{ resourceId: 'p1', productId: 'p1', productTitle: p.title, field: 'seo_description', reason: 'missing', currentValue: null }], [p], { p1: { seoDescription: long } }, 'DF');
    expect(out[0].source).toBe('ai');
    expect(out[0].proposedValue.length).toBeLessThanOrEqual(160);
  });
});
