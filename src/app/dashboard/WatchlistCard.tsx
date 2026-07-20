'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Bell, Loader2, CheckCircle2 } from 'lucide-react';
import { supabaseBrowser } from '@/lib/supabase/browser';
import Explainer from './Explainer';

export default function WatchlistCard({ url, domain }: { url: string; domain: string }) {
  const [signedIn, setSignedIn] = useState<boolean | undefined>(undefined);
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      setSignedIn(false);
      return;
    }
    supabaseBrowser().auth.getUser().then(({ data }) => setSignedIn(!!data.user));
  }, []);

  async function addToWatchlist() {
    setStatus('saving');
    setError('');
    try {
      const res = await fetch('/api/watchlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to add to watchlist');
      setStatus('saved');
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Failed to add to watchlist');
    }
  }

  return (
    <div className="no-print card p-4 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h3 className="text-base font-bold text-[var(--ink)] flex items-center gap-2">
          <Bell size={18} className="text-[var(--brand)]" /> Weekly monitoring
        </h3>
        <Explainer
          what="Domains monitored by the weekly scheduled re-audit — automatic tracking without manual runs."
          actions={['Add your main domain plus 1-2 competitors to build comparative trends.']}
        />
        <p className="text-sm text-[var(--ink-3)] mt-0.5">
          {signedIn === undefined
            ? 'Checking sign-in status…'
            : signedIn
            ? `Get emailed when ${domain}'s SEO score changes, checked weekly.`
            : 'Sign in to get emailed when this score changes, checked weekly.'}
        </p>
      </div>

      {!signedIn ? (
        <Link href="/login" className="h-11 px-4 rounded-lg border border-[var(--border)] text-sm font-medium text-[var(--ink-2)] hover:bg-[var(--surface-2)] transition-colors flex items-center justify-center">
          Sign in
        </Link>
      ) : status === 'saved' ? (
        <div className="flex items-center gap-2 text-[var(--pass)] font-semibold text-sm">
          <CheckCircle2 size={18} /> Added to watchlist
        </div>
      ) : (
        <button
          onClick={addToWatchlist}
          disabled={status === 'saving'}
          className="h-11 px-4 rounded-lg bg-[var(--brand)] text-white text-sm font-semibold hover:brightness-95 transition-all disabled:opacity-50 flex items-center gap-2"
        >
          {status === 'saving' ? <Loader2 size={16} className="animate-spin" /> : <Bell size={16} />}
          Add to watchlist
        </button>
      )}
      {status === 'error' && <p className="text-xs text-[var(--fail)]">{error}</p>}
    </div>
  );
}
