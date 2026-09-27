import { describe, it, expect, beforeEach, vi } from 'vitest';
import crypto from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { saveConnection, loadConnection, credsFromConnection, exchangeCode } from './shopConnections';

function fakeDb() {
  const rows: Record<string, Record<string, unknown>> = {};
  const from = () => {
    let id: string | undefined;
    let patch: Record<string, unknown> | undefined;
    const b = {
      upsert(row: Record<string, unknown>) { rows[row.client_id as string] = { ...(rows[row.client_id as string] ?? {}), ...row }; return Promise.resolve({ error: null }); },
      select() { return b; },
      update(p: Record<string, unknown>) { patch = p; return b; },
      eq(_c: string, v: string) { id = v; if (patch) { Object.assign(rows[id], patch); return Promise.resolve({ error: null }); } return b; },
      maybeSingle() { return Promise.resolve({ data: id ? rows[id] ?? null : null }); },
    };
    return b;
  };
  return { db: { from } as unknown as SupabaseClient, rows };
}

beforeEach(() => {
  process.env.SHOPIFY_TOKEN_ENC_KEY = crypto.randomBytes(32).toString('base64');
  process.env.SHOPIFY_APP_CLIENT_ID = 'cid';
  process.env.SHOPIFY_APP_CLIENT_SECRET = 'csecret';
});

describe('shop connections', () => {
  it('exchangeCode requests an expiring offline token', async () => {
    const f = vi.fn(async (_u: string, init: RequestInit) => {
      const p = new URLSearchParams(String(init.body));
      expect(p.get('code')).toBe('the-code');
      expect(p.get('expiring')).toBe('1');
      return new Response(JSON.stringify({ access_token: 'at', expires_in: 3600, refresh_token: 'rt', refresh_token_expires_in: 7776000 }));
    });
    const t = await exchangeCode('s.myshopify.com', 'the-code', f as unknown as typeof fetch);
    expect(t.refresh_token).toBe('rt');
  });

  it('stores tokens encrypted and returns them while valid', async () => {
    const { db, rows } = fakeDb();
    await saveConnection(db, 'c1', 's.myshopify.com', { access_token: 'shpat_live', expires_in: 3600, refresh_token: 'shprt_x', refresh_token_expires_in: 7776000 });
    expect(JSON.stringify(rows)).not.toContain('shpat_live');
    const row = (await loadConnection(db, 'c1'))!;
    expect(await credsFromConnection(db, row, vi.fn() as unknown as typeof fetch)).toEqual({ shop: 's.myshopify.com', token: 'shpat_live' });
  });

  it('refreshes an expiring access token with the refresh token and persists the new one', async () => {
    const { db } = fakeDb();
    await saveConnection(db, 'c1', 's.myshopify.com', { access_token: 'old', expires_in: 60, refresh_token: 'shprt_1', refresh_token_expires_in: 7776000 });
    const f = vi.fn(async (_u: string, init: RequestInit) => {
      const p = new URLSearchParams(String(init.body));
      expect(p.get('grant_type')).toBe('refresh_token');
      expect(p.get('refresh_token')).toBe('shprt_1');
      return new Response(JSON.stringify({ access_token: 'new', expires_in: 3600, refresh_token: 'shprt_2', refresh_token_expires_in: 7776000 }));
    });
    const c = await credsFromConnection(db, (await loadConnection(db, 'c1'))!, f as unknown as typeof fetch);
    expect(c).toEqual({ shop: 's.myshopify.com', token: 'new' });
    const again = await credsFromConnection(db, (await loadConnection(db, 'c1'))!, vi.fn() as unknown as typeof fetch);
    expect(again?.token).toBe('new');
  });

  it('marks the connection errored (needs re-auth) when the refresh token is gone', async () => {
    const { db, rows } = fakeDb();
    await saveConnection(db, 'c1', 's.myshopify.com', { access_token: 'old', expires_in: 60 });
    expect(await credsFromConnection(db, (await loadConnection(db, 'c1'))!, vi.fn() as unknown as typeof fetch)).toBeNull();
    expect(rows.c1.status).toBe('error');
  });
});
