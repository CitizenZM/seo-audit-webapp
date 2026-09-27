import { NextResponse } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { requireOperator } from '@/lib/operator';
import { loadClient } from '@/lib/fixStore';
import { buildAuthorizeUrl, isValidShopDomain, signState } from '@/lib/shopifyOAuth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/shopify/install?client=<slug>&shop=<x>.myshopify.com
 * One-click "Connect Shopify": redirects the operator to the store's
 * authorization screen (least-privilege scopes). Shopify redirects back to
 * /api/shopify/callback.
 */
export async function GET(request: Request) {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: 'Supabase not configured' }, { status: 501 });
  if (!(await requireOperator())) return NextResponse.redirect(new URL('/login', request.url));
  const url = new URL(request.url);
  const slug = url.searchParams.get('client') ?? '';
  const db = supabaseAdmin();
  const client = await loadClient(db, slug);
  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 });

  const shop = (url.searchParams.get('shop') || client.shop_domain || '').trim().toLowerCase();
  if (!isValidShopDomain(shop)) {
    return NextResponse.json({ error: 'Enter the store’s xxx.myshopify.com domain' }, { status: 400 });
  }
  const clientId = process.env.SHOPIFY_APP_CLIENT_ID;
  const key = process.env.SHOPIFY_TOKEN_ENC_KEY;
  if (!clientId || !key) return NextResponse.json({ error: 'Shopify app not configured on the server' }, { status: 501 });

  return NextResponse.redirect(
    buildAuthorizeUrl({ shop, clientId, redirectUri: `${url.origin}/api/shopify/callback`, state: signState(client.slug, key) }),
  );
}
