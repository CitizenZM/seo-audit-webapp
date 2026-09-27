import { NextResponse } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { requireOperator } from '@/lib/operator';
import { loadClient } from '@/lib/fixStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET ?client= → connection status + last auto run. PATCH { client, autoApply } → toggle auto mode. */
export async function GET(request: Request) {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: 'Supabase not configured' }, { status: 501 });
  if (!(await requireOperator())) return NextResponse.json({ error: 'Sign in as an operator' }, { status: 401 });
  const db = supabaseAdmin();
  const client = await loadClient(db, new URL(request.url).searchParams.get('client') ?? '');
  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 });
  const { data } = await db
    .from('seo_shop_connections')
    .select('shop_domain, scopes, status, auto_apply, last_run_at, last_run, installed_at')
    .eq('client_id', client.id)
    .maybeSingle();
  return NextResponse.json({ connection: data ?? null, shopDomain: client.shop_domain });
}

export async function PATCH(request: Request) {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: 'Supabase not configured' }, { status: 501 });
  if (!(await requireOperator())) return NextResponse.json({ error: 'Sign in as an operator' }, { status: 401 });
  let body: { client?: string; autoApply?: boolean };
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }
  if (typeof body.autoApply !== 'boolean') return NextResponse.json({ error: 'autoApply boolean required' }, { status: 400 });
  const db = supabaseAdmin();
  const client = await loadClient(db, body.client ?? '');
  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 });
  const { data, error } = await db
    .from('seo_shop_connections')
    .update({ auto_apply: body.autoApply, updated_at: new Date().toISOString() })
    .eq('client_id', client.id)
    .select('auto_apply')
    .maybeSingle();
  if (error || !data) return NextResponse.json({ error: 'No Shopify connection for this client' }, { status: 404 });
  return NextResponse.json({ autoApply: data.auto_apply });
}
