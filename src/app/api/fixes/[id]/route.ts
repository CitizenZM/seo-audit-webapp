import { NextResponse } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { requireOperator } from '@/lib/operator';
import { actOnFix } from '@/lib/fixStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/fixes/[id] { action: 'approve', value? } | { action: 'reject' } | { action: 'rollback' }
 * Approve = write to Shopify + mandatory second check (re-read & compare).
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: 'Supabase not configured' }, { status: 501 });
  const operator = await requireOperator();
  if (!operator) return NextResponse.json({ error: 'Sign in as an operator' }, { status: 401 });
  const { id } = await params;
  let body: { action?: string; value?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }
  if (body.action !== 'approve' && body.action !== 'reject' && body.action !== 'rollback') {
    return NextResponse.json({ error: 'action must be approve, reject or rollback' }, { status: 400 });
  }
  const r = await actOnFix(supabaseAdmin(), id, body.action, { operator: operator.email ?? operator.id, value: body.value });
  if ('error' in r) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ fix: r.fix });
}
