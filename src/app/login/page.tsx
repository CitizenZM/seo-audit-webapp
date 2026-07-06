'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Mail, Loader2, CheckCircle2, Search } from 'lucide-react';
import { supabaseBrowser } from '@/lib/supabase/browser';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus('sending');
    setError('');
    try {
      const supabase = supabaseBrowser();
      const { error: authError } = await supabase.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      });
      if (authError) throw authError;
      setStatus('sent');
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Could not send sign-in link. Is Supabase Auth configured?');
    }
  }

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 bg-[var(--bg)] text-[var(--ink)]">
      <div className="inline-flex items-center gap-2 mb-8">
        <div className="w-9 h-9 rounded-lg bg-[var(--brand)] flex items-center justify-center text-white">
          <Search size={18} />
        </div>
        <span className="font-bold text-lg tracking-tight">SEO Audit</span>
      </div>

      <div className="w-full max-w-sm card p-8" style={{ boxShadow: 'var(--shadow-md)' }}>
        {status === 'sent' ? (
          <div className="text-center">
            <div className="w-12 h-12 rounded-full bg-[var(--brand-soft)] text-[var(--brand)] flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 size={22} />
            </div>
            <h1 className="text-lg font-bold mb-2">Check your email</h1>
            <p className="text-sm text-[var(--ink-3)]">We sent a sign-in link to {email}. Open it on this device to continue.</p>
          </div>
        ) : (
          <>
            <h1 className="text-lg font-bold mb-1">Sign in</h1>
            <p className="text-sm text-[var(--ink-3)] mb-6">Save audit history, get change alerts, and manage a monitoring watchlist.</p>
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[var(--ink-3)]">
                  <Mail size={16} />
                </div>
                <input
                  type="email"
                  required
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg text-sm text-[var(--ink)] placeholder-[var(--ink-3)] focus:outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand-soft)]"
                />
              </div>
              <button
                type="submit"
                disabled={status === 'sending'}
                className="flex justify-center items-center gap-2 py-2.5 rounded-lg font-semibold text-white bg-[var(--brand)] hover:brightness-95 transition-all disabled:opacity-50"
              >
                {status === 'sending' ? <Loader2 size={16} className="animate-spin" /> : <Mail size={16} />}
                Send sign-in link
              </button>
              {status === 'error' && <p className="text-xs text-[var(--fail)]">{error}</p>}
            </form>
          </>
        )}
      </div>

      <Link href="/" className="text-sm text-[var(--ink-3)] mt-6 hover:text-[var(--ink)] transition-colors">← Back to audit tool (no sign-in required)</Link>
    </main>
  );
}
