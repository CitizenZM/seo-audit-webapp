'use client';

import { Rocket, ArrowRight, Zap, CheckCircle2 } from 'lucide-react';
import type { OptimizationPlan } from '@/lib/optimizationPlan';

const EFFORT_TONE: Record<string, string> = { Low: 'var(--pass)', Medium: 'var(--warn)', High: 'var(--fail)' };
const IMPACT_TONE: Record<string, string> = { Low: 'var(--ink-3)', Medium: 'var(--blue)', High: 'var(--brand)' };

/**
 * The Optimization Plan — the answer to "what do I do, and what do I get?".
 * Every other card in the report describes the CURRENT state; this is the
 * only one that projects a FUTURE state (current → projected score per
 * category, plus concrete prioritized actions and a realistic timeframe).
 */
export default function OptimizationPlanCard({ plan }: { plan: OptimizationPlan | null }) {
  if (!plan) return null;

  const delta = plan.projectedOverallScore - plan.currentOverallScore;

  return (
    <div id="optimization-plan" className="card p-6 scroll-mt-20">
      <div className="flex items-start justify-between flex-wrap gap-4 mb-5">
        <div>
          <h3 className="text-base font-bold text-[var(--ink)] flex items-center gap-2">
            <Rocket size={18} className="text-[var(--brand)]" /> Optimization Plan &amp; Projected Results
          </h3>
          <p className="text-sm text-[var(--ink-3)] mt-0.5 max-w-2xl">{plan.summary}</p>
        </div>
        <div className="flex items-center gap-3 shrink-0 bg-[var(--surface-2)] rounded-xl px-4 py-3 border border-[var(--border)]">
          <div className="text-center">
            <div className="text-[10px] uppercase tracking-wider text-[var(--ink-3)] font-semibold">Current</div>
            <div className="text-2xl font-extrabold text-[var(--ink)]">{plan.currentOverallScore}</div>
          </div>
          <ArrowRight size={18} className="text-[var(--ink-3)]" />
          <div className="text-center">
            <div className="text-[10px] uppercase tracking-wider text-[var(--brand-ink)] font-semibold">Projected</div>
            <div className="text-2xl font-extrabold text-[var(--brand-ink)]">{plan.projectedOverallScore}</div>
          </div>
          <div className="text-xs font-semibold text-[var(--brand-ink)] bg-[var(--brand-soft)] rounded-full px-2 py-1">+{delta}</div>
        </div>
      </div>

      <div className="flex items-center gap-2 text-xs text-[var(--ink-3)] mb-5">
        <Zap size={13} className="text-[var(--amber)]" /> Realistic timeframe to reach the projected score: <span className="font-semibold text-[var(--ink)]">{plan.projectedTimeframe}</span>
      </div>

      {/* Quick wins */}
      {plan.quickWins?.length > 0 && (
        <div className="rounded-xl bg-[var(--brand-soft)] border border-[var(--brand)]/15 p-4 mb-5">
          <div className="text-xs uppercase tracking-wider font-bold text-[var(--brand-ink)] mb-2">Quick wins — this week</div>
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {plan.quickWins.map((w, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-[var(--ink-2)]">
                <CheckCircle2 size={15} className="text-[var(--brand)] mt-0.5 shrink-0" /> {w}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Per-category before → after + actions */}
      <div className="flex flex-col gap-4">
        {plan.categories.map((cat) => (
          <div key={cat.key} className="rounded-xl border border-[var(--border)] p-4">
            <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
              <span className="text-sm font-bold text-[var(--ink)]">{cat.label}</span>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-[var(--ink-3)]">{cat.currentScore}</span>
                <ArrowRight size={13} className="text-[var(--ink-3)]" />
                <span className="font-bold text-[var(--brand-ink)]">{cat.projectedScore}</span>
              </div>
            </div>
            {/* before/after bar: solid fill = current, hatched extension = projected gain */}
            <div className="relative h-2.5 rounded-full bg-[var(--surface-2)] overflow-hidden mb-3">
              <div className="absolute inset-y-0 left-0 rounded-full bg-[var(--ink-3)]" style={{ width: `${cat.currentScore}%` }} />
              <div
                className="absolute inset-y-0 rounded-full bg-[var(--brand)]"
                style={{ left: `${cat.currentScore}%`, width: `${Math.max(0, cat.projectedScore - cat.currentScore)}%` }}
              />
            </div>
            <ul className="flex flex-col gap-2">
              {cat.actions.map((a, i) => (
                <li key={i} className="flex items-start gap-3 text-sm">
                  <div className="flex flex-col items-center gap-0.5 shrink-0 pt-0.5">
                    <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded" style={{ color: '#fff', background: EFFORT_TONE[a.effort] }}>{a.effort[0]}E</span>
                    <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded" style={{ color: '#fff', background: IMPACT_TONE[a.impact] }}>{a.impact[0]}I</span>
                  </div>
                  <div>
                    <span className="font-medium text-[var(--ink)]">{a.title}</span>
                    <span className="text-[var(--ink-2)]"> — {a.description}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
