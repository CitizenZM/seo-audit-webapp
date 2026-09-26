'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import TaskListCard from '../../dashboard/TaskListCard';
import { BarChart3, Loader2, XCircle, ArrowLeft, Rocket, ArrowRight } from 'lucide-react';

interface ClientDetail {
  id: string;
  slug: string;
  name: string;
  domain: string;
  url: string;
  createdAt: string;
}

interface AuditRow {
  id: string;
  createdAt: string;
  status: string;
  overallScore: number | null;
  geoScore: number | null;
  visibilityPct: number | null;
  projectedScore: number | null;
}

function scoreTone(score: number | null): string {
  if (score == null) return 'var(--ink-3)';
  if (score >= 80) return 'var(--brand)';
  if (score >= 50) return 'var(--amber)';
  return 'var(--red)';
}

function statusLabel(status: string): string {
  if (status === 'done') return 'Ready';
  if (status === 'error') return 'Failed';
  return 'Running…';
}

/**
 * /client/[slug] — a single client's workspace: header, run-new-audit
 * shortcut, and full run history. Public by design, same as /clients — the
 * slug is a guessable string, not a secret. This page is workspace
 * organization for the operator, not an auth boundary.
 */
export default function ClientWorkspacePage() {
  const params = useParams();
  const slug = params?.slug as string;

  const [client, setClient] = useState<ClientDetail | null>(null);
  const [audits, setAudits] = useState<AuditRow[]>([]);
  const [status, setStatus] = useState<'loading' | 'error' | 'ready'>('loading');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;

    fetch(`/api/clients/${slug}`)
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        if (json.error) throw new Error(json.error);
        setClient(json.client);
        setAudits(json.audits ?? []);
        setStatus('ready');
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load client');
          setStatus('error');
        }
      });

    return () => {
      cancelled = true;
    };
  }, [slug]);

  const latestDone = audits.find((a) => a.status === 'done');

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg)]">
        <Loader2 size={24} className="animate-spin text-[var(--brand)]" />
      </div>
    );
  }

  if (status === 'error' || !client) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--bg)] p-6">
        <div className="card p-6 sm:p-8 max-w-md w-full text-center">
          <XCircle size={28} className="text-[var(--red)] mx-auto mb-3" />
          <h2 className="text-lg font-bold text-[var(--ink)] mb-1">Client not found</h2>
          <p className="text-sm text-[var(--ink-3)] mb-4">{error}</p>
          <Link href="/clients" className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--brand-ink)]">
            <ArrowLeft size={15} /> Back to clients
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--bg)]">
      <header className="h-16 sm:h-[68px] sticky top-0 z-40 bg-[var(--surface)]/90 backdrop-blur-md border-b border-[var(--border)] flex items-center px-4 sm:px-6 gap-2 sm:gap-3">
        <Link href="/clients" className="w-8 h-8 rounded-lg flex items-center justify-center text-white shrink-0" style={{ background: 'var(--grad-brand)' }}>
          <ArrowLeft size={16} />
        </Link>
        <div className="min-w-0">
          <h1 className="text-[15px] sm:text-[16px] font-bold text-[var(--ink)] tracking-tight truncate">{client.name}</h1>
          <p className="text-[11px] sm:text-xs text-[var(--ink-3)] truncate">{client.domain}</p>
        </div>
        <Link
          href={`/dashboard?url=${encodeURIComponent(client.url)}`}
          className="ml-auto flex items-center gap-1.5 h-10 sm:h-9 px-3 sm:px-3.5 rounded-lg text-white text-sm font-semibold hover:brightness-105 transition-all shrink-0"
          style={{ background: 'var(--grad-brand)' }}
        >
          <Rocket size={15} /> <span className="hidden sm:inline">Run new audit</span>
        </Link>
      </header>

      <main className="max-w-[900px] mx-auto p-4 sm:p-6 flex flex-col gap-5">
        {/* Score trend summary — latest completed run */}
        <div className="card p-4 sm:p-5">
          <h2 className="text-sm font-bold text-[var(--ink)] mb-3">Latest scores</h2>
          {latestDone ? (
            <div className="flex items-center gap-6 sm:gap-10">
              <div className="text-center">
                <div className="text-[10px] uppercase tracking-wider text-[var(--ink-3)] font-semibold">SEO</div>
                <div className="text-xl font-bold" style={{ color: scoreTone(latestDone.overallScore) }}>{latestDone.overallScore ?? '—'}</div>
              </div>
              <div className="text-center">
                <div className="text-[10px] uppercase tracking-wider text-[var(--ink-3)] font-semibold">GEO</div>
                <div className="text-xl font-bold" style={{ color: scoreTone(latestDone.geoScore) }}>{latestDone.geoScore ?? '—'}</div>
              </div>
              <div className="text-center">
                <div className="text-[10px] uppercase tracking-wider text-[var(--ink-3)] font-semibold">Visibility</div>
                <div className="text-xl font-bold" style={{ color: scoreTone(latestDone.visibilityPct) }}>{latestDone.visibilityPct != null ? `${latestDone.visibilityPct}%` : '—'}</div>
              </div>
              <div className="text-center">
                <div className="text-[10px] uppercase tracking-wider text-[var(--brand-ink)] font-semibold">Projected</div>
                <div className="text-xl font-bold text-[var(--brand-ink)]">{latestDone.projectedScore ?? '—'}</div>
              </div>
            </div>
          ) : (
            <p className="text-sm text-[var(--ink-3)]">No completed audits yet — run one to see scores here.</p>
          )}
        </div>

        {/* Full run history */}
        <div className="card p-4 sm:p-5">
          <h2 className="text-sm font-bold text-[var(--ink)] mb-3">Run history</h2>

          {audits.length === 0 && (
            <p className="text-sm text-[var(--ink-3)] text-center py-6">No audits have been run for this client yet.</p>
          )}

          {audits.length > 0 && (
            <div className="flex flex-col gap-2">
              {audits.map((a) => {
                const inner = (
                  <>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold text-[var(--ink)]">{new Date(a.createdAt).toLocaleDateString()}</div>
                      <div className="text-xs text-[var(--ink-3)]">{statusLabel(a.status)}</div>
                    </div>
                    <div className="hidden sm:flex items-center gap-5 shrink-0">
                      <div className="text-center w-14">
                        <div className="text-[9px] uppercase tracking-wider text-[var(--ink-3)] font-semibold">SEO</div>
                        <div className="text-sm font-bold" style={{ color: scoreTone(a.overallScore) }}>{a.overallScore ?? '—'}</div>
                      </div>
                      <div className="text-center w-14">
                        <div className="text-[9px] uppercase tracking-wider text-[var(--ink-3)] font-semibold">GEO</div>
                        <div className="text-sm font-bold" style={{ color: scoreTone(a.geoScore) }}>{a.geoScore ?? '—'}</div>
                      </div>
                      <div className="text-center w-14">
                        <div className="text-[9px] uppercase tracking-wider text-[var(--ink-3)] font-semibold">Visibility</div>
                        <div className="text-sm font-bold" style={{ color: scoreTone(a.visibilityPct) }}>{a.visibilityPct != null ? `${a.visibilityPct}%` : '—'}</div>
                      </div>
                      <div className="text-center w-14">
                        <div className="text-[9px] uppercase tracking-wider text-[var(--brand-ink)] font-semibold">Projected</div>
                        <div className="text-sm font-bold text-[var(--brand-ink)]">{a.projectedScore ?? '—'}</div>
                      </div>
                    </div>
                    {a.status === 'done' && <ArrowRight size={16} className="text-[var(--ink-3)] shrink-0" />}
                  </>
                );
                return a.status === 'done' ? (
                  <Link key={a.id} href={a.status === 'done' ? `/dashboard?id=${a.id}` : `/report/${a.id}`} className="card p-3 flex items-center gap-3 hover:border-[var(--brand)]/30 transition-colors">
                    {inner}
                  </Link>
                ) : (
                  <div key={a.id} className="card p-3 flex items-center gap-3">
                    {inner}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <TaskListCard domain={client.domain} />
      </main>
    </div>
  );
}
