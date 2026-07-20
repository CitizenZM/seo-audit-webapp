'use client';

import { useState } from 'react';
import { Download, Loader2, FileCode2, FileJson, HelpCircle } from 'lucide-react';

type Kind = 'llms-txt' | 'schema' | 'faq-markup';

interface Artifact {
  kind: Kind;
  label: string;
  description: string;
  icon: typeof FileCode2;
}

const artifacts: Artifact[] = [
  { kind: 'llms-txt', label: 'llms.txt', description: 'A machine-readable summary AI crawlers can use to understand this site quickly.', icon: FileCode2 },
  { kind: 'schema', label: 'Organization Schema (JSON-LD)', description: 'Structured Organization markup to help AI engines identify and cite the brand correctly.', icon: FileJson },
  { kind: 'faq-markup', label: 'FAQ Markup', description: 'FAQPage schema built from common buyer questions, formatted for AI answer extraction.', icon: HelpCircle },
];

/**
 * AI-Ready Artifacts — one-click downloads of activation deliverables built
 * from the audit result, posted to /api/activation and returned as a file.
 */
export default function ActivationCard({ auditPayload }: { auditPayload?: unknown }) {
  const [pending, setPending] = useState<Kind | null>(null);
  const [error, setError] = useState('');

  async function download(kind: Kind) {
    setPending(kind);
    setError('');
    try {
      const res = await fetch('/api/activation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind, payload: auditPayload ?? {} }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || 'Failed to generate artifact');
      }
      const blob = await res.blob();
      const disposition = res.headers.get('Content-Disposition') || '';
      const match = /filename="?([^"]+)"?/.exec(disposition);
      const filename = match?.[1] || `${kind}.txt`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate artifact');
    } finally {
      setPending(null);
    }
  }

  return (
    <div id="activation" className="no-print card p-4 sm:p-6 scroll-mt-20">
      <h3 className="text-base font-bold text-[var(--ink)] flex items-center gap-2 mb-1">
        <Download size={18} className="text-[var(--brand)]" /> AI-Ready Artifacts
      </h3>
      <p className="text-sm text-[var(--ink-3)] mb-4">
        Download deliverables generated from this audit to make the site more legible to AI crawlers and answer engines.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {artifacts.map((a) => {
          const Icon = a.icon;
          const isPending = pending === a.kind;
          return (
            <div key={a.kind} className="rounded-xl bg-[var(--surface-2)] border border-[var(--border)] p-4 flex flex-col">
              <Icon size={20} className="text-[var(--brand)] mb-2" />
              <div className="text-sm font-semibold text-[var(--ink)] mb-1">{a.label}</div>
              <p className="text-xs text-[var(--ink-3)] flex-1 mb-3">{a.description}</p>
              <button
                onClick={() => download(a.kind)}
                disabled={pending !== null}
                className="h-9 px-3 rounded-lg bg-[var(--brand)] text-white text-xs font-semibold hover:brightness-95 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isPending ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                {isPending ? 'Generating…' : 'Download'}
              </button>
            </div>
          );
        })}
      </div>
      {error && <p className="text-xs text-[var(--fail)] mt-3">{error}</p>}
    </div>
  );
}
