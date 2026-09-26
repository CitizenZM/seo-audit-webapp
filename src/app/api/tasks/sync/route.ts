import { NextResponse } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { requireOperator } from '@/lib/operator';
import { isInternalCall } from '@/lib/auditJobs';
import { syncTasksForAudit } from '@/lib/taskSync';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/tasks/sync { auditId } — (re)build the task list from a stored
 * audit (backfill, or re-sync after a rules change). Operator session or
 * internal bearer secret.
 */
export async function POST(request: Request) {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: 'Supabase not configured' }, { status: 501 });
  if (!isInternalCall(request) && !(await requireOperator())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  let body: { auditId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!body.auditId) return NextResponse.json({ error: 'auditId is required' }, { status: 400 });

  const db = supabaseAdmin();
  const { data: audit, error } = await db
    .from('seo_audits')
    .select('id, domain, client_id, status, result_json')
    .eq('id', body.auditId)
    .maybeSingle();
  if (error) return NextResponse.json({ error: 'Failed to load audit' }, { status: 500 });
  if (!audit || audit.status !== 'done' || !audit.result_json) {
    return NextResponse.json({ error: 'Audit not found or not completed' }, { status: 404 });
  }

  const summary = await syncTasksForAudit(db, {
    auditId: audit.id,
    domain: audit.domain,
    clientId: audit.client_id,
    data: (audit.result_json as { data?: unknown }).data,
  });
  return NextResponse.json(summary, { status: summary.ok ? 200 : 500 });
}
