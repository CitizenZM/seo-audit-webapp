import { NextResponse } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { rateLimit, clientIp } from '@/lib/rateLimit';
import { normalizeUrl } from '@/lib/runAudit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Client account system (workspace organization, NOT auth — see /clients and
 * /client/[slug] page comments). Slugs are guessable UUID-free strings by
 * design; this is a deliberate product decision, not an oversight, since
 * there's no login system to gate access behind.
 */

/** Derive a URL-safe slug from a domain: lowercase, non-alnum → '-', trimmed. */
function slugify(domain: string): string {
  return domain
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

interface AuditAgg {
  overall_score: number | null;
  geo_score: number | null;
  visibility_pct: number | null;
  projected_score: number | null;
  created_at: string;
  client_id: string;
  status: string;
}

/**
 * GET /api/clients — list every client with an aggregate of their audits:
 * latest done audit's scores, total run count, last run date. One round
 * trip: fetch clients, fetch all their audits, aggregate in JS.
 */
export async function GET() {
  if (!isSupabaseConfigured()) return NextResponse.json({ clients: [] });

  const db = supabaseAdmin();
  const { data: clients, error: clientsError } = await db
    .from('seo_clients')
    .select('id, slug, name, domain, url, created_at')
    .order('created_at', { ascending: false });

  if (clientsError) return NextResponse.json({ error: 'Failed to load clients' }, { status: 500 });
  if (!clients || clients.length === 0) return NextResponse.json({ clients: [] });

  const clientIds = clients.map((c) => c.id);
  const { data: audits, error: auditsError } = await db
    .from('seo_audits')
    .select('overall_score, geo_score, visibility_pct, projected_score, created_at, client_id, status')
    .in('client_id', clientIds)
    .order('created_at', { ascending: false });

  if (auditsError) return NextResponse.json({ error: 'Failed to load audit history' }, { status: 500 });

  const byClient = new Map<string, AuditAgg[]>();
  for (const a of (audits ?? []) as AuditAgg[]) {
    const list = byClient.get(a.client_id) ?? [];
    list.push(a);
    byClient.set(a.client_id, list);
  }

  const result = clients.map((c) => {
    const runs = byClient.get(c.id) ?? [];
    const latestDone = runs.find((r) => r.status === 'done');
    return {
      id: c.id,
      slug: c.slug,
      name: c.name,
      domain: c.domain,
      url: c.url,
      createdAt: c.created_at,
      runCount: runs.length,
      lastRunAt: runs[0]?.created_at ?? null,
      latest: latestDone
        ? {
            overallScore: latestDone.overall_score,
            geoScore: latestDone.geo_score,
            visibilityPct: latestDone.visibility_pct,
            projectedScore: latestDone.projected_score,
          }
        : null,
    };
  });

  return NextResponse.json({ clients: result });
}

/**
 * POST /api/clients — create a client from {name, url}. Derives domain from
 * the URL and slug from the domain. On slug conflict, returns the existing
 * row (200) rather than erroring, since re-adding an existing client from
 * the UI is a common no-op action, not a bug.
 */
export async function POST(request: Request) {
  const limit = rateLimit(`clients-create:${clientIp(request)}`, 5, 10 * 60 * 1000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait before adding another client.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
    );
  }

  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Client accounts are unavailable (Supabase not configured)' }, { status: 501 });
  }

  let body: { name?: string; url?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const name = (body.name ?? '').trim();
  if (!name) return NextResponse.json({ error: 'Client name is required' }, { status: 400 });
  if (!body.url) return NextResponse.json({ error: 'URL is required' }, { status: 400 });

  let normalized: string;
  let domain: string;
  try {
    normalized = normalizeUrl(body.url);
    domain = new URL(normalized).hostname;
  } catch {
    return NextResponse.json({ error: 'Invalid URL provided' }, { status: 400 });
  }

  const slug = slugify(domain);
  if (!slug) return NextResponse.json({ error: 'Could not derive a slug from that URL' }, { status: 400 });

  const db = supabaseAdmin();

  const { data: inserted, error: insertError } = await db
    .from('seo_clients')
    .insert({ slug, name, domain, url: normalized })
    .select('id, slug, name, domain, url, created_at')
    .single();

  if (!insertError && inserted) {
    return NextResponse.json({ client: inserted }, { status: 201 });
  }

  // Unique-violation on slug: return the existing row instead of erroring.
  if (insertError?.code === '23505') {
    const { data: existing, error: fetchError } = await db
      .from('seo_clients')
      .select('id, slug, name, domain, url, created_at')
      .eq('slug', slug)
      .maybeSingle();
    if (!fetchError && existing) {
      return NextResponse.json({ client: existing }, { status: 200 });
    }
  }

  console.error('Failed to create client:', insertError);
  return NextResponse.json({ error: 'Failed to create client' }, { status: 500 });
}
