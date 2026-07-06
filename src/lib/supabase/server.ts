import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Server-side Supabase client bound to the request's cookies — used both to
 * read the caller's session (Server Components, API routes) and, in the
 * /auth/callback route, to write the session cookie after a magic-link
 * sign-in exchange.
 *
 * Never trust a user_id sent in a request body — always derive it from the
 * verified session here, since supabaseAdmin() (service role) bypasses RLS
 * and would otherwise let a client claim to be any user.
 */
export async function supabaseServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;

  const cookieStore = await cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          /* called from a Server Component render — cookies are read-only there, which is fine */
        }
      },
    },
  });
}

/** Convenience wrapper for the common case of "who is asking?" */
export async function supabaseServerSession() {
  const supabase = await supabaseServerClient();
  if (!supabase) return null;
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}
