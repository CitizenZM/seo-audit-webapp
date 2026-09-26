'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Wrench, ShieldCheck, Lock, RotateCcw, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import Explainer from './Explainer';

type FixField = 'seo_title' | 'seo_description' | 'image_alt';
type FixStatus = 'proposed' | 'applying' | 'verified' | 'failed' | 'conflict' | 'rejected' | 'rolled_back';

interface Fix {
  id: string;
  resource_type: string;
  resource_id: string;
  product_id: string;
  resource_label: string;
  field: FixField;
  reason: string;
  before_value: string | null;
  proposed_value: string;
  proposal_source: 'ai' | 'fallback' | 'operator';
  status: FixStatus;
  observed_value: string | null;
  error: string | null;
  applied_at: string | null;
  verified_at: string | null;
  rolled_back_at: string | null;
}

interface ClientInfo {
  slug: string;
  platform: string;
  connected: boolean;
  tokenEnv: string;
}

const FIELD_LABEL: Record<FixField, string> = {
  seo_title: 'SEO title',
  seo_description: 'Meta description',
  image_alt: 'Image alt text',
};

const FIELD_TONE: Record<FixField, string> = {
  seo_title: 'bg-[var(--blue-soft)] text-[var(--blue)]',
  seo_description: 'bg-[var(--brand-soft)] text-[var(--brand-ink)]',
  image_alt: 'bg-[var(--amber-soft)] text-[var(--warn)]',
};

const SOURCE_LABEL: Record<Fix['proposal_source'], string> = {
  ai: 'AI',
  fallback: 'Fallback',
  operator: 'Operator',
};

type FieldFilter = 'all' | FixField;
type StatusFilter = 'pending' | 'done' | 'problems' | 'history';

const PAGE_SIZE = 100;

function charCount(field: FixField, value: string): { count: number; bad: boolean } {
  const count = value.length;
  if (field === 'seo_title') return { count, bad: count < 30 || count > 60 };
  if (field === 'seo_description') return { count, bad: count < 120 || count > 160 };
  return { count, bad: false };
}

function isPending(f: Fix) {
  return f.status === 'proposed';
}
function isDone(f: Fix) {
  return f.status === 'verified';
}
function isProblem(f: Fix) {
  return f.status === 'failed' || f.status === 'conflict';
}
function isHistory(f: Fix) {
  return f.status === 'rejected' || f.status === 'rolled_back';
}

/**
 * Implementation queue — operator-only Tier-1 Shopify fix pipeline. Proposals
 * are scanned from the store's products; nothing is written until an operator
 * approves; every write is re-read from Shopify and only marked verified when
 * it matches. Mirrors TaskListCard's status/fetch conventions.
 */
export default function FixQueueCard({ clientSlug }: { clientSlug: string }) {
  const [client, setClient] = useState<ClientInfo | null>(null);
  const [fixes, setFixes] = useState<Fix[] | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [mode, setMode] = useState<'loading' | 'ready' | 'locked' | 'error'>('loading');
  const [field, setField] = useState<FieldFilter>('all');
  const [status, setStatus] = useState<StatusFilter>('pending');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<{ proposed: number; skipped: number; scanned: number } | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const load = useCallback(() => {
    let cancelled = false;
    fetch(`/api/fixes?client=${encodeURIComponent(clientSlug)}`)
      .then(async (res) => {
        if (cancelled) return;
        if (res.status === 401) {
          setMode('locked');
          return;
        }
        if (!res.ok) {
          setMode('error');
          return;
        }
        const json = await res.json();
        setClient(json.client ?? null);
        setFixes(json.fixes ?? []);
        setCounts(json.counts ?? {});
        setMode('ready');
      })
      .catch(() => {
        if (!cancelled) setMode('error');
      });
    return () => {
      cancelled = true;
    };
  }, [clientSlug]);

  useEffect(() => load(), [load]);

  async function handleScan() {
    setScanning(true);
    setScanError(null);
    setScanResult(null);
    try {
      const res = await fetch('/api/fixes/propose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client: clientSlug }),
      });
      const json = await res.json();
      if (!res.ok) {
        setScanError(json.error ?? 'Scan failed');
      } else {
        setScanResult(json);
        load();
      }
    } catch {
      setScanError('Scan failed');
    } finally {
      setScanning(false);
    }
  }

  async function applyAction(id: string, body: { action: 'approve'; value?: string } | { action: 'reject' } | { action: 'rollback' }) {
    setBusyId(id);
    try {
      const res = await fetch(`/api/fixes/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (res.ok && json.fix) {
        setFixes((fs) => (fs ?? []).map((f) => (f.id === id ? json.fix : f)));
      }
    } finally {
      setBusyId(null);
    }
  }

  async function bulkApprove(ids: string[]) {
    if (ids.length === 0) return;
    if (!window.confirm(`Approve all ${ids.length} visible pending fixes? Each will be written to Shopify and second-checked.`)) return;
    setBusyId('__bulk__');
    try {
      const res = await fetch('/api/fixes/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, action: 'approve' }),
      });
      const json = await res.json();
      const results: { id: string; status: FixStatus; error?: string }[] = json.results ?? [];
      if (results.length > 0) {
        setFixes((fs) =>
          (fs ?? []).map((f) => {
            const r = results.find((x) => x.id === f.id);
            return r ? { ...f, status: r.status, error: r.error ?? null } : f;
          }),
        );
      }
      load();
    } finally {
      setBusyId(null);
    }
  }

  function rollback(id: string) {
    if (!window.confirm('Roll back this fix? The original value will be written back to Shopify and verified.')) return;
    applyAction(id, { action: 'rollback' });
  }

  const filtered = useMemo(() => {
    return (fixes ?? []).filter((f) => {
      if (field !== 'all' && f.field !== field) return false;
      if (status === 'pending') return isPending(f);
      if (status === 'done') return isDone(f);
      if (status === 'problems') return isProblem(f);
      if (status === 'history') return isHistory(f);
      return true;
    });
  }, [fixes, field, status]);

  const visible = filtered.slice(0, visibleCount);

  const pendingCount = (fixes ?? []).filter(isPending).length;
  const verifiedCount = (fixes ?? []).filter(isDone).length;
  const problemCount = (fixes ?? []).filter(isProblem).length;

  const visiblePendingIds = filtered.filter(isPending).map((f) => f.id);

  return (
    <div id="fix-queue" className="card p-4 sm:p-6 scroll-mt-20">
      <h3 className="text-base font-bold text-[var(--ink)] flex items-center gap-2 mb-1">
        <Wrench size={18} className="text-[var(--brand)]" /> Implementation queue (Shopify)
      </h3>
      <p className="text-sm text-[var(--ink-3)] mb-3">
        Approve a fix → we write it to Shopify, re-read the live record, and only mark it done when it matches.
      </p>

      <Explainer
        what="Proposals come from scanning the store's products for SEO titles, meta descriptions, and image alt text that need work. Nothing is written to Shopify until you approve a fix. Every write is second-checked by re-reading the live product from Shopify — if a merchant edited the field since the proposal was made, we flag a conflict instead of overwriting it."
        actions={[
          'Scan the store to generate proposals, then review and edit before approving — edits are sent exactly as typed.',
          'If a fix looks wrong after it goes live, use Rollback to restore the original value (also second-checked against Shopify).',
        ]}
      />

      {mode === 'loading' && <div className="skeleton h-24 rounded-xl" />}

      {mode === 'locked' && (
        <div className="flex items-start gap-2 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] px-3 py-2 text-[13px] text-[var(--ink-2)]">
          <Lock size={14} className="mt-0.5 shrink-0 text-[var(--ink-3)]" />
          <span>
            Sign in as an operator to review and apply fixes. <a href="/login" className="font-semibold text-[var(--brand-ink)] hover:underline">Sign in</a>
          </span>
        </div>
      )}

      {mode === 'error' && (
        <p className="text-sm text-[var(--ink-3)]">Couldn&apos;t load the fix queue. Try refreshing.</p>
      )}

      {mode === 'ready' && client && (
        <>
          {!client.connected && (
            <div className="mb-3 flex items-start gap-2 rounded-lg bg-[var(--amber-soft)] border border-[var(--amber)]/30 px-3 py-2 text-[13px] text-[var(--warn)]">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              <span>
                Store not connected — set <code className="font-mono font-semibold">{client.tokenEnv}</code> in Vercel (Shopify custom app Admin API token with read/write products + files scopes).
              </span>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 mb-3">
            {client.connected && (
              <button
                type="button"
                onClick={handleScan}
                disabled={scanning}
                className="flex items-center gap-1.5 text-sm font-semibold px-3 py-1.5 rounded-lg text-white disabled:opacity-60"
                style={{ background: 'var(--grad-brand, var(--brand))' }}
              >
                {scanning && <Loader2 size={14} className="animate-spin" />}
                Scan store &amp; propose fixes
              </button>
            )}
            {scanResult && (
              <span className="text-xs text-[var(--ink-3)]">
                Scanned {scanResult.scanned} · proposed {scanResult.proposed} · skipped {scanResult.skipped}
              </span>
            )}
            {scanError && <span className="text-xs text-[var(--fail)]">{scanError}</span>}
          </div>

          <div className="grid grid-cols-3 gap-2.5 mb-4">
            {[
              ['Pending', pendingCount, 'var(--ink)'],
              ['Verified', verifiedCount, 'var(--pass)'],
              ['Problems', problemCount, problemCount > 0 ? 'var(--fail)' : 'var(--ink)'],
            ].map(([label, value, color]) => (
              <div key={label as string} className="rounded-xl bg-[var(--surface-2)] px-3 py-2.5">
                <div className="text-[11px] uppercase tracking-wider text-[var(--ink-3)] font-semibold">{label}</div>
                <div className="text-xl font-bold mt-0.5" style={{ color: color as string }}>{value}</div>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2 mb-3">
            {(['all', 'seo_title', 'seo_description', 'image_alt'] as FieldFilter[]).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => {
                  setField(f);
                  setVisibleCount(PAGE_SIZE);
                }}
                className={`text-xs font-semibold px-3 py-1.5 rounded-full border ${field === f ? 'bg-[var(--brand-soft)] border-[var(--brand)]/30 text-[var(--brand-ink)]' : 'border-[var(--border)] text-[var(--ink-2)]'}`}
              >
                {f === 'all' ? 'All' : f === 'seo_title' ? 'Titles' : f === 'seo_description' ? 'Descriptions' : 'Alt text'}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2 mb-4">
            {([
              ['pending', 'Pending'],
              ['done', 'Done'],
              ['problems', 'Problems'],
              ['history', 'History'],
            ] as [StatusFilter, string][]).map(([s, label]) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  setStatus(s);
                  setVisibleCount(PAGE_SIZE);
                }}
                className={`text-xs font-semibold px-3 py-1.5 rounded-full border ${status === s ? 'bg-[var(--blue-soft)] border-[var(--blue)]/30 text-[var(--blue)]' : 'border-[var(--border)] text-[var(--ink-2)]'}`}
              >
                {label}
              </button>
            ))}
            {status === 'pending' && visiblePendingIds.length > 0 && (
              <button
                type="button"
                onClick={() => bulkApprove(visiblePendingIds)}
                disabled={busyId === '__bulk__'}
                className="ml-auto text-xs font-semibold px-3 py-1.5 rounded-lg text-white disabled:opacity-60"
                style={{ background: 'var(--grad-brand, var(--brand))' }}
              >
                Approve all visible pending ({visiblePendingIds.length})
              </button>
            )}
          </div>

          {filtered.length === 0 ? (
            <p className="text-sm text-[var(--ink-3)]">
              {(fixes ?? []).length === 0 ? 'No fixes yet — scan the store to generate proposals.' : 'Nothing in this view.'}
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-[var(--border)]">
              {visible.map((f) => (
                <FixRow
                  key={f.id}
                  fix={f}
                  busy={busyId === f.id}
                  draft={drafts[f.id] ?? f.proposed_value}
                  onDraftChange={(v) => setDrafts((d) => ({ ...d, [f.id]: v }))}
                  onApprove={() => applyAction(f.id, { action: 'approve', value: drafts[f.id] ?? f.proposed_value })}
                  onReject={() => applyAction(f.id, { action: 'reject' })}
                  onRollback={() => rollback(f.id)}
                />
              ))}
            </ul>
          )}

          {filtered.length > visibleCount && (
            <button
              type="button"
              onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
              className="mt-3 w-full text-xs font-semibold px-3 py-2 rounded-lg border border-[var(--border)] text-[var(--ink-2)]"
            >
              Show more ({filtered.length - visibleCount} remaining)
            </button>
          )}
        </>
      )}
    </div>
  );
}

function FixRow({
  fix,
  busy,
  draft,
  onDraftChange,
  onApprove,
  onReject,
  onRollback,
}: {
  fix: Fix;
  busy: boolean;
  draft: string;
  onDraftChange: (v: string) => void;
  onApprove: () => void;
  onReject: () => void;
  onRollback: () => void;
}) {
  const { count, bad } = charCount(fix.field, draft);
  const showCount = fix.field !== 'image_alt';

  return (
    <li className="py-3">
      <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
        <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase ${FIELD_TONE[fix.field]}`}>{FIELD_LABEL[fix.field]}</span>
        <span className="text-[13px] font-semibold text-[var(--ink)] truncate">{fix.resource_label}</span>
        <span className="text-[10px] px-1.5 py-0.5 rounded font-bold bg-[var(--surface-2)] text-[var(--ink-3)]">{SOURCE_LABEL[fix.proposal_source]}</span>
      </div>
      <p className="text-[12px] text-[var(--ink-3)] mb-2">{fix.reason}</p>

      {fix.status === 'proposed' && (
        <div className="flex flex-col gap-2">
          {fix.before_value != null && (
            <p className="text-[12px] text-[var(--ink-3)] line-through truncate">{fix.before_value}</p>
          )}
          <textarea
            value={draft}
            onChange={(e) => onDraftChange(e.target.value)}
            rows={fix.field === 'seo_description' ? 3 : 2}
            className="w-full text-[13px] border border-[var(--border)] rounded-lg px-2.5 py-1.5 bg-[var(--surface)] text-[var(--ink)]"
          />
          <div className="flex items-center gap-2">
            {showCount && (
              <span className={`text-[11px] ${bad ? 'text-[var(--fail)] font-semibold' : 'text-[var(--ink-3)]'}`}>{count} chars</span>
            )}
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={onReject}
                disabled={busy}
                className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-[var(--border)] text-[var(--ink-2)] disabled:opacity-60"
              >
                Reject
              </button>
              <button
                type="button"
                onClick={onApprove}
                disabled={busy}
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg text-white disabled:opacity-60"
                style={{ background: 'var(--grad-brand, var(--brand))' }}
              >
                {busy && <Loader2 size={12} className="animate-spin" />}
                Approve
              </button>
            </div>
          </div>
        </div>
      )}

      {fix.status === 'applying' && (
        <p className="flex items-center gap-1.5 text-[13px] text-[var(--ink-3)]">
          <Loader2 size={13} className="animate-spin" /> Applying…
        </p>
      )}

      {fix.status === 'verified' && (
        <div className="flex flex-col gap-1.5">
          <p className="text-[12px] text-[var(--ink-3)] line-through truncate">{fix.before_value}</p>
          <p className="text-[13px] text-[var(--ink)]">{fix.observed_value ?? fix.proposed_value}</p>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="flex items-center gap-1 text-[12px] font-semibold text-[var(--pass)]">
              <CheckCircle2 size={13} /> Verified live
            </span>
            {fix.verified_at && <span className="text-[11px] text-[var(--ink-3)]">{new Date(fix.verified_at).toLocaleString()}</span>}
            <button
              type="button"
              onClick={onRollback}
              disabled={busy}
              className="ml-auto flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border border-[var(--border)] text-[var(--ink-2)] disabled:opacity-60"
            >
              {busy ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
              Rollback
            </button>
          </div>
        </div>
      )}

      {(fix.status === 'failed' || fix.status === 'conflict') && (
        <div className={`flex flex-col gap-1.5 rounded-lg px-2.5 py-2 ${fix.status === 'conflict' ? 'bg-[var(--amber-soft)]' : 'bg-[var(--red-soft)]'}`}>
          <span className={`flex items-center gap-1 text-[12px] font-semibold ${fix.status === 'conflict' ? 'text-[var(--warn)]' : 'text-[var(--fail)]'}`}>
            <AlertTriangle size={13} /> {fix.status === 'conflict' ? 'Conflict — merchant edited since proposal' : 'Failed'}
          </span>
          {fix.error && <p className="text-[12px] text-[var(--ink-2)]">{fix.error}</p>}
          {fix.observed_value != null && (
            <p className="text-[12px] text-[var(--ink-3)]">Live value: {fix.observed_value}</p>
          )}
        </div>
      )}

      {(fix.status === 'rejected' || fix.status === 'rolled_back') && (
        <div className="flex items-center gap-2 text-[12px] text-[var(--ink-3)]">
          <ShieldCheck size={13} />
          <span>{fix.status === 'rejected' ? 'Rejected' : 'Rolled back'}</span>
          {fix.rolled_back_at && <span>· {new Date(fix.rolled_back_at).toLocaleString()}</span>}
        </div>
      )}
    </li>
  );
}
