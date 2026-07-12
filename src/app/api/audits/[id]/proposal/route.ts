import { NextResponse } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { supabaseServerSession } from '@/lib/supabase/server';
import { rateLimit, clientIp } from '@/lib/rateLimit';
import { generateActionProposal, proposalInputFromAudit } from '@/lib/actionProposal';
import { isAiConfigured } from '@/lib/ai';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Generate (or return the cached) systematic Action Plan Proposal for a
 * completed audit. On demand rather than inside the audit pipeline: it's a
 * heavyweight consulting-grade AI generation that not every audit needs, and
 * the audit pipeline is already close to the serverless time budget.
 * Access rules mirror GET /api/audits/[id] (owner or capability link).
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const limit = rateLimit(`proposal:${clientIp(request)}`, 4, 10 * 60 * 1000);
  if (!limit.allowed) {
    return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } });
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Proposals require persistence (Supabase not configured)' }, { status: 501 });
  }
  if (!isAiConfigured()) {
    return NextResponse.json({ error: 'AI is not configured' }, { status: 502 });
  }

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: 'Invalid audit id' }, { status: 400 });
  }

  const db = supabaseAdmin();
  const { data: row, error } = await db
    .from('seo_audits')
    .select('id, user_id, status, result_json, action_proposal')
    .eq('id', id)
    .maybeSingle();

  if (error || !row) return NextResponse.json({ error: 'Audit not found' }, { status: 404 });

  if (row.user_id) {
    const user = await supabaseServerSession();
    if (!user || user.id !== row.user_id) {
      return NextResponse.json({ error: 'Audit not found' }, { status: 404 });
    }
  }

  if (row.action_proposal) {
    return NextResponse.json({ proposal: row.action_proposal, cached: true });
  }

  if (row.status !== 'done' || !row.result_json?.data) {
    return NextResponse.json({ error: 'Audit is not complete yet' }, { status: 409 });
  }

  const proposal = await generateActionProposal(proposalInputFromAudit(row.result_json.data));
  if (!proposal) {
    return NextResponse.json({ error: 'Proposal generation failed — please retry' }, { status: 502 });
  }

  await db.from('seo_audits').update({ action_proposal: proposal }).eq('id', id);
  return NextResponse.json({ proposal, cached: false });
}
