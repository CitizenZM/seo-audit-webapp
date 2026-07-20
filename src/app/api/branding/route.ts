import { NextResponse } from 'next/server';
import { supabaseAdmin, isSupabaseConfigured } from '@/lib/supabase/admin';
import { supabaseServerSession } from '@/lib/supabase/server';
import { sanitizeBranding } from '@/lib/branding';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Per-user white-label report branding (#10 agency feature), backed by
 * `agency_branding`. Mirrors the auth/graceful-degradation shape of
 * /api/watchlist: 501 when Supabase isn't configured, 401 when signed out.
 *
 * BrandingSettings.tsx falls back to localStorage when either of those
 * happens, so the feature still works for signed-out / no-Supabase setups —
 * this route only persists it across devices/sessions for signed-in users.
 */

export async function GET() {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Branding requires Supabase to be configured' }, { status: 501 });
  }
  const user = await supabaseServerSession();
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });

  const db = supabaseAdmin();
  const { data, error } = await db
    .from('agency_branding')
    .select('branding, updated_at')
    .eq('user_id', user.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: 'Failed to load branding' }, { status: 500 });
  return NextResponse.json({ branding: data?.branding ?? {}, updatedAt: data?.updated_at ?? null });
}

export async function PUT(request: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'Branding requires Supabase to be configured' }, { status: 501 });
  }
  const user = await supabaseServerSession();
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const branding = sanitizeBranding(body);

  const db = supabaseAdmin();
  const { data, error } = await db
    .from('agency_branding')
    .upsert({ user_id: user.id, branding, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
    .select('branding, updated_at')
    .single();

  if (error) return NextResponse.json({ error: 'Failed to save branding' }, { status: 500 });
  return NextResponse.json({ branding: data.branding, updatedAt: data.updated_at });
}
