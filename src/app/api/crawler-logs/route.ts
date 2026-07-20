import { NextResponse } from 'next/server';
import { parseLogDrainPayload, filterAiCrawlerHits, saveCrawlerHits, getCrawlerStats } from '@/lib/crawlerAnalytics';
import { supabaseServerSession } from '@/lib/supabase/server';
import { rateLimit, clientIp } from '@/lib/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/crawler-logs
 *
 * Ingestion endpoint for a Vercel Log Drain (or a generic { entries } test
 * payload). Configure a Log Drain in the Vercel project pointing here with
 * header `x-crawler-secret: <CRAWLER_LOGS_SECRET>` — see wiring notes.
 *
 * Auth is the shared secret only (log drains can't do interactive/session
 * auth), so this route never trusts a domain/user from the body beyond what
 * gets parsed out of the log entries themselves.
 */
export async function POST(request: Request) {
  const secret = process.env.CRAWLER_LOGS_SECRET;
  const provided = request.headers.get('x-crawler-secret');
  if (!secret || !provided || provided !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const limit = rateLimit(`crawler-logs:${clientIp(request)}`, 60, 60 * 1000);
  if (!limit.allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const domain = new URL(request.url).searchParams.get('domain') ?? undefined;

  const entries = parseLogDrainPayload(body);
  const hits = filterAiCrawlerHits(entries);
  const saved = await saveCrawlerHits(hits, domain);

  return NextResponse.json({ received: entries.length, matched: hits.length, saved });
}

/**
 * GET /api/crawler-logs?domain=&days=
 *
 * Stats read. Accessible either via a signed-in Supabase session (matching
 * other dashboard routes) or the same shared secret used for ingestion, so
 * an external dashboard/script can pull stats without a browser session.
 */
export async function GET(request: Request) {
  const limit = rateLimit(`crawler-logs-get:${clientIp(request)}`, 30, 60 * 1000);
  if (!limit.allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } });
  }

  const secret = process.env.CRAWLER_LOGS_SECRET;
  const provided = request.headers.get('x-crawler-secret');
  const secretOk = !!secret && !!provided && provided === secret;

  if (!secretOk) {
    const user = await supabaseServerSession();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const url = new URL(request.url);
  const domain = url.searchParams.get('domain') ?? undefined;
  const daysParam = url.searchParams.get('days');
  const days = daysParam ? Number(daysParam) : undefined;

  const stats = await getCrawlerStats({ domain, days: days && !isNaN(days) ? days : undefined });
  return NextResponse.json(stats);
}
