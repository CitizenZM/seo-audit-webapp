import { NextResponse } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { supabaseServerSession } from '@/lib/supabase/server';
import { rateLimit, clientIp } from '@/lib/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Poll a job created by POST /api/audits. Access rule: a job with a user_id
 * requires the requester's session to match it; an anonymous job (user_id
 * null) is readable by anyone who has its id — the id is an unguessable
 * v4 UUID, so this is the same "capability link" model the app's own Share
 * button already relies on, not a public listing.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  // Generous but bounded — a client polling every ~2s for a ~60s job is
  // ~30 requests; this allows plenty of headroom without being wide open.
  const limit = rateLimit(`audit-poll:${clientIp(request)}`, 60, 60 * 1000);
  if (!limit.allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Job polling is unavailable (Supabase not configured)' }, { status: 501 });
  }

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: 'Invalid job id' }, { status: 400 });
  }

  const db = supabaseAdmin();
  const { data: row, error } = await db
    .from('seo_audits')
    .select('id, user_id, url, domain, status, stage, overall_score, geo_score, visibility_pct, projected_score, mobile_speed_score, result_json, error_message, created_at')
    .eq('id', id)
    .maybeSingle();

  if (error || !row) {
    return NextResponse.json({ error: 'Job not found' }, { status: 404 });
  }

  if (row.user_id) {
    const user = await supabaseServerSession();
    if (!user || user.id !== row.user_id) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }
  }

  return NextResponse.json({
    id: row.id,
    url: row.url,
    domain: row.domain,
    status: row.status,
    stage: row.stage,
    overallScore: row.overall_score,
    geoScore: row.geo_score,
    visibilityPct: row.visibility_pct,
    projectedScore: row.projected_score,
    mobileSpeedScore: row.mobile_speed_score,
    error: row.error_message,
    createdAt: row.created_at,
    // Only ship the (potentially large) full payload once the job is done.
    ...(row.status === 'done' && row.result_json ? { result: row.result_json } : {}),
  });
}
