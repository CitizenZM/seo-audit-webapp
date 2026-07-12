'use client';

import { Bot, CheckCircle2, XCircle, Sparkles, FileText, Clock, HelpCircle, Code } from 'lucide-react';

interface BotAccess { name: string; engine: string; allowed: boolean }
interface Geo {
  score: number;
  botAccess: BotAccess[];
  botsAllowed: number;
  botsTotal: number;
  hasLlmsTxt: boolean;
  answerableHeadings: number;
  aiSchemaTypes: string[];
  hasFreshnessSignal: boolean;
  freshnessDate: string | null;
  noJsContentWords: number;
  noJsContentOk: boolean;
  recommendations: string[];
}

function scoreTone(score: number) {
  if (score >= 80) return { color: 'var(--brand)', soft: 'var(--brand-soft)' };
  if (score >= 50) return { color: 'var(--amber)', soft: 'var(--amber-soft)' };
  return { color: 'var(--red)', soft: 'var(--red-soft)' };
}

export default function GeoCard({ geo }: { geo: Geo }) {
  if (!geo) return null;
  const tone = scoreTone(geo.score);

  const checks = [
    { icon: Code, label: 'AI-friendly structured data', ok: geo.aiSchemaTypes.length > 0, detail: geo.aiSchemaTypes.length ? geo.aiSchemaTypes.join(', ') : 'None detected' },
    { icon: HelpCircle, label: 'Answerable Q&A headings', ok: geo.answerableHeadings >= 3, detail: `${geo.answerableHeadings} found` },
    { icon: FileText, label: 'No-JS content (AI crawlers)', ok: geo.noJsContentOk, detail: `${geo.noJsContentWords} words without JS` },
    { icon: Clock, label: 'Freshness signal', ok: geo.hasFreshnessSignal, detail: geo.freshnessDate ? new Date(geo.freshnessDate).toLocaleDateString() : 'No date exposed' },
    { icon: FileText, label: 'llms.txt present', ok: geo.hasLlmsTxt, detail: geo.hasLlmsTxt ? 'Found' : 'Missing' },
  ];

  return (
    <div id="geo" className="card p-6 scroll-mt-20">
      <div className="flex items-start justify-between flex-wrap gap-4 mb-5">
        <div>
          <h3 className="text-base font-bold text-[var(--ink)] flex items-center gap-2">
            <Sparkles size={18} className="text-[var(--brand)]" /> Generative Engine Optimization (GEO)
          </h3>
          <p className="text-sm text-[var(--ink-3)] mt-0.5 max-w-xl">
            How visible this site is to AI answer engines — ChatGPT, Perplexity, Claude, and Google&apos;s AI Overviews.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div
            className="relative w-14 h-14 rounded-full shrink-0"
            style={{ background: `conic-gradient(${tone.color} ${geo.score * 3.6}deg, var(--surface-2) 0deg)` }}
          >
            <div className="absolute inset-[3px] rounded-full bg-[var(--surface)] flex items-center justify-center text-xs font-bold" style={{ color: tone.color }}>
              {geo.score}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-wider text-[var(--ink-3)] font-semibold">AI Visibility</div>
            <div className="text-3xl font-extrabold leading-none" style={{ color: tone.color }}>{geo.score}<span className="text-lg text-[var(--ink-3)]">/100</span></div>
          </div>
        </div>
      </div>

      {/* AI crawler access */}
      <div className="mb-5">
        <div className="flex items-center gap-2 mb-3">
          <Bot size={15} className="text-[var(--ink-2)]" />
          <span className="text-sm font-semibold text-[var(--ink)]">AI Crawler Access</span>
          <span className="text-xs text-[var(--ink-3)]">{geo.botsAllowed}/{geo.botsTotal} allowed</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {geo.botAccess.map((b) => (
            <div key={b.name} className="flex items-center justify-between px-3 py-2 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] hover:border-[var(--brand)]/30 transition-colors">
              <div className="min-w-0">
                <div className="text-sm font-medium text-[var(--ink)] truncate">{b.name}</div>
                <div className="text-[11px] text-[var(--ink-3)] truncate">{b.engine}</div>
              </div>
              {b.allowed
                ? <span className="flex items-center gap-1 text-xs font-semibold text-[var(--pass)] shrink-0"><CheckCircle2 size={14} /> Allowed</span>
                : <span className="flex items-center gap-1 text-xs font-semibold text-[var(--fail)] shrink-0"><XCircle size={14} /> Blocked</span>}
            </div>
          ))}
        </div>
      </div>

      {/* Readiness checks */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 mb-5">
        {checks.map((c) => (
          <div key={c.label} className="flex items-start gap-2.5 px-3 py-2.5 rounded-lg bg-[var(--surface-2)] border border-[var(--border)]">
            {c.ok
              ? <CheckCircle2 size={16} className="text-[var(--pass)] mt-0.5 shrink-0" />
              : <XCircle size={16} className="text-[var(--fail)] mt-0.5 shrink-0" />}
            <div className="min-w-0">
              <div className="text-sm font-medium text-[var(--ink)]">{c.label}</div>
              <div className="text-xs text-[var(--ink-3)]">{c.detail}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Recommendations */}
      {geo.recommendations.length > 0 && (
        <div className="rounded-xl bg-[var(--brand-soft)] border border-[var(--brand)]/15 p-4">
          <div className="text-xs uppercase tracking-wider font-bold text-[var(--brand-ink)] mb-2">How to improve AI visibility</div>
          <ul className="flex flex-col gap-2">
            {geo.recommendations.map((r, i) => (
              <li key={i} className="text-sm text-[var(--ink-2)] flex gap-2">
                <span className="text-[var(--brand)] font-bold shrink-0">{i + 1}.</span> {r}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
