import { createClient } from '@supabase/supabase-js';

/**
 * Server-only Supabase client using the service role key.
 *
 * This is the ONLY way the app reads/writes seo_audits / seo_watchlist — those
 * tables have RLS enabled with zero policies, so the anon/publishable key
 * (used by the browser auth client) gets nothing. The service role key
 * bypasses RLS entirely, so every query here MUST filter by user_id itself;
 * there is no database-level backstop once you're using this client.
 *
 * NEVER import this file from a 'use client' component or expose
 * SUPABASE_SERVICE_ROLE_KEY to the browser.
 */
export function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Supabase is not configured (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)');
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

/** True when Supabase persistence is configured — callers should degrade gracefully otherwise. */
export function isSupabaseConfigured(): boolean {
  return !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}
