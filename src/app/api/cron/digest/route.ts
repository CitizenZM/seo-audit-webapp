import { NextResponse } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { buildDigest, isInternalCall, type DigestAudit } from '@/lib/auditJobs';
import { sendDigestEmail } from '@/lib/email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Weekly client digest (Vercel Cron, runs after the Monday re-audit fan-out
 * has had time to finish). Week-over-week SEO / GEO / AI-visibility deltas
 * per client with alerts (score drops, missed audits), emailed to the
 * OPERATOR_EMAILS allowlist when RESEND_API_KEY is set. Always returns the
 * digest as JSON so it can be inspected without email configured.
 */
export async function GET(request: Request) {
  if (!isInternalCall(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isSupabaseConfigured()) return NextResponse.json({ error: 'Supabase not configured' }, { status: 501 });

  const db = supabaseAdmin();
  const since = new Date(Date.now() - 21 * 24 * 3600 * 1000).toISOString();
  const [{ data: clients }, { data: audits, error }] = await Promise.all([
    db.from('seo_clients').select('domain, name'),
    db
      .from('seo_audits')
      .select('domain, created_at, overall_score, geo_score, visibility_pct')
      .eq('status', 'done')
      .gte('created_at', since),
  ]);
  if (error) return NextResponse.json({ error: 'Failed to load audits' }, { status: 500 });

  const domains = (clients ?? []).map((c) => c.domain as string);
  const rows = buildDigest((audits ?? []) as DigestAudit[], domains);

  const recipients = (process.env.OPERATOR_EMAILS ?? '').split(',').map((e) => e.trim()).filter(Boolean);
  const origin = new URL(request.url).origin;
  const email = recipients.length
    ? await sendDigestEmail({ to: recipients, rows, clientsUrl: `${origin}/clients` })
    : { ok: false, error: 'OPERATOR_EMAILS not configured' };

  return NextResponse.json({ success: true, clients: rows.length, alerts: rows.filter((r) => r.alert).length, email, rows });
}
