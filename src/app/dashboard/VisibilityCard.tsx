'use client';

import { useState } from 'react';
import { Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip } from 'chart.js';
import { AlertCircle, Eye, ChevronDown, ChevronUp, MessageSquare, KeyRound, Bot, UserRound, Tags, Smile } from 'lucide-react';
import type { VisibilityResult } from '@/lib/visibility';

ChartJS.register(ArcElement, Tooltip);

/**
 * Brand Visibility hero — Gumshoe-style "Visibility audit":
 * donut % · low-visibility banner · competitive leaderboard · per-model /
 * per-persona / per-topic slices · brand perception · probed conversations.
 */
export default function VisibilityCard({ visibility, domain }: { visibility: VisibilityResult | null; domain: string }) {
  const [showPrompts, setShowPrompts] = useState(false);

  if (!visibility) {
    return (
      <div id="visibility" className="card p-4 sm:p-6 scroll-mt-20">
        <h3 className="text-base font-bold text-[var(--ink)] flex items-center gap-2 mb-2">
          <Eye size={18} className="text-[var(--brand)]" /> Brand Visibility in AI Answers
        </h3>
        <div className="flex items-start gap-3 rounded-xl bg-[var(--amber-soft)] border border-[var(--amber)]/20 p-4">
          <KeyRound size={18} className="text-[var(--amber)] mt-0.5 shrink-0" />
          <p className="text-sm text-[var(--ink-2)]">
            Visibility probing asks real AI assistants consumer questions in your category and measures how often
            your brand is recommended. Set <code className="text-xs bg-[var(--surface-2)] px-1.5 py-0.5 rounded">OPENAI_API_KEY</code> on
            the deployment to enable it.
          </p>
        </div>
        <span id="personas" className="scroll-mt-20" />
      </div>
    );
  }

  const pct = visibility.visibilityPct;
  const low = pct < 10;
  const tone = pct >= 40 ? 'var(--brand)' : pct >= 10 ? 'var(--amber)' : 'var(--red)';

  const donut = {
    labels: ['Visible', 'Not mentioned'],
    datasets: [{ data: [pct, 100 - pct], backgroundColor: [tone, '#eceef2'], borderWidth: 0 }],
  };

  const sentimentTone: Record<string, string> = {
    positive: 'var(--pass)', neutral: 'var(--ink-3)', mixed: 'var(--warn)', negative: 'var(--fail)', not_discussed: 'var(--ink-3)',
  };

  const sliceBlock = (title: string, icon: React.ReactNode, slices: { label: string; visibilityPct: number; prompts: number }[], id?: string) => (
    <div id={id} className={id ? 'scroll-mt-20' : undefined}>
      <div className="flex items-center gap-1.5 text-xs uppercase tracking-wider font-semibold text-[var(--ink-3)] mb-2">{icon}{title}</div>
      <div className="flex flex-col gap-1.5">
        {slices.map((s) => (
          <div key={s.label} className="flex items-center gap-2">
            <span className="text-sm text-[var(--ink-2)] w-24 sm:w-40 truncate shrink-0" title={s.label}>{s.label}</span>
            <div className="flex-1 h-2 rounded-full bg-[var(--surface-2)] overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${Math.max(2, s.visibilityPct)}%`, background: s.visibilityPct >= 40 ? 'var(--brand)' : s.visibilityPct >= 10 ? 'var(--amber)' : 'var(--red)' }} />
            </div>
            <span className="text-sm font-semibold text-[var(--ink)] w-10 text-right shrink-0">{s.visibilityPct}%</span>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div id="visibility" className="card p-4 sm:p-6 scroll-mt-20">
      <div className="flex items-start justify-between flex-wrap gap-3 mb-4">
        <div>
          <h3 className="text-base font-bold text-[var(--ink)] flex items-center gap-2">
            <Eye size={18} className="text-[var(--brand)]" /> Brand Visibility in AI Answers
          </h3>
          <p className="text-sm text-[var(--ink-3)] mt-0.5 max-w-xl">
            {visibility.totalPrompts} answers probed across {visibility.models.length} model{visibility.models.length === 1 ? '' : 's'} ·{' '}
            {visibility.brandsSeen} brands mentioned.
          </p>
        </div>
      </div>

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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 sm:gap-6">
        {/* Donut + perception */}
        <div>
          <div className="flex items-center gap-4 sm:gap-6">
            <div className="relative w-28 h-28 sm:w-36 sm:h-36 shrink-0">
              <Doughnut data={donut} options={{ cutout: '74%', plugins: { legend: { display: false }, tooltip: { enabled: false } } }} />
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-2xl sm:text-3xl font-extrabold" style={{ color: tone }}>{pct}%</span>
              </div>
            </div>
            <div className="text-sm text-[var(--ink-2)]">
              <span className="font-semibold text-[var(--ink)]">{visibility.targetBrand}</span> appeared in{' '}
              <span className="font-semibold" style={{ color: tone }}>
                {visibility.prompts.filter((p) => p.mentioned).length} of {visibility.totalPrompts}
              </span>{' '}
              AI answers to real buyer questions.
            </div>
          </div>

          {/* Brand perception */}
          {visibility.perception && (
            <div className="mt-4 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] p-4">
              <div className="flex items-center gap-1.5 text-xs uppercase tracking-wider font-semibold text-[var(--ink-3)] mb-1.5">
                <Smile size={13} /> AI Brand Perception
                <span className="ml-1 px-2 py-0.5 rounded-full text-[10px] font-bold" style={{ color: '#fff', background: sentimentTone[visibility.perception.sentiment] ?? 'var(--ink-3)' }}>
                  {visibility.perception.sentiment.replace('_', ' ')}
                </span>
              </div>
              <p className="text-sm text-[var(--ink-2)]">{visibility.perception.summary}</p>
              {visibility.perception.descriptors.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {visibility.perception.descriptors.map((d) => (
                    <span key={d} className="text-xs px-2 py-0.5 rounded-full bg-[var(--surface)] border border-[var(--border)] text-[var(--ink-2)]">{d}</span>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Competitive leaderboard */}
        <div id="leaderboard" className="scroll-mt-20">
          <div className="text-xs uppercase tracking-wider font-semibold text-[var(--ink-3)] mb-2">Competitive Leaderboard</div>
          <div className="flex flex-col">
            <div className="grid grid-cols-[1.5rem_1fr_4rem_4rem] sm:grid-cols-[2rem_1fr_5rem_5rem] gap-1.5 sm:gap-2 px-2 py-1.5 text-[10px] sm:text-[11px] uppercase tracking-wider text-[var(--ink-3)] font-semibold">
              <span>Rank</span><span>Brand</span><span className="text-right">Mentions</span><span className="text-right">Visibility</span>
            </div>
            {visibility.leaderboard.slice(0, 6).map((e, i) => (
              <div
                key={e.brand + i}
                className={`grid grid-cols-[1.5rem_1fr_4rem_4rem] sm:grid-cols-[2rem_1fr_5rem_5rem] gap-1.5 sm:gap-2 px-2 py-2 rounded-lg text-sm items-center transition-colors ${e.isYou ? 'bg-[var(--brand-soft)] border border-[var(--brand)]/20' : 'border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface-2)]'}`}
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

      {/* Slices: model / persona / topic */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6 pt-5 border-t border-[var(--border)]">
        {sliceBlock('Model visibility', <Bot size={13} />, visibility.models)}
        {sliceBlock('Persona visibility', <UserRound size={13} />, visibility.personas, 'personas')}
        {sliceBlock('Topic visibility', <Tags size={13} />, visibility.topics)}
      </div>

      {/* Persona definitions */}
      {visibility.personaDefs.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {visibility.personaDefs.map((p) => (
            <span key={p.name} className="text-xs px-2.5 py-1 rounded-full bg-[var(--surface-2)] border border-[var(--border)] text-[var(--ink-2)]" title={p.description}>
              <span className="font-semibold text-[var(--ink)]">{p.name}</span> — {p.description}
            </span>
          ))}
        </div>
      )}

      {/* Per-prompt conversations */}
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
              <div className="text-[11px] text-[var(--ink-3)] mt-1">{p.model} · {p.persona} · {p.topic}</div>
              {p.brands.length > 0 && (
                <div className="text-xs text-[var(--ink-3)] mt-1 truncate">Brands in answer: {p.brands.join(', ')}</div>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="text-[11px] text-[var(--ink-3)] mt-3">Models probed: {visibility.models.map((m) => m.label).join(', ')} · Domain: {domain}</p>
    </div>
  );
}
