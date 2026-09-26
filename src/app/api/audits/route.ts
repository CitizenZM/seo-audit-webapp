import { NextResponse, after } from 'next/server';
import { runAudit, UnsafeUrlError, normalizeUrl } from '@/lib/runAudit';
import { createAuditJob, executeAuditJob } from '@/lib/auditJobs';
import { rateLimit, clientIp } from '@/lib/rateLimit';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { supabaseServerSession } from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// 300s (Fluid Compute ceiling): a healthy audit finishes in ~45-60s, but AI +
// cold-start latency spikes were observed to blow through both 60s and 120s,
export const maxDuration = 300;

/**
 * Real async audit job (#2, replacing the fake 2.5s progress timer). Creates
 * a seo_audits row, kicks off the actual pipeline via next/server's after()
 * so the response returns instantly, and lets the client poll
 * GET /api/audits/[id] for genuine per-stage progress.
 *
 * Falls back to running synchronously (returning the full result inline)
 * when Supabase isn't configured — there's nowhere to persist a job for
 * polling to work against, so this degrades to the old single-request
 * behavior rather than hanging forever.
 */
/**
 * Audit history for a URL (Trends): GET /api/audits?url=… returns the recent
 * completed audits' headline scores, oldest first, for trend charting.
 */
export async function GET(request: Request) {
  if (!isSupabaseConfigured()) return NextResponse.json({ history: [] });
  const url = new URL(request.url).searchParams.get('url');
  if (!url) return NextResponse.json({ error: 'url parameter required' }, { status: 400 });

  const db = supabaseAdmin();
  const { data, error } = await db
    .from('seo_audits')
    .select('created_at, overall_score, geo_score, visibility_pct')
    .eq('url', normalizeUrl(url))
    .eq('status', 'done')
    .order('created_at', { ascending: true })
    .limit(30);

  if (error) return NextResponse.json({ error: 'Failed to load history' }, { status: 500 });
  return NextResponse.json({
    history: (data ?? []).map((r) => ({
      date: r.created_at,
      overall: r.overall_score,
      geo: r.geo_score,
      visibility: r.visibility_pct,
    })),
  });
}

export async function POST(request: Request) {
  const limit = rateLimit(`analyze:${clientIp(request)}`, 5, 5 * 60 * 1000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait before running another audit.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
    );
  }

  let body: { url?: string; competitors?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
  if (!body.url) {
    return NextResponse.json({ error: 'URL is required' }, { status: 400 });
  }

  let normalized: string;
  let domain: string;
  try {
    normalized = normalizeUrl(body.url);
    domain = new URL(normalized).hostname;
  } catch {
    return NextResponse.json({ error: 'Invalid URL provided' }, { status: 400 });
  }

  if (!isSupabaseConfigured()) {
    // No persistence available — run inline and return the full result so
    // the client can render immediately without a job to poll.
    try {
      const result = await runAudit(normalized, body.competitors);
      return NextResponse.json({ id: null, status: 'done', ...result });
    } catch (error) {
      if (error instanceof UnsafeUrlError) return NextResponse.json({ error: error.message }, { status: 400 });
      return NextResponse.json({ error: 'Failed to analyze URL', details: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
    }
  }

  const user = await supabaseServerSession();
  const db = supabaseAdmin();

  const auditId = await createAuditJob(db, { url: normalized, domain, competitors: body.competitors, userId: user?.id ?? null });
  if (!auditId) return NextResponse.json({ error: 'Failed to create audit job' }, { status: 500 });

  // Run the actual work after the response is sent — the function invocation
  // stays alive (up to maxDuration) while this executes, so the progress
  // written to seo_audits is real, not simulated.
  after(() => executeAuditJob(db, auditId, normalized, body.competitors));

  return NextResponse.json({ id: auditId, status: 'queued' });
}
