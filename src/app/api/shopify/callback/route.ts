import { NextResponse } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { loadClient } from '@/lib/fixStore';
import { isValidShopDomain, verifyCallbackHmac, verifyState } from '@/lib/shopifyOAuth';
import { exchangeCode, saveConnection } from '@/lib/shopConnections';
import { dispatchAutoFix } from '@/lib/autoFixDispatch';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/shopify/callback — Shopify's OAuth redirect. Trust comes from the
 * signed state (binds the client slug, 10-min expiry) + Shopify's HMAC over
 * the query (constant-time) + shop domain validation. Exchanges the code for
 * an expiring offline token, stores it encrypted, links the client to the
 * store, then kicks off auto mode (scan + auto-apply, each fix second-checked).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = url.searchParams;
  const fail = (msg: string, slug?: string) =>
    NextResponse.redirect(new URL(`${slug ? `/client/${slug}` : '/clients'}?shopify=error&reason=${encodeURIComponent(msg)}`, url.origin));

  if (!isSupabaseConfigured()) return fail('server not configured');
  const secret = process.env.SHOPIFY_APP_CLIENT_SECRET;
  const key = process.env.SHOPIFY_TOKEN_ENC_KEY;
  if (!secret || !key) return fail('Shopify app not configured on the server');

  const state = verifyState(q.get('state') ?? '', key);
  if (!state) return fail('authorization link expired — please try again');
  if (!verifyCallbackHmac(q, secret)) return fail('invalid Shopify signature', state.clientSlug);
  const shop = (q.get('shop') ?? '').toLowerCase();
  const code = q.get('code');
  if (!isValidShopDomain(shop) || !code) return fail('invalid shop or code', state.clientSlug);

  const db = supabaseAdmin();
  const client = await loadClient(db, state.clientSlug);
  if (!client) return fail('client not found');

  try {
    const token = await exchangeCode(shop, code);
    await saveConnection(db, client.id, shop, token);
    await db.from('seo_clients').update({ platform: 'shopify', shop_domain: shop }).eq('id', client.id);
  } catch (e) {
    return fail(e instanceof Error ? e.message : 'token exchange failed', client.slug);
  }

  await dispatchAutoFix(url.origin, client.id, { scan: true });
  return NextResponse.redirect(new URL(`/client/${client.slug}?shopify=connected`, url.origin));
}
