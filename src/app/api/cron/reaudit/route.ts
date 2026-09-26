import { NextResponse } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { createAuditJob, isInternalCall } from '@/lib/auditJobs';
import { normalizeUrl } from '@/lib/runAudit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Weekly scheduler (Vercel Cron, see vercel.json). Fans out one audit job
 * per site — every seo_clients row plus every seo_watchlist URL, deduped —
 * and dispatches each to the /api/jobs/run worker. Dispatch is fast (the
 * worker answers 202 and runs in its own invocation), so this function
 * never approaches its time limit regardless of client count.
 *
 * Replaces the previous design, which ran every site's full audit serially
 * inside this single 60s function (could not finish even one site) and
 * never ran at all in production because CRON_SECRET was unset.
 *
 * Secured by CRON_SECRET (Vercel Cron sends `Authorization: Bearer ...`);
 * fails closed when unset.
 */
export async function GET(request: Request) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'CRON_SECRET is not configured — refusing to run.' }, { status: 500 });
  }
  if (!isInternalCall(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isSupabaseConfigured()) return NextResponse.json({ error: 'Supabase not configured' }, { status: 501 });

  const db = supabaseAdmin();
  const origin = new URL(request.url).origin;

  const [{ data: clients, error: cErr }, { data: watchlist, error: wErr }] = await Promise.all([
    db.from('seo_clients').select('url, domain'),
    db.from('seo_watchlist').select('id, url'),
  ]);
  if (cErr || wErr) return NextResponse.json({ error: 'Failed to load targets' }, { status: 500 });

  // Dedupe by normalized URL; a watchlist entry for a client site keeps its
  // watchlistId so the owner still gets their change email.
  const targets = new Map<string, { url: string; domain: string; watchlistId?: string }>();
  for (const c of clients ?? []) {
    try {
      const url = normalizeUrl(c.url || `https://${c.domain}`);
      targets.set(url, { url, domain: new URL(url).hostname });
    } catch { /* skip malformed */ }
  }
  for (const w of watchlist ?? []) {
    try {
      const url = normalizeUrl(w.url);
      targets.set(url, { url, domain: new URL(url).hostname, watchlistId: w.id });
    } catch { /* skip malformed */ }
  }

  const dispatched = await Promise.all(
    [...targets.values()].map(async (t) => {
      const auditId = await createAuditJob(db, { url: t.url, domain: t.domain });
      if (!auditId) return { url: t.url, ok: false, error: 'job insert failed' };
      try {
        const res = await fetch(`${origin}/api/jobs/run`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.CRON_SECRET}` },
          body: JSON.stringify({ auditId, url: t.url, watchlistId: t.watchlistId }),
        });
        return { url: t.url, auditId, ok: res.status === 202, status: res.status };
      } catch (e) {
        return { url: t.url, auditId, ok: false, error: e instanceof Error ? e.message : 'dispatch failed' };
      }
    }),
  );

  return NextResponse.json({
    success: true,
    dispatched: dispatched.filter((d) => d.ok).length,
    total: dispatched.length,
    jobs: dispatched,
  });
}
