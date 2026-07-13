'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { LogIn, LogOut, Loader2 } from 'lucide-react';
import { supabaseBrowser } from '@/lib/supabase/browser';

// Inlined at build time by Next.js — safe to read synchronously, so the
// "auth not configured" case can be the effect's *initial* state instead of
// a setState call inside the effect body (avoids cascading-render lint).
const AUTH_CONFIGURED = !!process.env.NEXT_PUBLIC_SUPABASE_URL;

export default function AccountMenu() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null | undefined>(AUTH_CONFIGURED ? undefined : null);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    if (!AUTH_CONFIGURED) return;
    let active = true;
    const supabase = supabaseBrowser();
    supabase.auth.getUser().then(({ data }) => {
      if (active) setEmail(data.user?.email ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setEmail(session?.user?.email ?? null);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  async function signOut() {
    setSigningOut(true);
    await supabaseBrowser().auth.signOut();
    router.refresh();
    setSigningOut(false);
  }

  if (email === undefined) return <div className="w-10 h-10 sm:w-20 sm:h-9 shrink-0" />; // avoid layout shift while loading

  if (!email) {
    return (
      <Link
        href="/login"
        aria-label="Sign in"
        className="flex items-center justify-center gap-1.5 w-10 h-10 sm:w-auto sm:h-9 sm:px-3 rounded-lg border border-[var(--border)] text-sm font-medium text-[var(--ink-2)] hover:bg-[var(--surface-2)] transition-colors shrink-0 whitespace-nowrap"
      >
        <LogIn size={15} /> <span className="hidden sm:inline">Sign in</span>
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-2 shrink-0">
      <span className="hidden md:inline text-xs text-[var(--ink-3)] truncate max-w-[160px]">{email}</span>
      <button
        onClick={signOut}
        disabled={signingOut}
        aria-label="Sign out"
        className="flex items-center justify-center gap-1.5 w-10 h-10 sm:w-auto sm:h-9 sm:px-3 rounded-lg border border-[var(--border)] text-sm font-medium text-[var(--ink-2)] hover:bg-[var(--surface-2)] transition-colors disabled:opacity-50 whitespace-nowrap"
      >
        {signingOut ? <Loader2 size={15} className="animate-spin" /> : <LogOut size={15} />}
        <span className="hidden sm:inline">Sign out</span>
      </button>
    </div>
  );
}
