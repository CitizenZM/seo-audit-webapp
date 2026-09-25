'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { BarChart3, Search, Loader2, Users, ArrowRight, Plus } from 'lucide-react';

interface ClientRow {
  id: string;
  slug: string;
  name: string;
  domain: string;
  url: string;
  createdAt: string;
  runCount: number;
  lastRunAt: string | null;
  latest: {
    overallScore: number | null;
    geoScore: number | null;
    visibilityPct: number | null;
    projectedScore: number | null;
  } | null;
}

function scoreTone(score: number | null | undefined): string {
  if (score == null) return 'var(--ink-3)';
  if (score >= 80) return 'var(--brand)';
  if (score >= 50) return 'var(--amber)';
  return 'var(--red)';
}

function StatChip({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="text-center px-2">
      <div className="text-[9px] uppercase tracking-wider text-[var(--ink-3)] font-semibold">{label}</div>
      <div className="text-sm font-bold" style={{ color: tone }}>{value}</div>
    </div>
  );
}

/**
 * /clients — workspace hub for the client account system. Public, no login:
 * client slugs are guessable strings (e.g. "acme-com"), which is intentional
 * — this is workspace organization for a solo/small operator, not an access
 * control boundary. Anything sensitive still lives behind the existing
 * capability-link model for individual reports.
 */
export default function ClientsPage() {
  const [clients, setClients] = useState<ClientRow[] | null>(null);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  function load() {
    fetch('/api/clients')
      .then((r) => r.json())
      .then((json) => {
        if (json.error) throw new Error(json.error);
        setClients(json.clients ?? []);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load clients'));
  }

  useEffect(() => {
    load();
  }, []);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');
    if (!name.trim() || !url.trim()) {
      setFormError('Name and URL are both required.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, url }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to add client');
      setName('');
      setUrl('');
      load();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : 'Failed to add client');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <header className="h-16 sm:h-[68px] sticky top-0 z-40 bg-[var(--surface)]/90 backdrop-blur-md border-b border-[var(--border)] flex items-center px-4 sm:px-6 gap-2 sm:gap-3">
        <Link href="/" className="w-8 h-8 rounded-lg flex items-center justify-center text-white shrink-0" style={{ background: 'var(--grad-brand)' }}>
          <BarChart3 size={16} />
        </Link>
        <div className="min-w-0">
          <h1 className="text-[15px] sm:text-[16px] font-bold text-[var(--ink)] tracking-tight">Clients</h1>
          <p className="text-[11px] sm:text-xs text-[var(--ink-3)] truncate">Workspaces for tracking each client&apos;s audit history</p>
        </div>
        <Link
          href="/reports"
          className="ml-auto flex items-center gap-1.5 h-10 sm:h-9 px-3 sm:px-3.5 rounded-lg text-white text-sm font-semibold hover:brightness-105 transition-all shrink-0"
          style={{ background: 'var(--grad-brand)' }}
        >
          <Search size={15} /> <span className="hidden sm:inline">Reports</span>
        </Link>
      </header>

      <main className="max-w-[1000px] mx-auto p-4 sm:p-6 flex flex-col gap-5">
        <div className="card p-4 sm:p-5">
          <h2 className="text-sm font-bold text-[var(--ink)] mb-3 flex items-center gap-2">
            <Plus size={16} className="text-[var(--brand)]" /> Add a client
          </h2>
          <form onSubmit={handleAdd} className="flex flex-col sm:flex-row gap-2.5">
            <input
              type="text"
              placeholder="Client name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="flex-1 h-10 px-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-sm text-[var(--ink)] outline-none focus:border-[var(--brand)]"
            />
            <input
              type="text"
              placeholder="example.com"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="flex-1 h-10 px-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-sm text-[var(--ink)] outline-none focus:border-[var(--brand)]"
            />
            <button
              type="submit"
              disabled={submitting}
              className="h-10 px-4 rounded-lg text-white text-sm font-semibold hover:brightness-105 transition-all disabled:opacity-60 shrink-0"
              style={{ background: 'var(--grad-brand)' }}
            >
              {submitting ? <Loader2 size={15} className="animate-spin" /> : 'Add Client'}
            </button>
          </form>
          {formError && <p className="text-xs text-[var(--fail,var(--red))] mt-2">{formError}</p>}
        </div>

        {clients === null && !error && (
          <div className="flex items-center justify-center py-24">
            <Loader2 size={22} className="animate-spin text-[var(--brand)]" />
          </div>
        )}

        {error && (
          <div className="card p-6 text-center text-sm text-[var(--red)]">
            {error}
            {/operator/i.test(error) && (
              <a href="/login" className="block mt-3 text-[var(--brand-ink)] font-semibold hover:underline">Sign in →</a>
            )}
          </div>
        )}

        {clients && clients.length === 0 && (
          <div className="card p-10 text-center">
            <Users size={28} className="text-[var(--ink-3)] mx-auto mb-3" />
            <h2 className="text-base font-bold text-[var(--ink)] mb-1">No clients yet</h2>
            <p className="text-sm text-[var(--ink-3)]">Add a client above to start tracking their audit history in one place.</p>
          </div>
        )}

        {clients && clients.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {clients.map((c) => (
              <Link
                key={c.id}
                href={`/client/${c.slug}`}
                className="card p-4 flex flex-col gap-3 hover:border-[var(--brand)]/30 transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-[var(--surface-2)] flex items-center justify-center shrink-0">
                    <Users size={16} className="text-[var(--brand)]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-[var(--ink)] truncate">{c.name}</div>
                    <div className="text-xs text-[var(--ink-3)] truncate">{c.domain}</div>
                  </div>
                  <ArrowRight size={16} className="text-[var(--ink-3)] group-hover:text-[var(--brand)] transition-colors shrink-0" />
                </div>

                <div className="flex items-center justify-between border-t border-[var(--border)] pt-3">
                  <div className="flex items-center gap-1">
                    <StatChip label="SEO" value={c.latest?.overallScore != null ? String(c.latest.overallScore) : '—'} tone={scoreTone(c.latest?.overallScore)} />
                    <StatChip label="GEO" value={c.latest?.geoScore != null ? String(c.latest.geoScore) : '—'} tone={scoreTone(c.latest?.geoScore)} />
                    <StatChip label="Vis" value={c.latest?.visibilityPct != null ? `${c.latest.visibilityPct}%` : '—'} tone={scoreTone(c.latest?.visibilityPct)} />
                    <StatChip label="Proj" value={c.latest?.projectedScore != null ? String(c.latest.projectedScore) : '—'} tone="var(--brand-ink)" />
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs text-[var(--ink-3)]">
                  <span>{c.runCount} run{c.runCount === 1 ? '' : 's'}</span>
                  <span>{c.lastRunAt ? new Date(c.lastRunAt).toLocaleDateString() : 'No runs yet'}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
