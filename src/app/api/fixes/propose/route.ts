import { NextResponse } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { requireOperator } from '@/lib/operator';
import { connection, loadClient, proposeForClient } from '@/lib/fixStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** POST /api/fixes/propose { client } — scan the store and queue Tier-1 fix proposals. Writes nothing to the store. */
export async function POST(request: Request) {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: 'Supabase not configured' }, { status: 501 });
  if (!(await requireOperator())) return NextResponse.json({ error: 'Sign in as an operator' }, { status: 401 });
  let body: { client?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }
  if (!body.client) return NextResponse.json({ error: 'client is required' }, { status: 400 });

  const db = supabaseAdmin();
  const client = await loadClient(db, body.client);
  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 });
  const conn = connection(client);
  if (!conn.connected) {
    return NextResponse.json({ error: `Store not connected — set ${conn.tokenEnv} (Shopify custom app Admin API token) in Vercel` }, { status: 412 });
  }
  try {
    return NextResponse.json(await proposeForClient(db, client));
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Scan failed' }, { status: 502 });
  }
}
