'use client';

import { useState } from 'react';
import { PenLine, Loader2, Copy, Check } from 'lucide-react';

/** Per-brief "Generate draft" action (Gumshoe "Act → Content generation"). */
function GenerateDraft({ brief }: { brief: Record<string, unknown> }) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [draft, setDraft] = useState('');
  const [msg, setMsg] = useState('');
  const [copied, setCopied] = useState(false);

  async function generate() {
    setStatus('loading');
    setMsg('');
    try {
      const res = await fetch('/api/generate-content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: String(brief.title ?? ''),
          targetKeyword: String(brief.targetKeyword ?? ''),
          goal: String(brief.goal ?? ''),
          outline: Array.isArray(brief.outline) ? brief.outline : [],
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Generation failed');
      setDraft(j.draft);
      setStatus('done');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Generation failed');
      setStatus('error');
    }
  }

  return (
    <div className="mt-4">
      {status !== 'done' && (
        <button
          onClick={generate}
          disabled={status === 'loading'}
          className="no-print flex items-center gap-2 h-11 px-3.5 rounded-lg bg-[var(--brand)] text-white text-sm font-semibold hover:brightness-95 transition-all disabled:opacity-60"
        >
          {status === 'loading' ? <Loader2 size={15} className="animate-spin" /> : <PenLine size={15} />}
          {status === 'loading' ? 'Writing draft…' : 'Generate draft'}
        </button>
      )}
      {status === 'error' && <p className="text-xs text-[var(--fail)] mt-2">{msg}</p>}
      {status === 'done' && (
        <div className="rounded-xl bg-[var(--surface-2)] border border-[var(--border)] p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs uppercase tracking-wider font-bold text-[var(--brand-ink)]">Generated draft</span>
            <button
              onClick={() => { navigator.clipboard?.writeText(draft); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
              className="no-print flex items-center gap-1 text-xs font-medium text-[var(--ink-2)] hover:text-[var(--ink)]"
            >
              {copied ? <Check size={13} className="text-[var(--pass)]" /> : <Copy size={13} />} {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          <pre className="text-sm text-[var(--ink-2)] whitespace-pre-wrap font-sans max-h-96 overflow-y-auto">{draft}</pre>
        </div>
      )}
    </div>
  );
}

export default function ContentBriefs({ briefs }: { briefs: Array<Record<string, unknown>> }) {
  if (!briefs || briefs.length === 0) return null;

  return (
    <div id="content-generation" className="mt-8 scroll-mt-20">
      <h3 className="text-lg sm:text-xl font-bold text-[var(--ink)] mb-2">Content Briefs — Top Keyword Opportunities</h3>
      <p className="text-sm text-[var(--muted)] mb-6">Ready-to-brief content specs — or generate a publish-ready draft in one click.</p>

      <div className="space-y-6">
        {briefs.map((brief, idx) => (
          <div key={idx} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 sm:p-6 relative overflow-hidden">
            
            {/* Header */}
            <div className="flex justify-between items-start flex-wrap gap-2 mb-4">
              <h4 className="text-lg font-bold text-[var(--ink)]">#{String(brief.id)} — &quot;{String(brief.title)}&quot;</h4>
              <span className={`px-3 py-1 text-xs font-bold uppercase rounded-full border ${idx === 0 ? 'bg-[rgba(231,76,60,0.15)] text-[#e74c3c] border-[#e74c3c]/30' : 'bg-[rgba(243,156,18,0.15)] text-[#f39c12] border-[#f39c12]/30'}`}>
                {idx === 0 ? 'High Priority' : 'Medium Priority'}
              </span>
            </div>

            {/* Meta Tags */}
            <div className="flex flex-wrap gap-2 mb-4">
              <span className="bg-[var(--surface-2)] border border-[var(--border)] rounded-full px-3 py-1 text-xs text-[var(--muted)]">Target Keyword: <strong className="text-[var(--ink)]">{String(brief.targetKeyword)}</strong></span>
              <span className="bg-[var(--surface-2)] border border-[var(--border)] rounded-full px-3 py-1 text-xs text-[var(--muted)]">Volume (AI est.): <strong className="text-[var(--ink)]">{String(brief.volume)}</strong></span>
              <span className="bg-[var(--surface-2)] border border-[var(--border)] rounded-full px-3 py-1 text-xs text-[var(--muted)]">Difficulty (AI est.): <strong className="text-[var(--ink)]">{String(brief.difficulty)}</strong></span>
              <span className="bg-[var(--surface-2)] border border-[var(--border)] rounded-full px-3 py-1 text-xs text-[var(--muted)]">Funnel Stage: <strong className="text-[var(--ink)]">{String(brief.funnelStage)}</strong></span>
            </div>

            {/* Goal */}
            <div className="mb-4">
              <div className="text-[10px] uppercase tracking-widest font-bold text-[var(--brand-ink)] mb-1">Goal</div>
              <p className="text-sm text-[var(--ink-2)] leading-relaxed">{String(brief.goal)}</p>
            </div>

            {/* Outline Block */}
            <div className="mb-2">
              <div className="text-[10px] uppercase tracking-widest font-bold text-[var(--brand-ink)] mb-2">Recommended Outline</div>
              <div className="bg-[var(--surface-2)] border-l-[3px] border-[var(--brand)] rounded-r-lg p-4">
                 <ul className="space-y-1">
                   {/* Guard against a null/malformed outline from the AI response instead of crashing (B6-adjacent). */}
                   {(Array.isArray(brief.outline) ? (brief.outline as string[]) : []).map((point: string, pIdx: number) => (
                      <li key={pIdx} className="text-sm text-[var(--ink-2)]">
                        {point.includes('H1') || point.includes('H2') ? 
                            <strong className="text-[var(--ink)]">{point}</strong> : 
                            <span className="pl-4 text-[var(--muted)]">→ {point}</span>
                        }
                      </li>
                   ))}
                 </ul>
              </div>
            </div>

            <GenerateDraft brief={brief} />

          </div>
        ))}
      </div>
    </div>
  );
}
