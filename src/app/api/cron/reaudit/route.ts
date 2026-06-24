import { NextResponse } from 'next/server';
import { sendReportEmail } from '@/lib/email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Scheduled re-audit (#7). Runs on a Vercel Cron (see vercel.json) and re-audits
 * a watchlist, emailing the owner when the score changes.
 *
 * Watchlist source: WATCHLIST env var — a JSON array of { url, email, lastScore? }.
 * (Production upgrade: store the watchlist + history per user in Supabase so each
 * user manages their own monitors. This env-based list is the no-DB stand-in.)
 *
 * Secured by CRON_SECRET: Vercel Cron sends `Authorization: Bearer <CRON_SECRET>`.
 */
export async function GET(request: Request) {
  const auth = request.headers.get('authorization');
  if (process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) {
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
      const score = json?.data?.technical?.mobileSpeedScore ?? 0;
      const domain = json?.data?.domain ?? new URL(item.url).hostname;

      // Email only on a meaningful change (or first run).
      const changed = item.lastScore == null || Math.abs(score - item.lastScore) >= 1;
      if (changed && item.email) {
        await sendReportEmail({
          to: item.email,
          url: item.url,
          domain,
          score,
          previousScore: item.lastScore ?? null,
          reportUrl: `${origin}/dashboard?url=${encodeURIComponent(item.url)}`,
        });
      }
      results.push({ url: item.url, score, emailed: changed });
    } catch (e) {
      results.push({ url: item.url, error: e instanceof Error ? e.message : 'failed' });
    }
  }

  return NextResponse.json({ success: true, audited: results.length, results });
}
