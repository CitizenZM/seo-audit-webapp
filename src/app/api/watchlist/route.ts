import { NextResponse } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { supabaseServerSession } from '@/lib/supabase/server';
import { normalizeUrl } from '@/lib/runAudit';
import { rateLimit, clientIp } from '@/lib/rateLimit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Per-user monitoring watchlist, backed by Supabase. Replaces the static
 * WATCHLIST env var the cron job used to read — that meant lastScore never
 * persisted (B4: it silently emailed every run instead of only on change).
 * Real rows let the cron job update last_score after every check, so change
 * detection actually works now.
 *
 * All routes require a signed-in session — a watchlist is inherently a
 * per-user feature (someone has to own the alert emails).
 */

export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Watchlist requires Supabase to be configured' }, { status: 501 });
  }
  const user = await supabaseServerSession();
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });

  const db = supabaseAdmin();
  const { data, error } = await db
    .from('seo_watchlist')
    .select('id, url, email, last_score, last_checked_at, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) return NextResponse.json({ error: 'Failed to load watchlist' }, { status: 500 });
  return NextResponse.json({ items: data });
}

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Watchlist requires Supabase to be configured' }, { status: 501 });
  }
  const limit = rateLimit(`watchlist-write:${clientIp(request)}`, 10, 60 * 1000);
  if (!limit.allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  const user = await supabaseServerSession();
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });

  let body: { url?: string; email?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }
  if (!body.url) return NextResponse.json({ error: 'URL is required' }, { status: 400 });

  let normalized: string;
  try {
    normalized = normalizeUrl(body.url);
    new URL(normalized);
  } catch {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
  }

  const email = body.email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(body.email) ? body.email : user.email;
  if (!email) return NextResponse.json({ error: 'No email available for alerts' }, { status: 400 });

  const db = supabaseAdmin();
  const { data, error } = await db
    .from('seo_watchlist')
    .upsert({ user_id: user.id, url: normalized, email }, { onConflict: 'user_id,url' })
    .select('id, url, email, last_score, last_checked_at, created_at')
    .single();

  if (error) return NextResponse.json({ error: 'Failed to add to watchlist' }, { status: 500 });
  return NextResponse.json({ item: data });
}

export async function DELETE(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Watchlist requires Supabase to be configured' }, { status: 501 });
  }
  const user = await supabaseServerSession();
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  const db = supabaseAdmin();
  const { error } = await db.from('seo_watchlist').delete().eq('id', id).eq('user_id', user.id);
  if (error) return NextResponse.json({ error: 'Failed to remove' }, { status: 500 });
  return NextResponse.json({ success: true });
}
