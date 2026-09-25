import { NextResponse } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { requireOperator } from '@/lib/operator';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/clients/[slug] — client detail: the client row plus all of its
 * audits (newest first, capped 50). Operator-only (requireOperator): client data is never public.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!(await requireOperator())) return NextResponse.json({ error: 'Sign in as an operator to view client workspaces' }, { status: 401 });
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Client workspaces are unavailable (Supabase not configured)' }, { status: 501 });
  }

  const { slug } = await params;
  if (!slug) return NextResponse.json({ error: 'Slug is required' }, { status: 400 });

  const db = supabaseAdmin();

  const { data: client, error: clientError } = await db
    .from('seo_clients')
    .select('id, slug, name, domain, url, created_at')
    .eq('slug', slug)
    .maybeSingle();

  if (clientError) return NextResponse.json({ error: 'Failed to load client' }, { status: 500 });
  if (!client) return NextResponse.json({ error: 'Client not found' }, { status: 404 });

  const { data: audits, error: auditsError } = await db
    .from('seo_audits')
    .select('id, created_at, status, overall_score, geo_score, visibility_pct, projected_score')
    .eq('client_id', client.id)
    .order('created_at', { ascending: false })
    .limit(50);

  if (auditsError) return NextResponse.json({ error: 'Failed to load audit history' }, { status: 500 });

  return NextResponse.json({
    client,
    audits: (audits ?? []).map((a) => ({
      id: a.id,
      createdAt: a.created_at,
      status: a.status,
      overallScore: a.overall_score,
      geoScore: a.geo_score,
      visibilityPct: a.visibility_pct,
      projectedScore: a.projected_score,
    })),
  });
}
