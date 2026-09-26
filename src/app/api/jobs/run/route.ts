import { NextResponse, after } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { executeAuditJob, isInternalCall } from '@/lib/auditJobs';
import { sendReportEmail } from '@/lib/email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/**
 * Audit worker. The scheduler (/api/cron/reaudit) creates one seo_audits row
 * per site and POSTs here once per row, so every site runs in its OWN
 * function invocation with the full 300s budget — N clients in parallel
 * instead of serially inside one function. Responds 202 immediately and
 * does the work in after(). Internal only (Bearer CRON_SECRET).
 *
 * Body: { auditId, url, competitors?, watchlistId? } — watchlistId turns on
 * the per-owner "score changed" email for seo_watchlist entries.
 */
export async function POST(request: Request) {
  if (!isInternalCall(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isSupabaseConfigured()) return NextResponse.json({ error: 'Supabase not configured' }, { status: 501 });

  let body: { auditId?: string; url?: string; competitors?: string; watchlistId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const { auditId, url, competitors, watchlistId } = body;
  if (!auditId || !url) return NextResponse.json({ error: 'auditId and url are required' }, { status: 400 });

  const db = supabaseAdmin();
  const origin = new URL(request.url).origin;

  after(async () => {
    const outcome = await executeAuditJob(db, auditId, url, competitors);
    if (!watchlistId || !outcome.ok) return;

    const { data: item } = await db.from('seo_watchlist').select('id, url, email, last_score').eq('id', watchlistId).maybeSingle();
    if (!item) return;
    const score = outcome.overallScore;
    const changed = item.last_score == null || (score != null && Math.abs(score - item.last_score) >= 1);
    if (changed && item.email) {
      await sendReportEmail({
        to: item.email,
        url: item.url,
        domain: new URL(item.url).hostname,
        score,
        previousScore: item.last_score ?? null,
        reportUrl: `${origin}/dashboard?url=${encodeURIComponent(item.url)}`,
      });
    }
    await db.from('seo_watchlist').update({ last_score: score, last_checked_at: new Date().toISOString() }).eq('id', item.id);
  });

  return NextResponse.json({ accepted: true, auditId }, { status: 202 });
}
