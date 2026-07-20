import { NextResponse } from 'next/server';
import { getVisibilityTrend } from '@/lib/trends';
import { supabaseServerSession } from '@/lib/supabase/server';
import { rateLimit, clientIp } from '@/lib/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/trends?domain=example.com
 *
 * Auth-optional, matching /api/audits/list: signed-in users get their own
 * trend for the domain; anonymous callers get the anonymous (user_id IS NULL)
 * trend for that domain — same privacy posture as anonymous audit rows.
 */
export async function GET(request: Request) {
  const limit = rateLimit(`trends:${clientIp(request)}`, 30, 60 * 1000);
  if (!limit.allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } });
  }

  const domain = new URL(request.url).searchParams.get('domain')?.trim();
  if (!domain) {
    return NextResponse.json({ error: 'domain is required' }, { status: 400 });
  }

  const user = await supabaseServerSession();
  const trend = await getVisibilityTrend({ domain, userId: user?.id });
  return NextResponse.json(trend);
}
