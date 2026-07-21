'use client';

import { Compass, CheckCircle2 } from 'lucide-react';
import Explainer from './Explainer';

export interface Initiative {
  title: string;
  priority: 'P0' | 'P1' | 'P2';
  effort: 'low' | 'medium' | 'high';
  impact: 'low' | 'medium' | 'high';
  timeframe: string;
  successMetric: string;
  dependsOn?: string | null;
}

export interface Workstream {
  name: string;
  objective: string;
  kpi: string;
  initiatives: Initiative[];
}

export interface Phase {
  name: string;
  timeframe: string;
  goals: string[];
  milestones: string[];
  kpiTargets: string[];
}

export interface ProgramStrategyData {
  northStar: string;
  currentState: string[];
  workstreams: Workstream[];
  phases: Phase[];
  measurement: { cadence: string; coreKpis: string[] };
}

const programStrategyExplainer = {
  what: "The systematic master plan for the whole engagement: a north star goal, the workstreams and prioritized initiatives that get you there, a phased roadmap, and how progress is measured.",
  actions: [
    'Assign an owner to each P0 initiative before the next planning cycle.',
    'Review the phased roadmap monthly and re-audit to track KPI progress against targets.',
  ],
};

const PRIORITY_TONE: Record<Initiative['priority'], string> = {
  P0: 'bg-[var(--red-soft)] text-[var(--red)]',
  P1: 'bg-[var(--amber-soft)] text-[var(--amber)]',
  P2: 'bg-[var(--surface-2)] text-[var(--ink-3)]',
};

const LEVEL_TONE: Record<string, string> = {
  low: 'bg-[var(--surface-2)] text-[var(--ink-3)]',
  medium: 'bg-[var(--amber-soft)] text-[var(--amber)]',
  high: 'bg-[var(--brand-soft)] text-[var(--brand-ink)]',
};

const PRIORITY_ORDER: Record<Initiative['priority'], number> = { P0: 0, P1: 1, P2: 2 };

/**
 * Program Strategy — the flagship card: the systematic master plan for the
 * whole engagement. North star → current state → workstreams/initiatives →
 * phased roadmap → measurement cadence. Meant to print well for client PDFs,
 * so unlike other cards nothing here is collapsed by default.
 */
export default function ProgramStrategyCard({ strategy }: { strategy?: ProgramStrategyData | null }) {
  if (!strategy) {
    return (
      <div id="program-strategy" className="card p-4 sm:p-6 scroll-mt-20">
        <h3 className="text-base font-bold text-[var(--ink)] flex items-center gap-2 mb-1">
          <Compass size={18} className="text-[var(--brand)]" /> Program Strategy
        </h3>
        <p className="text-sm text-[var(--ink-3)] mt-0.5 mb-4">
          Systematic action strategy for the whole program — generated from this audit&apos;s findings
        </p>
        <p className="text-sm text-[var(--ink-3)]">
          Program strategy is generated during the audit when an AI provider is configured — run a new audit to populate this.
        </p>
      </div>
    );
  }

  return (
    <div id="program-strategy" className="card p-4 sm:p-6 scroll-mt-20">
      <h3 className="text-base font-bold text-[var(--ink)] flex items-center gap-2 mb-1">
        <Compass size={18} className="text-[var(--brand)]" /> Program Strategy
      </h3>
      <p className="text-sm text-[var(--ink-3)] mt-0.5 mb-4">
        Systematic action strategy for the whole program — generated from this audit&apos;s findings
      </p>

      <Explainer {...programStrategyExplainer} />

      {/* North star */}
      <div className="rounded-xl bg-gradient-to-br from-[var(--brand-soft)] to-[var(--surface-2)] border border-[var(--brand)]/20 p-4 sm:p-5 mb-5">
        <div className="text-[10px] uppercase tracking-wider font-bold text-[var(--brand-ink)] mb-1.5">
          North star
        </div>
        <p className="text-lg sm:text-xl font-semibold text-[var(--ink)] leading-snug">{strategy.northStar}</p>
      </div>

      {/* Current state */}
      {strategy.currentState.length > 0 && (
        <div className="mb-6">
          <div className="text-[11px] uppercase tracking-wider font-bold text-[var(--ink-3)] mb-2">
            Current state
          </div>
          <div className="flex flex-wrap gap-2">
            {strategy.currentState.map((c, i) => (
              <span
                key={i}
                className="text-[13px] text-[var(--ink-2)] bg-[var(--surface-2)] border border-[var(--border)] rounded-full px-3 py-1"
              >
                {c}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Workstreams */}
      {strategy.workstreams.length > 0 && (
        <div className="mb-6">
          <div className="text-[11px] uppercase tracking-wider font-bold text-[var(--ink-3)] mb-3">
            Workstreams
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {strategy.workstreams.map((ws, wi) => {
              const sorted = [...ws.initiatives].sort(
                (a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
              );
              return (
                <div key={wi} className="rounded-xl border border-[var(--border)] p-4">
                  <div className="flex items-start justify-between flex-wrap gap-2 mb-1">
                    <span className="text-sm font-bold text-[var(--ink)]">{ws.name}</span>
                    <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-[var(--blue-soft)] text-[var(--blue)] whitespace-nowrap">
                      KPI: {ws.kpi}
                    </span>
                  </div>
                  <p className="text-[13px] text-[var(--ink-3)] mb-3">{ws.objective}</p>

                  <div className="flex flex-col gap-2.5">
                    {sorted.map((init, ii) => (
                      <div key={ii} className="rounded-lg bg-[var(--surface-2)] border border-[var(--border)] p-3">
                        <div className="flex items-center justify-between gap-2 flex-wrap mb-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ${PRIORITY_TONE[init.priority]}`}
                            >
                              {init.priority}
                            </span>
                            <span className="text-[13px] font-semibold text-[var(--ink)]">{init.title}</span>
                          </div>
                          <span className="text-[11px] text-[var(--ink-3)] whitespace-nowrap">{init.timeframe}</span>
                        </div>

                        <div className="flex items-center gap-1.5 mb-1.5">
                          <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${LEVEL_TONE[init.effort]}`}>
                            {init.effort} effort
                          </span>
                          <span className={`text-[9px] font-bold uppercase px-1.5 py-0.5 rounded ${LEVEL_TONE[init.impact]}`}>
                            {init.impact} impact
                          </span>
                        </div>

                        <div className="flex items-start gap-1.5 text-[12px] text-[var(--brand-ink)]">
                          <CheckCircle2 size={12} className="mt-0.5 shrink-0" />
                          <span>{init.successMetric}</span>
                        </div>

                        {init.dependsOn && (
                          <p className="text-[11px] text-[var(--ink-3)] italic mt-1">
                            depends on: {init.dependsOn}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Phased roadmap */}
      {strategy.phases.length > 0 && (
        <div className="mb-6">
          <div className="text-[11px] uppercase tracking-wider font-bold text-[var(--ink-3)] mb-3">
            Phased roadmap
          </div>
          <div className="flex flex-col sm:flex-row gap-4">
            {strategy.phases.map((phase, pi) => (
              <div key={pi} className="flex-1 border-l-2 border-[var(--blue)] pl-3.5">
                <div className="mb-2">
                  <div className="text-sm font-bold text-[var(--ink)]">{phase.name}</div>
                  <div className="text-[11px] text-[var(--blue)] font-medium">{phase.timeframe}</div>
                </div>

                {phase.goals.length > 0 && (
                  <div className="mb-2.5">
                    <div className="text-[10px] uppercase tracking-wider font-bold text-[var(--ink-3)] mb-1">
                      Goals
                    </div>
                    <ul className="flex flex-col gap-1">
                      {phase.goals.map((g, i) => (
                        <li key={i} className="text-[12px] text-[var(--ink-2)] flex items-start gap-1.5">
                          <span className="text-[var(--ink-3)] leading-4">☐</span> {g}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {phase.milestones.length > 0 && (
                  <div className="mb-2.5">
                    <div className="text-[10px] uppercase tracking-wider font-bold text-[var(--ink-3)] mb-1">
                      Milestones
                    </div>
                    <ul className="flex flex-col gap-1">
                      {phase.milestones.map((m, i) => (
                        <li key={i} className="text-[12px] text-[var(--ink-2)] flex items-start gap-1.5">
                          <span className="text-[var(--ink-3)] leading-4">☐</span> {m}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {phase.kpiTargets.length > 0 && (
                  <div>
                    <div className="text-[10px] uppercase tracking-wider font-bold text-[var(--ink-3)] mb-1">
                      KPI targets
                    </div>
                    <ul className="flex flex-col gap-1">
                      {phase.kpiTargets.map((k, i) => (
                        <li key={i} className="text-[12px] text-[var(--ink-2)] flex items-start gap-1.5">
                          <span className="text-[var(--ink-3)] leading-4">☐</span> {k}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Measurement */}
      <div className="rounded-xl bg-[var(--surface-2)] border border-[var(--border)] p-4 flex flex-wrap items-center gap-3">
        <span className="text-sm text-[var(--ink)]">
          Measurement cadence: <span className="font-semibold">{strategy.measurement.cadence}</span>
        </span>
        <div className="flex flex-wrap gap-2">
          {strategy.measurement.coreKpis.map((k, i) => (
            <span
              key={i}
              className="text-[12px] text-[var(--ink-2)] bg-[var(--surface)] border border-[var(--border)] rounded-full px-2.5 py-0.5"
            >
              {k}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
