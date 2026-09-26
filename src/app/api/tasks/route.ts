import { NextResponse } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { requireOperator } from '@/lib/operator';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/tasks?domain=us.tcl.com[&status=open|all] — the persistent
 * SEO/GEO task list for a site (operator-only). Default: open tasks
 * (todo + in_progress) plus anything verified done in the last 30 days, so
 * the operator sees what the agent auto-closed.
 */
export async function GET(request: Request) {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: 'Supabase not configured' }, { status: 501 });
  if (!(await requireOperator())) return NextResponse.json({ error: 'Sign in as an operator to view the task list' }, { status: 401 });

  const params = new URL(request.url).searchParams;
  const domain = params.get('domain')?.trim().toLowerCase();
  if (!domain) return NextResponse.json({ error: 'domain is required' }, { status: 400 });

  const db = supabaseAdmin();
  const { data, error } = await db
    .from('seo_tasks')
    .select('id, track, source, section, title, detail, priority, effort, impact, status, auto_verifiable, verify, affected_urls, affected_count, verified_at, created_at, updated_at, last_audit_id')
    .eq('domain', domain)
    .order('priority', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(500);
  if (error) return NextResponse.json({ error: 'Failed to load tasks' }, { status: 500 });

  const cutoff = Date.now() - 30 * 24 * 3600 * 1000;
  const all = params.get('status') === 'all';
  const tasks = (data ?? []).filter(
    (t) => all || t.status === 'todo' || t.status === 'in_progress' || (t.status === 'done' && t.verified_at && Date.parse(t.verified_at) > cutoff),
  );
  const counts = (data ?? []).reduce<Record<string, number>>((acc, t) => ({ ...acc, [t.status]: (acc[t.status] ?? 0) + 1 }), {});
  return NextResponse.json({ domain, tasks, counts });
}
