'use client';

import { useEffect, useState } from 'react';
import { ShoppingBag, Zap, CheckCircle2, AlertTriangle, Loader2, RefreshCw } from 'lucide-react';
import Explainer from './Explainer';

interface LastRun {
  scanned?: number; proposed?: number; attempted?: number; verified?: number; conflict?: number; failed?: number;
  remaining?: number; halted?: string; error?: string; hop?: number;
}
interface Conn {
  shop_domain: string; scopes: string | null; status: 'connected' | 'revoked' | 'error';
  auto_apply: boolean; last_run_at: string | null; last_run: LastRun | null; installed_at: string;
}

/**
 * One-click Shopify connection + auto mode. Connect = authorize once on
 * Shopify; afterwards the store is scanned and Tier-1 fixes are applied
 * automatically (each still second-checked, conflict-safe, rollback-able from
 * the Implementation queue below).
 */
export default function ShopifyConnectCard({ clientSlug }: { clientSlug: string }) {
  const [state, setState] = useState<'loading' | 'locked' | 'ready'>('loading');
  const [conn, setConn] = useState<Conn | null>(null);
  const [shop, setShop] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  async function load() {
    const res = await fetch(`/api/shopify/connection?client=${encodeURIComponent(clientSlug)}`);
    if (res.status === 401) { setState('locked'); return; }
    const json = await res.json();
    setConn(json.connection ?? null);
    if (!shop && json.shopDomain) setShop(json.shopDomain);
    setState('ready');
  }

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get('shopify') === 'connected') setNotice({ tone: 'ok', text: 'Store connected — scanning and auto-fixing now. Results appear below in a minute or two.' });
    if (q.get('shopify') === 'error') setNotice({ tone: 'err', text: `Connection failed: ${q.get('reason') ?? 'unknown error'}` });
    load();
    // Poll while an auto run is likely in progress right after connecting.
    const t = q.get('shopify') === 'connected' ? setInterval(load, 15000) : undefined;
    return () => { if (t) clearInterval(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientSlug]);

  const connect = () => {
    const s = shop.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    const domain = s.endsWith('.myshopify.com') ? s : `${s}.myshopify.com`;
    window.location.href = `/api/shopify/install?client=${encodeURIComponent(clientSlug)}&shop=${encodeURIComponent(domain)}`;
  };

  async function toggleAuto(next: boolean) {
    setBusy(true);
    const res = await fetch('/api/shopify/connection', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client: clientSlug, autoApply: next }) });
    if (res.ok) setConn((c) => (c ? { ...c, auto_apply: next } : c));
    setBusy(false);
  }

  async function runNow() {
    setBusy(true);
    const res = await fetch('/api/fixes/autorun', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ client: clientSlug }) });
    setNotice(res.ok ? { tone: 'ok', text: 'Scan & auto-fix started — refresh in a minute to see results.' } : { tone: 'err', text: 'Could not start the run.' });
    setBusy(false);
    setTimeout(load, 20000);
  }

  const r = conn?.last_run;
  return (
    <div id="shopify-connect" className="card p-4 sm:p-6 scroll-mt-20">
      <h3 className="text-base font-bold text-[var(--ink)] flex items-center gap-2 mb-1">
        <ShoppingBag size={18} className="text-[var(--brand)]" /> Shopify connection &amp; auto-fix
      </h3>
      <p className="text-sm text-[var(--ink-3)] mb-3">Authorize the store once — we scan it and fix SEO issues automatically.</p>
      <Explainer
        what="Connecting authorizes this app on the store (product + image access only). From then on, product SEO titles, meta descriptions and image alt text are fixed automatically. Every write is re-read from Shopify and only counts when it matches; merchant edits are never overwritten; any fix can be rolled back in the Implementation queue."
        actions={[
          'Enter the store’s xxx.myshopify.com domain and click Connect — approve on the Shopify screen and you’re done.',
          'Turn auto mode off to review fixes manually instead.',
        ]}
      />

      {notice && (
        <div className={`mb-3 rounded-lg px-3 py-2 text-[13px] flex items-start gap-2 ${notice.tone === 'ok' ? 'bg-[var(--brand-soft)] text-[var(--brand-ink)]' : 'bg-[var(--red-soft)] text-[var(--fail)]'}`}>
          {notice.tone === 'ok' ? <CheckCircle2 size={14} className="mt-0.5 shrink-0" /> : <AlertTriangle size={14} className="mt-0.5 shrink-0" />}
          {notice.text}
        </div>
      )}

      {state === 'loading' && <div className="skeleton h-16 rounded-xl" />}
      {state === 'locked' && (
        <p className="text-sm text-[var(--ink-3)]">
          <a href="/login" className="font-semibold text-[var(--brand-ink)] hover:underline">Sign in</a> as an operator to connect stores.
        </p>
      )}

      {state === 'ready' && (!conn || conn.status !== 'connected') && (
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            value={shop}
            onChange={(e) => setShop(e.target.value)}
            placeholder="your-store.myshopify.com"
            className="flex-1 border border-[var(--border)] rounded-lg px-3 py-2 text-sm bg-[var(--surface)] text-[var(--ink)]"
            aria-label="Shopify store domain"
          />
          <button type="button" onClick={connect} disabled={!shop.trim()} className="btn-primary px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50" style={{ background: 'var(--grad-brand, var(--brand))' }}>
            Connect Shopify →
          </button>
          {conn?.status === 'error' && <span className="text-xs text-[var(--fail)] self-center">Authorization expired — reconnect.</span>}
        </div>
      )}

      {state === 'ready' && conn?.status === 'connected' && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="inline-flex items-center gap-1 rounded-full bg-[var(--brand-soft)] text-[var(--brand-ink)] px-2.5 py-1 text-xs font-semibold">
              <CheckCircle2 size={12} /> Connected · {conn.shop_domain}
            </span>
            <label className="inline-flex items-center gap-2 text-xs text-[var(--ink-2)] cursor-pointer ml-auto">
              <input type="checkbox" checked={conn.auto_apply} disabled={busy} onChange={(e) => toggleAuto(e.target.checked)} />
              <Zap size={12} className="text-[var(--amber)]" /> Auto mode (fix without approval)
            </label>
            <button type="button" onClick={runNow} disabled={busy} className="inline-flex items-center gap-1 text-xs font-semibold border border-[var(--border)] rounded-lg px-3 py-1.5 text-[var(--ink-2)] hover:bg-[var(--surface-2)] disabled:opacity-50">
              {busy ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Scan &amp; fix now
            </button>
          </div>
          {r && (
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {[
                ['Products scanned', r.scanned ?? '—'],
                ['New proposals', r.proposed ?? '—'],
                ['Fixed & verified', r.verified ?? 0],
                ['Skipped (merchant edits)', r.conflict ?? 0],
                ['Failed', r.failed ?? 0],
              ].map(([label, value]) => (
                <div key={label as string} className="rounded-xl bg-[var(--surface-2)] px-3 py-2">
                  <div className="text-[10px] uppercase tracking-wider text-[var(--ink-3)] font-semibold">{label}</div>
                  <div className="text-lg font-bold text-[var(--ink)]">{value}</div>
                </div>
              ))}
            </div>
          )}
          <p className="text-xs text-[var(--ink-3)]">
            {conn.last_run_at ? `Last auto run ${new Date(conn.last_run_at).toLocaleString()}` : 'No auto run yet.'}
            {r?.remaining ? ` · ${r.remaining} fixes continuing in the next batch` : ''}
            {r?.halted ? ` · Stopped: ${r.halted}` : ''}
            {r?.error ? ` · Error: ${r.error}` : ''}
            {' · Runs daily; new issues are fixed automatically.'}
          </p>
        </div>
      )}
    </div>
  );
}
