'use client';

import { useState } from 'react';
import { Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip } from 'chart.js';
import { AlertCircle, Eye, ChevronDown, ChevronUp, MessageSquare, KeyRound } from 'lucide-react';
import type { VisibilityResult } from '@/lib/visibility';

ChartJS.register(ArcElement, Tooltip);

/**
 * Brand Visibility hero — Gumshoe-style "Visibility audit" section:
 * donut % + low-visibility warning banner + competitive leaderboard +
 * expandable per-prompt conversation results.
 */
export default function VisibilityCard({ visibility, domain }: { visibility: VisibilityResult | null; domain: string }) {
  const [showPrompts, setShowPrompts] = useState(false);

  // Not configured — show setup state rather than fake numbers.
  if (!visibility) {
    return (
      <div id="visibility" className="card p-6 scroll-mt-20">
        <h3 className="text-base font-bold text-[var(--ink)] flex items-center gap-2 mb-2">
          <Eye size={18} className="text-[var(--brand)]" /> Brand Visibility in AI Answers
        </h3>
        <div className="flex items-start gap-3 rounded-xl bg-[var(--amber-soft)] border border-[var(--amber)]/20 p-4">
          <KeyRound size={18} className="text-[var(--amber)] mt-0.5 shrink-0" />
          <p className="text-sm text-[var(--ink-2)]">
            Visibility probing asks a real AI assistant consumer questions in your category and measures how often
            your brand is recommended. Set <code className="text-xs bg-[var(--surface-2)] px-1.5 py-0.5 rounded">ANTHROPIC_API_KEY</code> on
            the deployment to enable it.
          </p>
        </div>
      </div>
    );
  }

  const pct = visibility.visibilityPct;
  const low = pct < 10;
  const tone = pct >= 40 ? 'var(--brand)' : pct >= 10 ? 'var(--amber)' : 'var(--red)';

  const donut = {
    labels: ['Visible', 'Not mentioned'],
    datasets: [{
      data: [pct, 100 - pct],
      backgroundColor: [tone, '#eceef2'],
      borderWidth: 0,
    }],
  };

  return (
    <div id="visibility" className="card p-6 scroll-mt-20">
      <div className="flex items-start justify-between flex-wrap gap-3 mb-4">
        <div>
          <h3 className="text-base font-bold text-[var(--ink)] flex items-center gap-2">
            <Eye size={18} className="text-[var(--brand)]" /> Brand Visibility in AI Answers
          </h3>
          <p className="text-sm text-[var(--ink-3)] mt-0.5 max-w-xl">
            {visibility.totalPrompts} consumer prompts probed · {visibility.brandsSeen} brands mentioned across the answers.
          </p>
        </div>
      </div>

      {/* Low-visibility warning banner (Gumshoe-style) */}
      {low && (
        <div className="flex items-start gap-3 rounded-xl bg-[var(--amber-soft)] border border-[var(--amber)]/25 p-4 mb-5">
          <AlertCircle size={18} className="text-[var(--amber)] mt-0.5 shrink-0" />
          <div>
            <div className="font-bold text-[var(--ink)] text-sm">Your visibility is low.</div>
            <p className="text-sm text-[var(--ink-2)] mt-0.5">
              Brands under 10% visibility risk falling behind as AI search becomes the primary way buyers discover
              products. The GEO recommendations below are the fastest levers to change this.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Donut */}
        <div className="flex items-center gap-6">
          <div className="relative w-36 h-36 shrink-0">
            <Doughnut data={donut} options={{ cutout: '74%', plugins: { legend: { display: false }, tooltip: { enabled: false } } }} />
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-3xl font-extrabold" style={{ color: tone }}>{pct}%</span>
            </div>
          </div>
          <div className="text-sm text-[var(--ink-2)]">
            <span className="font-semibold text-[var(--ink)]">{visibility.targetBrand}</span> appeared in{' '}
            <span className="font-semibold" style={{ color: tone }}>
              {visibility.prompts.filter((p) => p.mentioned).length} of {visibility.totalPrompts}
            </span>{' '}
            AI answers to category questions a real buyer would ask.
          </div>
        </div>

        {/* Competitive leaderboard */}
        <div id="leaderboard" className="scroll-mt-20">
          <div className="text-xs uppercase tracking-wider font-semibold text-[var(--ink-3)] mb-2">Competitive Leaderboard</div>
          <div className="flex flex-col">
            <div className="grid grid-cols-[2rem_1fr_5rem_5rem] gap-2 px-2 py-1.5 text-[11px] uppercase tracking-wider text-[var(--ink-3)] font-semibold">
              <span>Rank</span><span>Brand</span><span className="text-right">Mentions</span><span className="text-right">Visibility</span>
            </div>
            {visibility.leaderboard.slice(0, 6).map((e, i) => (
              <div
                key={e.brand + i}
                className={`grid grid-cols-[2rem_1fr_5rem_5rem] gap-2 px-2 py-2 rounded-lg text-sm items-center ${e.isYou ? 'bg-[var(--brand-soft)] border border-[var(--brand)]/20' : 'border-b border-[var(--border)] last:border-0'}`}
              >
                <span className="font-bold text-[var(--ink-3)]">{i + 1}</span>
                <span className={`truncate font-medium ${e.isYou ? 'text-[var(--brand-ink)]' : 'text-[var(--ink)]'}`}>
                  {e.brand}{e.isYou ? ' · You' : ''}
                </span>
                <span className="text-right text-[var(--ink-2)]">{e.mentions}</span>
                <span className="text-right font-semibold text-[var(--ink)]">{e.visibilityPct}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Per-prompt conversations (expandable) */}
      <button
        onClick={() => setShowPrompts((s) => !s)}
        className="no-print mt-5 flex items-center gap-2 text-sm font-medium text-[var(--brand-ink)] hover:underline"
      >
        <MessageSquare size={15} /> {showPrompts ? 'Hide' : 'View'} probed conversations
        {showPrompts ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
      </button>
      {showPrompts && (
        <ul className="mt-3 flex flex-col gap-2">
          {visibility.prompts.map((p, i) => (
            <li key={i} className="rounded-lg bg-[var(--surface-2)] border border-[var(--border)] px-3 py-2.5">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-[var(--ink)]">&ldquo;{p.prompt}&rdquo;</span>
                {p.mentioned
                  ? <span className="text-xs font-semibold text-[var(--pass)] shrink-0">Mentioned ✓</span>
                  : <span className="text-xs font-semibold text-[var(--fail)] shrink-0">Not mentioned</span>}
              </div>
              {p.brands.length > 0 && (
                <div className="text-xs text-[var(--ink-3)] mt-1 truncate">Brands in answer: {p.brands.join(', ')}</div>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="text-[11px] text-[var(--ink-3)] mt-3">Probed against Claude (claude-haiku). Domain: {domain}</p>
    </div>
  );
}
