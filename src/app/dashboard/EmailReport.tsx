'use client';

import { useState } from 'react';
import { Mail, Loader2, CheckCircle2 } from 'lucide-react';
import { previousScore } from '@/lib/history';

export default function EmailReport({ url, domain, score }: { url: string; domain: string; score: number }) {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [msg, setMsg] = useState('');

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setStatus('sending');
    setMsg('');
    try {
      const res = await fetch('/api/email-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: email, url, domain, score, previousScore: previousScore(url) }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Failed to send');
      setStatus('sent');
    } catch (err) {
      setStatus('error');
      setMsg(err instanceof Error ? err.message : 'Failed to send');
    }
  }

  return (
    <div className="no-print card p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
      <div>
        <h3 className="text-base font-bold text-[var(--ink)] flex items-center gap-2">
          <Mail size={18} className="text-[var(--brand)]" /> Email this report
        </h3>
        <p className="text-sm text-[var(--ink-3)] mt-0.5">Send a summary + link, and get notified when the score changes.</p>
      </div>

      {status === 'sent' ? (
        <div className="flex items-center gap-2 text-[var(--pass)] font-semibold text-sm">
          <CheckCircle2 size={18} /> Sent to {email}
        </div>
      ) : (
        <form onSubmit={send} className="flex items-center gap-2 w-full sm:w-auto">
          <input
            type="email"
            required
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="flex-1 sm:w-56 px-3 h-10 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-sm text-[var(--ink)] placeholder-[var(--ink-3)] focus:outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand-soft)]"
          />
          <button
            type="submit"
            disabled={status === 'sending'}
            className="h-10 px-4 rounded-lg bg-[var(--brand)] text-white text-sm font-semibold hover:brightness-95 transition-all disabled:opacity-50 flex items-center gap-2"
          >
            {status === 'sending' ? <Loader2 size={16} className="animate-spin" /> : <Mail size={16} />}
            Send
          </button>
        </form>
      )}
      {status === 'error' && <p className="text-xs text-[var(--fail)] sm:hidden">{msg}</p>}
    </div>
  );
}
