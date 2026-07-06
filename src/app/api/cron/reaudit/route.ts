import { NextResponse } from 'next/server';
import { sendReportEmail } from '@/lib/email';
import { runAudit, UnsafeUrlError } from '@/lib/runAudit';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Scheduled re-audit (#7). Runs on a Vercel Cron (see vercel.json) and
 * re-audits every seo_watchlist row, emailing only when the composite
 * overallScore has actually moved since the last check.
 *
 * (B4, now fully fixed) The original version claimed to "only email on
 * change" but couldn't — the watchlist lived in a static WATCHLIST env var,
 * so last_score never persisted between runs and it silently emailed every
 * time regardless. Real rows in seo_watchlist (see /api/watchlist) let this
 * job read AND write last_score/last_checked_at, so change detection is now
 * genuine. Falls back to the WATCHLIST env var only when Supabase isn't
 * configured, as a no-DB stand-in (same caveat as before applies there).
 *
 * Secured by CRON_SECRET: Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`.
 * (S4) If CRON_SECRET isn't configured, this endpoint refuses to run rather
 * than silently operating unauthenticated.
 */
export async function GET(request: Request) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json(
      { error: 'CRON_SECRET is not configured — refusing to run an unauthenticated cron endpoint.' },
      { status: 500 },
    );
  }
  const auth = request.headers.get('authorization');
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const origin = new URL(request.url).origin;
  const results: { url: string; score: number | null; emailed: boolean; error?: string }[] = [];

  if (isSupabaseConfigured()) {
    const db = supabaseAdmin();
    const { data: watchlist, error } = await db
      .from('seo_watchlist')
      .select('id, url, email, last_score');

    if (error) {
      return NextResponse.json({ error: 'Failed to load watchlist' }, { status: 500 });
    }
    if (!watchlist || watchlist.length === 0) {
      return NextResponse.json({ success: true, message: 'Watchlist empty — nothing to do.' });
    }

    for (const item of watchlist) {
      try {
        const { data } = await runAudit(item.url, undefined);
        const score = data.overallScore ?? null;
        // Genuine change detection: last_score is a real persisted value now.
        const changed = item.last_score == null || (score != null && Math.abs(score - item.last_score) >= 1);

        if (changed && item.email) {
          await sendReportEmail({
            to: item.email,
            url: item.url,
            domain: data.domain,
            score,
            previousScore: item.last_score ?? null,
            reportUrl: `${origin}/dashboard?url=${encodeURIComponent(item.url)}`,
          });
        }

        await db
          .from('seo_watchlist')
          .update({ last_score: score, last_checked_at: new Date().toISOString() })
          .eq('id', item.id);

        results.push({ url: item.url, score, emailed: changed && !!item.email });
      } catch (e) {
        const message = e instanceof UnsafeUrlError ? e.message : e instanceof Error ? e.message : 'failed';
        results.push({ url: item.url, score: null, emailed: false, error: message });
      }
    }

    return NextResponse.json({ success: true, audited: results.length, results });
  }

  // No-DB fallback: static env watchlist, no persisted change detection.
  let envWatchlist: { url: string; email: string; lastScore?: number }[] = [];
  try {
    envWatchlist = JSON.parse(process.env.WATCHLIST || '[]');
  } catch {
    return NextResponse.json({ error: 'Invalid WATCHLIST env' }, { status: 500 });
  }
  if (envWatchlist.length === 0) {
    return NextResponse.json({ success: true, message: 'Watchlist empty — nothing to do.' });
  }

  for (const item of envWatchlist) {
    try {
      const { data } = await runAudit(item.url, undefined);
      const score = data.overallScore ?? null;
      if (item.email) {
        await sendReportEmail({
          to: item.email,
          url: item.url,
          domain: data.domain,
          score,
          previousScore: item.lastScore ?? null,
          reportUrl: `${origin}/dashboard?url=${encodeURIComponent(item.url)}`,
        });
      }
      results.push({ url: item.url, score, emailed: !!item.email });
    } catch (e) {
      const message = e instanceof UnsafeUrlError ? e.message : e instanceof Error ? e.message : 'failed';
      results.push({ url: item.url, score: null, emailed: false, error: message });
    }
  }

  return NextResponse.json({ success: true, audited: results.length, results });
}
