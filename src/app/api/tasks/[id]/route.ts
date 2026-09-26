import { NextResponse } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { requireOperator } from '@/lib/operator';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STATUSES = new Set(['todo', 'in_progress', 'done', 'dismissed']);

/** PATCH /api/tasks/[id] { status } — operator moves a task through its workflow. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: 'Supabase not configured' }, { status: 501 });
  if (!(await requireOperator())) return NextResponse.json({ error: 'Sign in as an operator' }, { status: 401 });

  const { id } = await params;
  let body: { status?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  if (!body.status || !STATUSES.has(body.status)) {
    return NextResponse.json({ error: 'status must be one of todo, in_progress, done, dismissed' }, { status: 400 });
  }

  const db = supabaseAdmin();
  const { data, error } = await db
    .from('seo_tasks')
    .update({
      status: body.status,
      updated_at: new Date().toISOString(),
      // Manual "done" is operator-asserted, not agent-verified.
      ...(body.status === 'done' ? {} : { verified_at: null }),
    })
    .eq('id', id)
    .select('id, status')
    .maybeSingle();
  if (error) return NextResponse.json({ error: 'Failed to update task' }, { status: 500 });
  if (!data) return NextResponse.json({ error: 'Task not found' }, { status: 404 });
  return NextResponse.json({ task: data });
}
