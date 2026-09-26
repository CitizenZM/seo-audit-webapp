import { describe, it, expect, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import { proposeForClient, actOnFix, type ClientRow } from './fixStore';
import type { ProductSnapshot, ShopifyPort } from './fixEngine';

/** Minimal in-memory stand-in for the supabase-js query builder calls fixStore uses. */
function fakeDb() {
  const tables: Record<string, Record<string, unknown>[]> = { seo_fixes: [], seo_clients: [] };
  let seq = 0;
  function builder(table: string) {
    const filters: ((r: Record<string, unknown>) => boolean)[] = [];
    let op: 'select' | 'update' | 'insert' = 'select';
    let patch: Record<string, unknown> = {};
    const run = () => {
      const rows = tables[table].filter((r) => filters.every((f) => f(r)));
      if (op === 'update') rows.forEach((r) => Object.assign(r, Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined))));
      return rows;
    };
    const b = {
      select() { return b; },
      eq(col: string, v: unknown) { filters.push((r) => r[col] === v); return b; },
      in(col: string, vs: unknown[]) { filters.push((r) => vs.includes(r[col])); return b; },
      order() { return b; },
      limit() { return b; },
      update(p: Record<string, unknown>) { op = 'update'; patch = p; return b; },
      insert(rows: Record<string, unknown>[]) {
        for (const r of rows) tables[table].push({ id: `fix-${++seq}`, status: 'proposed', ...r });
        return Promise.resolve({ error: null });
      },
      maybeSingle() { return Promise.resolve({ data: run()[0] ?? null, error: null }); },
      single() { return Promise.resolve({ data: run()[0] ?? null, error: null }); },
      then(resolve: (v: { data: unknown; error: null }) => void) { resolve({ data: run(), error: null }); },
    };
    return b;
  }
  return { db: { from: builder } as unknown as SupabaseClient, tables };
}

const client: ClientRow = { id: 'c1', slug: 'dark-fantasy', name: 'Dark Fantasy', domain: 'bdsmpub.com', platform: 'shopify', shop_domain: 's.myshopify.com' };
const products: ProductSnapshot[] = [{
  id: 'p1', title: 'Velvet Blindfold Noir', handle: 'v',
  description: 'Soft velvet blindfold with an adjustable strap, lined for comfort and made to block light completely.',
  seoTitle: null, seoDescription: 'short', images: [{ id: 'm1', alt: null }],
}];

function fakeShop(initial: Record<string, string | null>) {
  const store = { ...initial };
  const port: ShopifyPort = {
    async readField(id, field) { return store[`${id}:${field}`] ?? null; },
    async writeField(id, field, value) { store[`${id}:${field}`] = value; return { ok: true }; },
  };
  return { port, store };
}

describe('fixStore end-to-end', () => {
  beforeEach(() => { process.env.SHOPIFY_ADMIN_TOKEN_DARK_FANTASY = 'shpat_test'; });

  it('scans → proposes (no store writes) → dedupes on re-scan', async () => {
    const { db, tables } = fakeDb();
    const r1 = await proposeForClient(db, client, { fetch: async () => products, draft: async () => ({}) });
    expect(r1).toMatchObject({ scanned: 1, proposed: 3 });
    expect(tables.seo_fixes.map((f) => f.field).sort()).toEqual(['image_alt', 'seo_description', 'seo_title']);
    const r2 = await proposeForClient(db, client, { fetch: async () => products, draft: async () => ({}) });
    expect(r2.proposed).toBe(0);
  });

  it('approve writes, second-checks, records evidence; rollback restores', async () => {
    const { db, tables } = fakeDb();
    await proposeForClient(db, client, { fetch: async () => products, draft: async () => ({}) });
    const titleFix = tables.seo_fixes.find((f) => f.field === 'seo_title')!;
    const { port, store } = fakeShop({ 'p1:seo_title': null });

    const applied = await actOnFix(db, titleFix.id as string, 'approve', { operator: 'barron', port });
    expect(applied).toMatchObject({ fix: { status: 'verified', observed_value: 'Velvet Blindfold Noir | Dark Fantasy' } });
    expect(store['p1:seo_title']).toBe('Velvet Blindfold Noir | Dark Fantasy');
    expect((titleFix.events as { type: string }[]).map((e) => e.type)).toEqual(['proposed', 'apply']);

    const rolled = await actOnFix(db, titleFix.id as string, 'rollback', { operator: 'barron', port });
    expect(rolled).toMatchObject({ fix: { status: 'rolled_back' } });
    expect(store['p1:seo_title']).toBe('');
  });

  it('operator-edited value is what gets written, and is labeled operator', async () => {
    const { db, tables } = fakeDb();
    await proposeForClient(db, client, { fetch: async () => products, draft: async () => ({}) });
    const fix = tables.seo_fixes.find((f) => f.field === 'seo_title')!;
    const { port, store } = fakeShop({ 'p1:seo_title': null });
    await actOnFix(db, fix.id as string, 'approve', { operator: 'barron', port, value: 'Velvet Blindfold – Lined Comfort Fit' });
    expect(store['p1:seo_title']).toBe('Velvet Blindfold – Lined Comfort Fit');
    expect(fix.proposal_source).toBe('operator');
  });

  it('merchant edited the product since the scan → conflict, nothing written', async () => {
    const { db, tables } = fakeDb();
    await proposeForClient(db, client, { fetch: async () => products, draft: async () => ({}) });
    const fix = tables.seo_fixes.find((f) => f.field === 'seo_title')!;
    const { port, store } = fakeShop({ 'p1:seo_title': 'Merchant wrote this' });
    const r = await actOnFix(db, fix.id as string, 'approve', { operator: 'barron', port });
    expect(r).toMatchObject({ fix: { status: 'conflict' } });
    expect(store['p1:seo_title']).toBe('Merchant wrote this');
  });

  it('refuses illegal transitions', async () => {
    const { db, tables } = fakeDb();
    await proposeForClient(db, client, { fetch: async () => products, draft: async () => ({}) });
    const fix = tables.seo_fixes[0];
    const { port } = fakeShop({});
    expect(await actOnFix(db, fix.id as string, 'rollback', { operator: 'b', port })).toMatchObject({ status: 409 });
    await actOnFix(db, fix.id as string, 'reject', { operator: 'b', port });
    expect(await actOnFix(db, fix.id as string, 'approve', { operator: 'b', port })).toMatchObject({ status: 409 });
  });
});
