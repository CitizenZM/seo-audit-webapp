import { NextResponse, after } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { isInternalCall } from '@/lib/auditJobs';
import { autoFixDeps, runAutoFixBatch } from '@/lib/autoFix';
import { dispatchAutoFix } from '@/lib/autoFixDispatch';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const MAX_HOPS = 10;

/**
 * Auto-fix worker (internal). One time-boxed batch per invocation; if fixes
 * remain it chains itself (up to MAX_HOPS) so large catalogs finish without
 * any single function exceeding its limit. Records the run on the connection.
 */
export async function POST(request: Request) {
  if (!isInternalCall(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isSupabaseConfigured()) return NextResponse.json({ error: 'Supabase not configured' }, { status: 501 });
  let body: { clientId?: string; scan?: boolean; hop?: number };
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }
  if (!body.clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 });

  const db = supabaseAdmin();
  const origin = new URL(request.url).origin;
  const { data: client } = await db.from('seo_clients').select('id, slug, name, domain, platform, shop_domain').eq('id', body.clientId).maybeSingle();
  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 });
  const hop = body.hop ?? 0;

  after(async () => {
    const started = new Date().toISOString();
    let result;
    try {
      result = await runAutoFixBatch(autoFixDeps(db, client), { deadline: Date.now() + 240_000, scan: Boolean(body.scan) });
    } catch (e) {
      result = { error: e instanceof Error ? e.message : 'auto-fix failed' };
    }
    await db.from('seo_shop_connections').update({ last_run_at: started, last_run: { ...result, hop }, updated_at: new Date().toISOString() }).eq('client_id', client.id);
    const r = result as { remaining?: number; halted?: string };
    if (r.remaining && r.remaining > 0 && !r.halted && hop + 1 < MAX_HOPS) {
      await dispatchAutoFix(origin, client.id, { scan: false, hop: hop + 1 });
    }
  });
  return NextResponse.json({ accepted: true, clientId: client.id, hop }, { status: 202 });
}
