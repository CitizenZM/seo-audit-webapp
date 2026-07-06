import { NextResponse } from 'next/server';
import { runAudit, UnsafeUrlError } from '@/lib/runAudit';
import { rateLimit, clientIp } from '@/lib/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60; // seconds — headless scraping + AI can be slow

/**
 * Synchronous audit endpoint. Kept for the cron re-audit job, the
 * email-report flow, and direct API callers. The dashboard itself uses the
 * async job API (/api/audits) so the UI can show real per-stage progress
 * instead of blocking on one long request — see src/lib/runAudit.ts for the
 * shared pipeline both paths call.
 */
export async function GET(request: Request) {
  // S5: this endpoint runs Puppeteer + PageSpeed + Claude — expensive per call.
  // 5 requests / 5 minutes per client is enough for real usage, not for abuse scripts.
  const limit = rateLimit(`analyze:${clientIp(request)}`, 5, 5 * 60 * 1000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait before running another audit.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
    );
  }

  const { searchParams } = new URL(request.url);
  const targetUrl = searchParams.get('url');
  const competitorsParam = searchParams.get('competitors');

  if (!targetUrl) {
    return NextResponse.json({ error: 'URL parameter is required' }, { status: 400 });
  }

  try {
    const result = await runAudit(targetUrl, competitorsParam);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    if (error instanceof UnsafeUrlError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    if (error instanceof TypeError && error.message.includes('Invalid URL')) {
      return NextResponse.json({ error: 'Invalid URL provided' }, { status: 400 });
    }
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Scraping Error:', error);
    return NextResponse.json(
      { error: 'Failed to analyze URL', details: message },
      { status: 500 },
    );
  }
}
