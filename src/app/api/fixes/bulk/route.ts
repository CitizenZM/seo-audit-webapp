import { NextResponse } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { requireOperator } from '@/lib/operator';
import { actOnFix } from '@/lib/fixStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * POST /api/fixes/bulk { ids, action: 'approve' } — applies sequentially (Shopify
 * rate limits), each with its own second check. Capped at 100 per call.
 */
export async function POST(request: Request) {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: 'Supabase not configured' }, { status: 501 });
  const operator = await requireOperator();
  if (!operator) return NextResponse.json({ error: 'Sign in as an operator' }, { status: 401 });
  let body: { ids?: string[]; action?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }
  if (body.action !== 'approve' || !Array.isArray(body.ids) || body.ids.length === 0) {
    return NextResponse.json({ error: "ids[] and action 'approve' are required" }, { status: 400 });
  }
  const db = supabaseAdmin();
  const results: { id: string; status: string; error?: string }[] = [];
  for (const id of body.ids.slice(0, 100)) {
    const r = await actOnFix(db, id, 'approve', { operator: operator.email ?? operator.id });
    if ('error' in r) results.push({ id, status: 'error', error: r.error });
    else results.push({ id, status: (r.fix as { status: string } | null)?.status ?? 'unknown', error: (r.fix as { error?: string } | null)?.error ?? undefined });
  }
  return NextResponse.json({ results });
}
