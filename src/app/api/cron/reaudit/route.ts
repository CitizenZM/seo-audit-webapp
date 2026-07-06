import { NextResponse } from 'next/server';
import { sendReportEmail } from '@/lib/email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Scheduled re-audit (#7). Runs on a Vercel Cron (see vercel.json) and re-audits
 * a watchlist, emailing a weekly report per entry.
 *
 * (B4) This always sends — it does NOT detect "score changed since last run",
 * because there is nowhere to persist `lastScore` between invocations: the
 * watchlist source is a static env var (WATCHLIST), and Vercel serverless
 * functions don't retain in-memory state across cold starts. An earlier
 * version claimed to "only email on change" but silently emailed every run
 * regardless — that was a bug, not a feature. If you hardcode `lastScore` in
 * WATCHLIST yourself, the email will show a delta against it; otherwise it
 * just reports the current score. Production upgrade: persist watchlists +
 * score history in Supabase (per-user monitors, real change detection).
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

  let watchlist: { url: string; email: string; lastScore?: number }[] = [];
  try {
    watchlist = JSON.parse(process.env.WATCHLIST || '[]');
  } catch {
    return NextResponse.json({ error: 'Invalid WATCHLIST env' }, { status: 500 });
  }
  if (watchlist.length === 0) {
    return NextResponse.json({ success: true, message: 'Watchlist empty — nothing to do.' });
  }

  const origin = new URL(request.url).origin;
  const results = [];

  for (const item of watchlist) {
    try {
      const res = await fetch(`${origin}/api/analyze?url=${encodeURIComponent(item.url)}`, {
        signal: AbortSignal.timeout(55000),
      });
      const json = await res.json();
      const score: number | null = json?.data?.technical?.mobileSpeedScore ?? null;
      const domain = json?.data?.domain ?? new URL(item.url).hostname;

      if (item.email) {
        await sendReportEmail({
          to: item.email,
          url: item.url,
          domain,
          score,
          previousScore: item.lastScore ?? null,
          reportUrl: `${origin}/dashboard?url=${encodeURIComponent(item.url)}`,
        });
      }
      results.push({ url: item.url, score, emailed: !!item.email });
    } catch (e) {
      results.push({ url: item.url, error: e instanceof Error ? e.message : 'failed' });
    }
  }

  return NextResponse.json({ success: true, audited: results.length, results });
}
