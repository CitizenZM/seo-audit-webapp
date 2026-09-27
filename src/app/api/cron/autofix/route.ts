import { NextResponse } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { isInternalCall } from '@/lib/auditJobs';
import { dispatchAutoFix } from '@/lib/autoFixDispatch';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Daily: re-scan every connected store in auto mode and apply new fixes. */
export async function GET(request: Request) {
  if (!isInternalCall(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isSupabaseConfigured()) return NextResponse.json({ error: 'Supabase not configured' }, { status: 501 });
  const db = supabaseAdmin();
  const { data } = await db.from('seo_shop_connections').select('client_id').eq('status', 'connected').eq('auto_apply', true);
  const origin = new URL(request.url).origin;
  const results = await Promise.all((data ?? []).map((c: { client_id: string }) => dispatchAutoFix(origin, c.client_id, { scan: true })));
  return NextResponse.json({ dispatched: results.filter((r) => r.ok).length, total: results.length });
}
