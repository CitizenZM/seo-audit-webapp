'use client';

import { useEffect, useMemo, useState } from 'react';
import { ListTodo, ChevronDown, ChevronRight, ShieldCheck, Lock, RotateCcw } from 'lucide-react';
import Explainer from './Explainer';
import { buildTaskList, type TaskDraft } from '@/lib/taskList';

type Status = 'todo' | 'in_progress' | 'done' | 'dismissed';

interface Task {
  id: string;
  track: 'seo' | 'geo';
  source: string;
  section: string | null;
  title: string;
  detail: string | null;
  priority: 'P0' | 'P1' | 'P2';
  effort: string | null;
  impact: string | null;
  status: Status;
  auto_verifiable: boolean;
  verify: string | null;
  affected_urls: string[];
  affected_count: number;
  verified_at: string | null;
}

const PRIORITY_TONE: Record<Task['priority'], string> = {
  P0: 'bg-[var(--red-soft)] text-[var(--fail)]',
  P1: 'bg-[var(--amber-soft)] text-[var(--warn)]',
  P2: 'bg-[var(--surface-2)] text-[var(--ink-3)]',
};
const STATUS_LABEL: Record<Status, string> = { todo: 'To do', in_progress: 'In progress', done: 'Done', dismissed: 'Dismissed' };
const SOURCE_LABEL: Record<string, string> = {
  'page-issue': 'Page issue',
  'geo-check': 'GEO check',
  section: 'Section plan',
  strategy: 'Strategy',
};

const fromDraft = (d: TaskDraft, i: number): Task => ({
  id: `preview-${i}`,
  track: d.track,
  source: d.source,
  section: d.section ?? null,
  title: d.title,
  detail: d.detail ?? null,
  priority: d.priority,
  effort: d.effort ?? null,
  impact: d.impact ?? null,
  status: 'todo',
  auto_verifiable: d.autoVerifiable,
  verify: d.verify ?? null,
  affected_urls: d.affectedUrls,
  affected_count: d.affectedCount,
  verified_at: null,
});

/**
 * SEO / GEO task list — every actionable finding from the audit as a
 * trackable task. Operators (signed in + allowlisted) get the persistent,
 * closed-loop list from /api/tasks with status controls; everyone else sees
 * a read-only preview computed from the current audit.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function TaskListCard({ domain, auditData }: { domain: string; auditData?: any }) {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [mode, setMode] = useState<'loading' | 'operator' | 'preview'>('loading');
  const [track, setTrack] = useState<'all' | 'seo' | 'geo'>('all');
  const [showClosed, setShowClosed] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const preview = useMemo(() => buildTaskList(auditData ?? {}).map(fromDraft), [auditData]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/tasks?domain=${encodeURIComponent(domain)}`)
      .then(async (res) => {
        if (cancelled) return;
        if (res.ok) {
          const json = await res.json();
          // Brand-new site whose job hasn't synced yet → show the preview.
          if ((json.tasks ?? []).length === 0 && preview.length > 0) {
            setTasks(preview);
            setMode('preview');
          } else {
            setTasks(json.tasks ?? []);
            setMode('operator');
          }
        } else {
          setTasks(preview);
          setMode('preview');
        }
      })
      .catch(() => {
        if (!cancelled) {
          setTasks(preview);
          setMode('preview');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [domain, preview]);

  async function setStatus(id: string, status: Status) {
    setBusy(id);
    try {
      const res = await fetch(`/api/tasks/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (res.ok) setTasks((ts) => (ts ?? []).map((t) => (t.id === id ? { ...t, status, verified_at: status === 'done' ? t.verified_at : null } : t)));
    } finally {
      setBusy(null);
    }
  }

  const visible = (tasks ?? []).filter(
    (t) => (track === 'all' || t.track === track) && (showClosed || t.status === 'todo' || t.status === 'in_progress'),
  );
  const openCount = (tasks ?? []).filter((t) => t.status === 'todo' || t.status === 'in_progress').length;
  const verified = (tasks ?? []).filter((t) => t.status === 'done' && t.verified_at).length;
  const count = (tr: 'seo' | 'geo', p?: Task['priority']) =>
    (tasks ?? []).filter((t) => t.track === tr && (t.status === 'todo' || t.status === 'in_progress') && (!p || t.priority === p)).length;

  return (
    <div id="task-list" className="card p-4 sm:p-6 scroll-mt-20">
      <h3 className="text-base font-bold text-[var(--ink)] flex items-center gap-2 mb-1">
        <ListTodo size={18} className="text-[var(--brand)]" /> SEO / GEO task list
      </h3>
      <p className="text-sm text-[var(--ink-3)] mb-3">
        Every actionable finding as a tracked task — re-audits update it and auto-verify fixes.
      </p>
      <Explainer
        what="The agent converts every finding (page issues, GEO readiness gaps, section plans, strategy initiatives) into prioritized tasks. Deterministic tasks (marked 'auto-verified') close themselves when the next audit no longer detects the issue, and reopen if it comes back."
        actions={[
          'Work P0 first, then P1 — each task shows the fix and how it will be verified.',
          'Mark AI-suggested tasks In progress or Done yourself; page-issue and GEO-check tasks are confirmed automatically by the next audit.',
        ]}
      />

      {mode === 'loading' && <div className="skeleton h-24 rounded-xl" />}

      {mode !== 'loading' && (
        <>
          {mode === 'preview' && (
            <div className="mb-3 flex items-start gap-2 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] px-3 py-2 text-[13px] text-[var(--ink-2)]">
              <Lock size={14} className="mt-0.5 shrink-0 text-[var(--ink-3)]" />
              <span>
                Preview computed from this audit. <a href="/login" className="font-semibold text-[var(--brand-ink)] hover:underline">Sign in</a> as an operator to track status and see auto-verified fixes.
              </span>
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mb-4">
            {[
              ['Open tasks', openCount, 'var(--ink)'],
              ['SEO · P0/P1', `${count('seo', 'P0')}/${count('seo', 'P1')}`, 'var(--ink)'],
              ['GEO · P0/P1', `${count('geo', 'P0')}/${count('geo', 'P1')}`, 'var(--ink)'],
              ['Auto-verified', verified, 'var(--pass)'],
            ].map(([label, value, color]) => (
              <div key={label as string} className="rounded-xl bg-[var(--surface-2)] px-3 py-2.5">
                <div className="text-[11px] uppercase tracking-wider text-[var(--ink-3)] font-semibold">{label}</div>
                <div className="text-xl font-bold mt-0.5" style={{ color: color as string }}>{value}</div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2 mb-3">
            {(['all', 'seo', 'geo'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTrack(t)}
                className={`text-xs font-semibold px-3 py-1.5 rounded-full border ${track === t ? 'bg-[var(--brand-soft)] border-[var(--brand)]/30 text-[var(--brand-ink)]' : 'border-[var(--border)] text-[var(--ink-2)]'}`}
              >
                {t === 'all' ? 'All' : t.toUpperCase()}
              </button>
            ))}
            {mode === 'operator' && (
              <label className="ml-auto flex items-center gap-1.5 text-xs text-[var(--ink-2)] cursor-pointer">
                <input type="checkbox" checked={showClosed} onChange={(e) => setShowClosed(e.target.checked)} />
                Show done / dismissed
              </label>
            )}
          </div>

          {visible.length === 0 ? (
            <p className="text-sm text-[var(--ink-3)]">
              {(tasks ?? []).length === 0 ? 'No tasks yet — run an audit to generate the task list.' : 'Nothing open in this view.'}
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-[var(--border)]">
              {visible.map((t) => {
                const expanded = open === t.id;
                return (
                  <li key={t.id} className="py-2.5">
                    <div className="flex items-start gap-2">
                      <button type="button" onClick={() => setOpen(expanded ? null : t.id)} className="mt-0.5 text-[var(--ink-3)]" aria-label="Toggle details">
                        {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${PRIORITY_TONE[t.priority]}`}>{t.priority}</span>
                          <span className="text-[10px] px-1.5 py-0.5 rounded font-bold uppercase bg-[var(--blue-soft)] text-[var(--blue)]">{t.track}</span>
                          <span className="text-[13px] font-semibold text-[var(--ink)]">{t.title}</span>
                          {t.affected_count > 1 && <span className="text-[11px] text-[var(--ink-3)]">· {t.affected_count} pages</span>}
                        </div>
                        <div className="text-[11px] text-[var(--ink-3)] mt-0.5 flex flex-wrap gap-x-2">
                          <span>{SOURCE_LABEL[t.source] ?? t.source}{t.section ? ` · ${t.section}` : ''}</span>
                          {t.auto_verifiable && (
                            <span className="inline-flex items-center gap-0.5 text-[var(--pass)]"><ShieldCheck size={11} /> auto-verified</span>
                          )}
                          {t.status === 'done' && t.verified_at && (
                            <span className="text-[var(--pass)] font-semibold">verified fixed {new Date(t.verified_at).toLocaleDateString()}</span>
                          )}
                        </div>
                      </div>
                      {mode === 'operator' ? (
                        <select
                          value={t.status}
                          disabled={busy === t.id}
                          onChange={(e) => setStatus(t.id, e.target.value as Status)}
                          className="text-xs border border-[var(--border)] rounded-lg px-2 py-1 bg-[var(--surface)] text-[var(--ink-2)]"
                          aria-label="Task status"
                        >
                          {(Object.keys(STATUS_LABEL) as Status[]).map((s) => (
                            <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-[11px] text-[var(--ink-3)]">{STATUS_LABEL[t.status]}</span>
                      )}
                    </div>
                    {expanded && (
                      <div className="ml-6 mt-2 flex flex-col gap-1.5 text-[13px] text-[var(--ink-2)]">
                        {t.detail && <p className="whitespace-pre-line">{t.detail}</p>}
                        {t.verify && (
                          <p className="flex items-start gap-1.5 text-[var(--ink-3)]"><RotateCcw size={12} className="mt-1 shrink-0" /> Verify: {t.verify}</p>
                        )}
                        {t.affected_urls.length > 0 && (
                          <ul className="text-xs text-[var(--blue)] flex flex-col gap-0.5">
                            {t.affected_urls.slice(0, 8).map((u) => (
                              <li key={u} className="truncate"><a href={u} target="_blank" rel="noopener noreferrer" className="hover:underline">{u}</a></li>
                            ))}
                            {t.affected_urls.length > 8 && <li className="text-[var(--ink-3)]">+{t.affected_urls.length - 8} more</li>}
                          </ul>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
