'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { BarChart3, ArrowRight, Search, Loader2, FileX2, Sparkles } from 'lucide-react';
import { getAudits } from '@/lib/history';

interface AuditRow {
  id: string;
  url: string;
  domain: string;
  status: string;
  overall_score: number | null;
  geo_score: number | null;
  visibility_pct: number | null;
  projected_score: number | null;
  created_at: string;
}

function scoreTone(score: number | null): string {
  if (score == null) return 'var(--ink-3)';
  if (score >= 80) return 'var(--brand)';
  if (score >= 50) return 'var(--amber)';
  return 'var(--red)';
}

/**
 * The Reports Dashboard — a dedicated page listing every audit that's been
 * run, each linking to its full exportable report (/report/[id]). This is
 * separate from the live /dashboard (which runs a fresh audit and polls it);
 * this page is the archive/hub for reports already generated.
 */
export default function ReportsPage() {
  const [audits, setAudits] = useState<AuditRow[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    // Anonymous users: only ids their own browser already knows about
    // (localStorage) are ever looked up — see /api/audits/list for why.
    const localIds = getAudits().map((a) => a.id).filter((id): id is string => !!id);
    const qs = localIds.length ? `?ids=${localIds.join(',')}` : '';
    fetch(`/api/audits/list${qs}`)
      .then((r) => r.json())
      .then((json) => {
        if (json.error) throw new Error(json.error);
        setAudits(json.audits ?? []);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load reports'));
  }, []);

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <header className="h-16 sm:h-[68px] sticky top-0 z-40 bg-[var(--surface)]/90 backdrop-blur-md border-b border-[var(--border)] flex items-center px-4 sm:px-6 gap-2 sm:gap-3">
        <Link href="/" className="w-8 h-8 rounded-lg flex items-center justify-center text-white shrink-0" style={{ background: 'var(--grad-brand)' }}>
          <BarChart3 size={16} />
        </Link>
        <div className="min-w-0">
          <h1 className="text-[15px] sm:text-[16px] font-bold text-[var(--ink)] tracking-tight">Reports</h1>
          <p className="text-[11px] sm:text-xs text-[var(--ink-3)] truncate">Every audit you&apos;ve run, ready to view or export</p>
        </div>
        <Link
          href="/"
          className="ml-auto flex items-center gap-1.5 h-10 sm:h-9 px-3 sm:px-3.5 rounded-lg text-white text-sm font-semibold hover:brightness-105 transition-all shrink-0"
          style={{ background: 'var(--grad-brand)' }}
        >
          <Search size={15} /> <span className="hidden sm:inline">New Audit</span>
        </Link>
      </header>

      <main className="max-w-[900px] mx-auto p-4 sm:p-6">
        {audits === null && !error && (
          <div className="flex items-center justify-center py-24">
            <Loader2 size={22} className="animate-spin text-[var(--brand)]" />
          </div>
        )}

        {error && (
          <div className="card p-6 text-center text-sm text-[var(--fail)]">{error}</div>
        )}

        {audits && audits.length === 0 && (
          <div className="card p-10 text-center">
            <FileX2 size={28} className="text-[var(--ink-3)] mx-auto mb-3" />
            <h2 className="text-base font-bold text-[var(--ink)] mb-1">No reports yet</h2>
            <p className="text-sm text-[var(--ink-3)] mb-5">Run your first audit to see it here, ready to export as a full report.</p>
            <Link href="/" className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg text-white text-sm font-semibold" style={{ background: 'var(--grad-brand)' }}>
              <Search size={15} /> Run an audit
            </Link>
          </div>
        )}

        {audits && audits.length > 0 && (
          <div className="flex flex-col gap-2.5">
            {audits.map((a) => (
              <Link
                key={a.id}
                href={a.status === 'done' ? `/report/${a.id}` : `/dashboard?url=${encodeURIComponent(a.url)}`}
                className="card p-3.5 sm:p-4 flex items-center gap-3 sm:gap-4 hover:border-[var(--brand)]/30 transition-colors group"
              >
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-lg bg-[var(--surface-2)] flex items-center justify-center shrink-0">
                  <Sparkles size={16} className="text-[var(--brand)]" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-[var(--ink)] truncate">{a.domain}</div>
                  <div className="text-xs text-[var(--ink-3)]">
                    {new Date(a.created_at).toLocaleDateString()} · {a.status === 'done' ? 'Ready' : a.status === 'error' ? 'Failed' : 'Running…'}
                  </div>
                </div>
                <div className="hidden sm:flex items-center gap-5 shrink-0">
                  <div className="text-center w-14">
                    <div className="text-[9px] uppercase tracking-wider text-[var(--ink-3)] font-semibold">SEO</div>
                    <div className="text-sm font-bold" style={{ color: scoreTone(a.overall_score) }}>{a.overall_score ?? '—'}</div>
                  </div>
                  <div className="text-center w-14">
                    <div className="text-[9px] uppercase tracking-wider text-[var(--ink-3)] font-semibold">GEO</div>
                    <div className="text-sm font-bold" style={{ color: scoreTone(a.geo_score) }}>{a.geo_score ?? '—'}</div>
                  </div>
                  <div className="text-center w-14">
                    <div className="text-[9px] uppercase tracking-wider text-[var(--ink-3)] font-semibold">Visibility</div>
                    <div className="text-sm font-bold" style={{ color: scoreTone(a.visibility_pct) }}>{a.visibility_pct != null ? `${a.visibility_pct}%` : '—'}</div>
                  </div>
                  {a.projected_score != null && (
                    <div className="text-center w-14">
                      <div className="text-[9px] uppercase tracking-wider text-[var(--brand-ink)] font-semibold">Projected</div>
                      <div className="text-sm font-bold text-[var(--brand-ink)]">{a.projected_score}</div>
                    </div>
                  )}
                </div>
                <ArrowRight size={16} className="text-[var(--ink-3)] group-hover:text-[var(--brand)] transition-colors shrink-0" />
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
