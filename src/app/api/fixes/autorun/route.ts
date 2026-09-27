import { NextResponse } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { requireOperator } from '@/lib/operator';
import { connection, loadClient } from '@/lib/fixStore';
import { dispatchAutoFix } from '@/lib/autoFixDispatch';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** POST /api/fixes/autorun { client } — "Scan & fix now" (operator). */
export async function POST(request: Request) {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: 'Supabase not configured' }, { status: 501 });
  if (!(await requireOperator())) return NextResponse.json({ error: 'Sign in as an operator' }, { status: 401 });
  let body: { client?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }
  const db = supabaseAdmin();
  const client = body.client ? await loadClient(db, body.client) : null;
  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 });
  if (!(await connection(db, client)).connected) return NextResponse.json({ error: 'Store not connected' }, { status: 412 });
  const r = await dispatchAutoFix(new URL(request.url).origin, client.id, { scan: true });
  return NextResponse.json(r, { status: r.ok ? 202 : 502 });
}
