'use client';

import { createBrowserClient } from '@supabase/ssr';

/**
 * Browser-side Supabase client for Auth ONLY (sign in/out, session).
 * Uses the publishable/anon key — safe to ship to the client. This client
 * never touches seo_audits/seo_watchlist directly; all data access goes
 * through our own API routes (see src/lib/supabase/admin.ts).
 */
export function supabaseBrowser() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error('Supabase auth is not configured (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY)');
  }
  return createBrowserClient(url, key);
}
