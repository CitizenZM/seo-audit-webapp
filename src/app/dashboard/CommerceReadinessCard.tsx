'use client';

import { ShoppingCart, CheckCircle2, XCircle } from 'lucide-react';
import Explainer from './Explainer';
import SolutionPanel, { type SectionSolutionData } from './SolutionPanel';

interface Check { id: string; label: string; passed: boolean; detail: string; impact: 'high' | 'medium' | 'low' }
interface Commerce { score: number; checks: Check[] }

function scoreTone(score: number) {
  if (score >= 80) return { color: 'var(--brand)' };
  if (score >= 50) return { color: 'var(--amber)' };
  return { color: 'var(--red)' };
}

const impactStyle: Record<Check['impact'], { label: string; color: string; soft: string }> = {
  high: { label: 'High impact', color: 'var(--red)', soft: 'var(--red-soft)' },
  medium: { label: 'Medium impact', color: 'var(--amber)', soft: 'var(--amber-soft)' },
  low: { label: 'Low impact', color: 'var(--ink-3)', soft: 'var(--surface-2)' },
};

/**
 * Commerce Readiness — AI-agentic-commerce checklist (structured product
 * data, price/availability exposure, checkout signals) scored 0-100.
 */
const commerceExplainer = {
  what: 'Whether AI shopping agents (ChatGPT Shopping, Amazon Rufus…) can parse your products: price/availability schema, review markup, and agent-friction blockers like CAPTCHAs.',
  actions: [
    'Fix high-impact failures first — missing Product/Offer schema hides you from AI shopping.',
    'Remove agent-friction: login-walls and CAPTCHA on product pages block AI buyers.',
  ],
};

export default function CommerceReadinessCard({ commerce, solution }: { commerce?: Commerce | null; solution?: SectionSolutionData | null }) {
  const tone = commerce ? scoreTone(commerce.score) : scoreTone(0);

  return (
    <div id="commerce-readiness" className="card p-4 sm:p-6 scroll-mt-20">
      <div className="flex items-start justify-between flex-wrap gap-3 sm:gap-4 mb-5">
        <div>
          <h3 className="text-base font-bold text-[var(--ink)] flex items-center gap-2">
            <ShoppingCart size={18} className="text-[var(--brand)]" /> Commerce Readiness
          </h3>
          <p className="text-sm text-[var(--ink-3)] mt-0.5 max-w-xl">
            How ready this site is for AI shopping agents to find, evaluate, and transact.
          </p>
        </div>
        {commerce && (
        <div className="text-right shrink-0">
          <div className="text-[10px] uppercase tracking-wider text-[var(--ink-3)] font-semibold">Score</div>
          <div className="text-2xl sm:text-3xl font-extrabold leading-none" style={{ color: tone.color }}>
            {commerce.score}<span className="text-base sm:text-lg text-[var(--ink-3)]">/100</span>
          </div>
        </div>
        )}
      </div>

      <Explainer {...commerceExplainer} />
      <SolutionPanel solution={solution} />

      {!commerce ? (
        <p className="text-sm text-[var(--ink-3)]">
          No commerce readiness data in this audit — run a new audit to populate this.
        </p>
      ) : (
      <div className="flex flex-col gap-2">
        {commerce.checks.map((c) => {
          const im = impactStyle[c.impact] ?? impactStyle.low;
          return (
            <div key={c.id} className="flex items-start gap-3 px-3 py-2.5 rounded-lg bg-[var(--surface-2)] border border-[var(--border)]">
              {c.passed
                ? <CheckCircle2 size={16} className="text-[var(--pass)] mt-0.5 shrink-0" />
                : <XCircle size={16} className="text-[var(--fail)] mt-0.5 shrink-0" />}
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <span className="text-sm font-medium text-[var(--ink)]">{c.label}</span>
                  {!c.passed && (
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0" style={{ color: im.color, background: im.soft }}>
                      {im.label}
                    </span>
                  )}
                </div>
                <div className="text-xs text-[var(--ink-3)]">{c.detail}</div>
              </div>
            </div>
          );
        })}
      </div>
      )}
    </div>
  );
}
