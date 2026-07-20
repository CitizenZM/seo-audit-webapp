'use client';

import { useEffect, useState } from 'react';
import { Settings2, X, Check, Loader2 } from 'lucide-react';
import { sanitizeBranding, BRANDING_LOCALSTORAGE_KEY, type Branding } from '@/lib/branding';

/**
 * "White-label" settings panel (#10 agency feature) — lets a user replace
 * the default report chrome (product name, accent color, "Powered by" line)
 * with their own agency branding.
 *
 * Tries the API first (persists per-user across devices via Supabase), and
 * always mirrors to localStorage so the feature keeps working signed-out or
 * when Supabase isn't configured — ReportHeader/report page read from
 * localStorage synchronously on mount for that reason.
 */

function readLocalBranding(): Branding {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(BRANDING_LOCALSTORAGE_KEY);
    if (!raw) return {};
    return sanitizeBranding(JSON.parse(raw));
  } catch {
    return {};
  }
}

function writeLocalBranding(branding: Branding) {
  try {
    window.localStorage.setItem(BRANDING_LOCALSTORAGE_KEY, JSON.stringify(branding));
    // Let same-tab listeners (ReportHeader/page) know without a full reload.
    window.dispatchEvent(new CustomEvent('agency-branding-updated', { detail: branding }));
  } catch {
    /* localStorage unavailable (private mode, quota) — best effort only */
  }
}

export default function BrandingSettings() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Branding>({});
  const [status, setStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [error, setError] = useState('');

  useEffect(() => {
    setForm(readLocalBranding());
    fetch('/api/branding')
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (json?.branding && Object.keys(json.branding).length > 0) {
          const clean = sanitizeBranding(json.branding);
          setForm(clean);
          writeLocalBranding(clean);
        }
      })
      .catch(() => {
        /* API unavailable (signed out / Supabase not configured) — localStorage already loaded */
      });
  }, []);

  async function handleSave() {
    setStatus('saving');
    setError('');
    const clean = sanitizeBranding(form);
    writeLocalBranding(clean);

    try {
      const res = await fetch('/api/branding', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(clean),
      });
      if (!res.ok && res.status !== 401 && res.status !== 501) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || 'Failed to save branding');
      }
      // 401/501 are fine — localStorage already has it, which is the
      // signed-out/no-Supabase fallback this feature is designed around.
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save to your account (saved locally instead)');
    }

    setStatus('saved');
    setTimeout(() => setStatus('idle'), 1500);
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="White-label branding settings"
        title="White-label branding"
        className="no-print flex items-center gap-1.5 h-10 sm:h-9 px-2.5 sm:px-3 rounded-lg border border-[var(--border)] text-sm font-medium text-[var(--ink-2)] hover:bg-[var(--surface-2)] transition-colors"
      >
        <Settings2 size={15} /> <span className="hidden sm:inline">White-label</span>
      </button>

      {open && (
        <div className="no-print fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/40 p-3 sm:p-6" onClick={() => setOpen(false)}>
          <div
            className="card w-full max-w-md p-4 sm:p-6 mt-16 sm:mt-0"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-[var(--ink)]">White-label this report</h3>
              <button onClick={() => setOpen(false)} aria-label="Close" className="text-[var(--ink-3)] hover:text-[var(--ink)]">
                <X size={18} />
              </button>
            </div>

            <div className="flex flex-col gap-3">
              <label className="text-sm">
                <span className="block text-xs font-semibold text-[var(--ink-2)] mb-1">Agency name</span>
                <input
                  type="text"
                  value={form.agencyName ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, agencyName: e.target.value }))}
                  placeholder="Acme SEO Co."
                  maxLength={80}
                  className="w-full h-10 px-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] text-sm"
                />
              </label>

              <label className="text-sm">
                <span className="block text-xs font-semibold text-[var(--ink-2)] mb-1">Logo URL (https)</span>
                <input
                  type="url"
                  value={form.logoUrl ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, logoUrl: e.target.value }))}
                  placeholder="https://cdn.example.com/logo.png"
                  className="w-full h-10 px-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] text-sm"
                />
              </label>

              <label className="text-sm">
                <span className="block text-xs font-semibold text-[var(--ink-2)] mb-1">Accent color</span>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={/^#[0-9a-fA-F]{6}$/.test(form.accentColor ?? '') ? form.accentColor : '#16a34a'}
                    onChange={(e) => setForm((f) => ({ ...f, accentColor: e.target.value }))}
                    className="w-10 h-10 rounded-lg border border-[var(--border)] bg-transparent cursor-pointer"
                  />
                  <input
                    type="text"
                    value={form.accentColor ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, accentColor: e.target.value }))}
                    placeholder="#16a34a"
                    className="flex-1 h-10 px-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] text-sm"
                  />
                </div>
              </label>

              <label className="text-sm">
                <span className="block text-xs font-semibold text-[var(--ink-2)] mb-1">Contact email</span>
                <input
                  type="email"
                  value={form.contactEmail ?? ''}
                  onChange={(e) => setForm((f) => ({ ...f, contactEmail: e.target.value }))}
                  placeholder="hello@acme.io"
                  className="w-full h-10 px-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-[var(--ink)] text-sm"
                />
              </label>

              <label className="flex items-center gap-2 text-sm text-[var(--ink-2)]">
                <input
                  type="checkbox"
                  checked={!!form.hidePoweredBy}
                  onChange={(e) => setForm((f) => ({ ...f, hidePoweredBy: e.target.checked }))}
                  className="w-4 h-4"
                />
                Hide &quot;Powered by&quot; line
              </label>

              {error && <p className="text-xs text-[var(--fail)]">{error}</p>}

              <button
                onClick={handleSave}
                disabled={status === 'saving'}
                className="mt-1 flex items-center justify-center gap-1.5 h-10 rounded-lg text-white text-sm font-semibold hover:brightness-105 transition-all disabled:opacity-60"
                style={{ background: 'var(--grad-brand)' }}
              >
                {status === 'saving' ? <Loader2 size={15} className="animate-spin" /> : status === 'saved' ? <Check size={15} /> : null}
                {status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved' : 'Save branding'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
