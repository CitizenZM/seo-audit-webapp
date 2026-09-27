import type { SupabaseClient } from '@supabase/supabase-js';
import { decryptSecret, encryptSecret } from '@/lib/shopifyOAuth';
import { resolveCreds as resolveEnvCreds, type ShopifyCreds } from '@/lib/shopify';

/**
 * Stored one-click Shopify connections (seo_shop_connections). Tokens are
 * encrypted at rest; expiring offline access tokens (1h) are refreshed with
 * the 90-day refresh token automatically. Env-based credentials (client
 * credentials grant / legacy token) remain a fallback for org-owned stores.
 */

export interface TokenResponse {
  access_token: string;
  scope?: string;
  expires_in?: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
}

type Fetch = typeof fetch;

const appCreds = () => {
  const id = process.env.SHOPIFY_APP_CLIENT_ID?.trim();
  const secret = process.env.SHOPIFY_APP_CLIENT_SECRET?.trim();
  if (!id || !secret) throw new Error('SHOPIFY_APP_CLIENT_ID / SHOPIFY_APP_CLIENT_SECRET not configured');
  return { id, secret };
};
const encKey = () => {
  const k = process.env.SHOPIFY_TOKEN_ENC_KEY?.trim();
  if (!k) throw new Error('SHOPIFY_TOKEN_ENC_KEY not configured');
  return k;
};

async function tokenRequest(shop: string, body: Record<string, string>, f: Fetch): Promise<TokenResponse> {
  const res = await f(`https://${shop}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Shopify token request failed (HTTP ${res.status})`);
  const json = (await res.json()) as TokenResponse;
  if (!json.access_token) throw new Error('Shopify returned no access_token');
  return json;
}

/** Authorization code → expiring offline token (+ refresh token). */
export function exchangeCode(shop: string, code: string, f: Fetch = fetch): Promise<TokenResponse> {
  const { id, secret } = appCreds();
  return tokenRequest(shop, { client_id: id, client_secret: secret, code, expiring: '1' }, f);
}

const iso = (secFromNow?: number) => (secFromNow ? new Date(Date.now() + secFromNow * 1000).toISOString() : null);

export async function saveConnection(db: SupabaseClient, clientId: string, shop: string, t: TokenResponse) {
  const key = encKey();
  const { error } = await db.from('seo_shop_connections').upsert(
    {
      client_id: clientId,
      shop_domain: shop,
      access_token_enc: encryptSecret(t.access_token, key),
      access_expires_at: iso(t.expires_in),
      refresh_token_enc: t.refresh_token ? encryptSecret(t.refresh_token, key) : null,
      refresh_expires_at: iso(t.refresh_token_expires_in),
      scopes: t.scope ?? null,
      status: 'connected',
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'client_id' },
  );
  if (error) throw new Error(`Failed to save Shopify connection: ${error.message}`);
}

interface ConnectionRow {
  client_id: string;
  shop_domain: string;
  access_token_enc: string;
  access_expires_at: string | null;
  refresh_token_enc: string | null;
  refresh_expires_at: string | null;
  status: string;
  auto_apply: boolean;
}

export async function loadConnection(db: SupabaseClient, clientId: string): Promise<ConnectionRow | null> {
  const { data } = await db
    .from('seo_shop_connections')
    .select('client_id, shop_domain, access_token_enc, access_expires_at, refresh_token_enc, refresh_expires_at, status, auto_apply')
    .eq('client_id', clientId)
    .maybeSingle();
  return (data as ConnectionRow) ?? null;
}

/** Decrypt (refreshing first if the access token is within 5 min of expiry). */
export async function credsFromConnection(db: SupabaseClient, row: ConnectionRow, f: Fetch = fetch): Promise<ShopifyCreds | null> {
  if (row.status !== 'connected') return null;
  const key = encKey();
  const expiresAt = row.access_expires_at ? Date.parse(row.access_expires_at) : Infinity;
  if (expiresAt - Date.now() > 5 * 60_000) return { shop: row.shop_domain, token: decryptSecret(row.access_token_enc, key) };

  if (!row.refresh_token_enc || (row.refresh_expires_at && Date.parse(row.refresh_expires_at) < Date.now())) {
    await db.from('seo_shop_connections').update({ status: 'error', updated_at: new Date().toISOString() }).eq('client_id', row.client_id);
    return null; // needs re-authorization
  }
  const { id, secret } = appCreds();
  const t = await tokenRequest(
    row.shop_domain,
    { client_id: id, client_secret: secret, grant_type: 'refresh_token', refresh_token: decryptSecret(row.refresh_token_enc, key) },
    f,
  );
  await saveConnection(db, row.client_id, row.shop_domain, t);
  return { shop: row.shop_domain, token: t.access_token };
}

/** Stored one-click connection first, then env credentials. */
export async function resolveClientCreds(
  db: SupabaseClient,
  client: { id: string; slug: string; shop_domain?: string | null },
): Promise<ShopifyCreds | null> {
  const row = await loadConnection(db, client.id);
  if (row) {
    const c = await credsFromConnection(db, row).catch(() => null);
    if (c) return c;
  }
  return resolveEnvCreds(client);
}
