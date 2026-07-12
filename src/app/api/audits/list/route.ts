import { NextResponse } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { supabaseServerSession } from '@/lib/supabase/server';
import { rateLimit, clientIp } from '@/lib/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const UUID_RE = /^[0-9a-f-]{36}$/i;

/**
 * List audits for the Reports dashboard (/reports).
 *
 * Two access modes, matching the app's existing capability-link privacy
 * model (same one /api/audits/[id] and Share already use):
 *  - Signed in: return this user's own persisted audits (RLS-equivalent
 *    filter by user_id, applied here since we're on the service-role client).
 *  - Anonymous: the caller must already know which audits are "theirs" (their
 *    browser's localStorage — see src/lib/history.ts), and passes those ids
 *    via ?ids=. We never enumerate anonymous audits by anyone else's ids —
 *    only the exact ids supplied are looked up, same as fetching one report
 *    by its unguessable id directly.
 */
export async function GET(request: Request) {
  const limit = rateLimit(`audits-list:${clientIp(request)}`, 30, 60 * 1000);
  if (!limit.allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ audits: [] });
  }

  const db = supabaseAdmin();
  const user = await supabaseServerSession();

  if (user) {
    const { data, error } = await db
      .from('seo_audits')
      .select('id, url, domain, status, overall_score, geo_score, visibility_pct, projected_score, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(30);
    if (error) return NextResponse.json({ error: 'Failed to load reports' }, { status: 500 });
    return NextResponse.json({ audits: data ?? [] });
  }

  const idsParam = new URL(request.url).searchParams.get('ids') ?? '';
  const ids = idsParam.split(',').map((s) => s.trim()).filter((s) => UUID_RE.test(s)).slice(0, 30);
  if (ids.length === 0) return NextResponse.json({ audits: [] });

  const { data, error } = await db
    .from('seo_audits')
    .select('id, url, domain, status, overall_score, geo_score, visibility_pct, projected_score, created_at')
    .in('id', ids)
    .is('user_id', null) // never leak a signed-in user's audit via a guessed anon lookup
    .order('created_at', { ascending: false });
  if (error) return NextResponse.json({ error: 'Failed to load reports' }, { status: 500 });
  return NextResponse.json({ audits: data ?? [] });
}
