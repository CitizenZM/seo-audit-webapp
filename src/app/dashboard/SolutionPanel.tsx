'use client';

import { useState } from 'react';
import { ClipboardList, ChevronDown, AlertTriangle, Wrench, Map } from 'lucide-react';

interface Solution {
  title: string;
  steps: string[];
  effort: 'low' | 'medium' | 'high';
  impact: 'low' | 'medium' | 'high';
}
export interface SectionSolutionData {
  problems: string[];
  solutions: Solution[];
  roadmap: { phase: 'Now' | '30 days' | '90 days'; focus: string }[];
}

const LEVEL_TONE: Record<string, string> = {
  low: 'bg-[var(--surface-2)] text-[var(--ink-3)]',
  medium: 'bg-[var(--amber-soft)] text-[var(--amber)]',
  high: 'bg-[var(--brand-soft)] text-[var(--brand-ink)]',
};

/**
 * Per-section "Action plan" — AI-generated from THIS audit's findings for
 * the section (problems → solutions with steps/effort/impact → roadmap).
 * Sits under the Explainer in each analysis card. Renders nothing when the
 * audit has no solutions for the section (e.g. AI unavailable).
 */
export default function SolutionPanel({ solution }: { solution?: SectionSolutionData | null }) {
  const [open, setOpen] = useState(false);
  if (!solution || solution.solutions.length === 0) return null;

  return (
    <div className="mb-4 rounded-xl border border-[var(--brand)]/25 bg-[var(--brand-soft)]/40 no-print">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-3.5 py-2.5 text-left"
        aria-expanded={open}
      >
        <ClipboardList size={14} className="text-[var(--brand)] shrink-0" />
        <span className="text-xs font-semibold text-[var(--brand-ink)] flex-1">
          Action plan for this section
          <span className="ml-2 font-normal text-[var(--ink-3)]">
            {solution.solutions.length} fix{solution.solutions.length > 1 ? 'es' : ''} · roadmap
          </span>
        </span>
        <ChevronDown size={14} className={`text-[var(--ink-3)] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="px-3.5 pb-4 flex flex-col gap-4">
          {/* Problems */}
          <div>
            <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider font-bold text-[var(--ink-3)] mb-1.5">
              <AlertTriangle size={12} className="text-[var(--amber)]" /> Diagnosed problems
            </div>
            <ul className="flex flex-col gap-1">
              {solution.problems.map((p, i) => (
                <li key={i} className="text-[13px] text-[var(--ink-2)] flex items-start gap-2">
                  <span className="text-[var(--amber)] leading-5">•</span> {p}
                </li>
              ))}
            </ul>
          </div>

          {/* Solutions */}
          <div>
            <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider font-bold text-[var(--ink-3)] mb-1.5">
              <Wrench size={12} className="text-[var(--brand)]" /> Solutions
            </div>
            <div className="flex flex-col gap-2.5">
              {solution.solutions.map((s, i) => (
                <div key={i} className="rounded-lg bg-[var(--surface)] border border-[var(--border)] p-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[13px] font-semibold text-[var(--ink)]">{s.title}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wide ${LEVEL_TONE[s.effort]}`}>
                      {s.effort} effort
                    </span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wide ${LEVEL_TONE[s.impact]}`}>
                      {s.impact} impact
                    </span>
                  </div>
                  <ol className="mt-1.5 flex flex-col gap-1 list-decimal list-inside">
                    {s.steps.map((st, j) => (
                      <li key={j} className="text-[13px] text-[var(--ink-2)]">{st}</li>
                    ))}
                  </ol>
                </div>
              ))}
            </div>
          </div>

          {/* Roadmap */}
          {solution.roadmap.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider font-bold text-[var(--ink-3)] mb-1.5">
                <Map size={12} className="text-[var(--blue)]" /> Roadmap
              </div>
              <div className="flex flex-col sm:flex-row gap-2">
                {solution.roadmap.map((r, i) => (
                  <div key={i} className="flex-1 rounded-lg bg-[var(--surface)] border border-[var(--border)] p-2.5">
                    <div className="text-[10px] uppercase tracking-wider font-bold text-[var(--blue)]">{r.phase}</div>
                    <div className="text-[12px] text-[var(--ink-2)] mt-0.5">{r.focus}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
