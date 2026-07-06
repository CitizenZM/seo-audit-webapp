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

  if (email === undefined) return <div className="w-20 h-8" />; // avoid layout shift while loading

  if (!email) {
    return (
      <Link href="/login" className="flex items-center gap-1.5 h-9 px-3 rounded-lg border border-[var(--border)] text-sm font-medium text-[var(--ink-2)] hover:bg-[var(--surface-2)] transition-colors">
        <LogIn size={15} /> Sign in
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="hidden md:inline text-xs text-[var(--ink-3)] truncate max-w-[160px]">{email}</span>
      <button
        onClick={signOut}
        disabled={signingOut}
        className="flex items-center gap-1.5 h-9 px-3 rounded-lg border border-[var(--border)] text-sm font-medium text-[var(--ink-2)] hover:bg-[var(--surface-2)] transition-colors disabled:opacity-50"
      >
        {signingOut ? <Loader2 size={15} className="animate-spin" /> : <LogOut size={15} />}
        Sign out
      </button>
    </div>
  );
}
