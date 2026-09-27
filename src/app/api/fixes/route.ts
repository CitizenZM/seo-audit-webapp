import { NextResponse } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { requireOperator } from '@/lib/operator';
import { connection, loadClient, FIX_COLUMNS } from '@/lib/fixStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/fixes?client=<slug> — the implementation queue for a client (operator-only). */
export async function GET(request: Request) {
  if (!isSupabaseConfigured()) return NextResponse.json({ error: 'Supabase not configured' }, { status: 501 });
  if (!(await requireOperator())) return NextResponse.json({ error: 'Sign in as an operator' }, { status: 401 });
  const slug = new URL(request.url).searchParams.get('client');
  if (!slug) return NextResponse.json({ error: 'client is required' }, { status: 400 });

  const db = supabaseAdmin();
  const client = await loadClient(db, slug);
  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 });

  const { data, error } = await db
    .from('seo_fixes')
    .select(FIX_COLUMNS)
    .eq('client_id', client.id)
    .order('created_at', { ascending: false })
    .limit(1000);
  if (error) return NextResponse.json({ error: 'Failed to load fixes' }, { status: 500 });

  const counts = (data ?? []).reduce<Record<string, number>>((acc, f: { status: string }) => ({ ...acc, [f.status]: (acc[f.status] ?? 0) + 1 }), {});
  return NextResponse.json({ client: await connection(db, client), fixes: data ?? [], counts });
}
