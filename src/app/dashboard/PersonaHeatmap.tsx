'use client';

import { useState } from 'react';
import { Grid3x3, ChevronDown, ChevronUp } from 'lucide-react';

interface PersonaDef {
  name: string;
  description?: string;
  role?: string;
  painPoints?: string[];
  purchaseCriteria?: string[];
}

interface HeatmapCell { persona: string; topic: string; visibilityPct: number; prompts: number }
interface Heatmap { personas: string[]; topics: string[]; cells: HeatmapCell[] }

function cellColor(pct: number): string {
  // brand color alpha-scaled by visibility intensity
  const alpha = Math.max(0.06, Math.min(0.9, pct / 100));
  return `rgba(22, 163, 74, ${alpha})`;
}

/**
 * Persona x Topic visibility heatmap — where in the buyer journey the brand
 * shows up (or doesn't) across probed AI conversations, plus expandable
 * persona detail chips (role / pain points / purchase criteria) when present.
 */
export default function PersonaHeatmap({
  heatmap,
  personaDefs,
}: {
  heatmap?: Heatmap | null;
  personaDefs?: PersonaDef[] | null;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);

  const hasHeatmap = !!heatmap && heatmap.personas?.length > 0 && heatmap.topics?.length > 0 && heatmap.cells?.length > 0;
  const richDefs = (personaDefs ?? []).filter((p) => p.role || p.painPoints?.length || p.purchaseCriteria?.length);

  if (!hasHeatmap && richDefs.length === 0) return null;

  const cellMap = new Map<string, HeatmapCell>();
  if (hasHeatmap) {
    for (const c of heatmap!.cells) cellMap.set(`${c.persona}::${c.topic}`, c);
  }

  return (
    <div id="persona-heatmap" className="card p-4 sm:p-6 scroll-mt-20">
      <h3 className="text-base font-bold text-[var(--ink)] flex items-center gap-2 mb-1">
        <Grid3x3 size={18} className="text-[var(--brand)]" /> Persona &times; Topic Visibility
      </h3>
      <p className="text-sm text-[var(--ink-3)] mb-4">
        Where the brand shows up (or doesn&apos;t) across buyer personas and question topics in AI answers.
      </p>

      {hasHeatmap && (
        <div className="overflow-x-auto mb-2">
          <table className="w-full text-left text-sm border-separate border-spacing-1">
            <thead>
              <tr>
                <th className="text-xs text-[var(--ink-3)] uppercase tracking-wider font-semibold px-2 py-1 text-left">Persona \ Topic</th>
                {heatmap!.topics.map((t) => (
                  <th key={t} className="text-xs text-[var(--ink-3)] uppercase tracking-wider font-semibold px-2 py-1 text-center whitespace-nowrap">{t}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {heatmap!.personas.map((p) => (
                <tr key={p}>
                  <td className="text-sm font-medium text-[var(--ink)] px-2 py-1 whitespace-nowrap">{p}</td>
                  {heatmap!.topics.map((t) => {
                    const cell = cellMap.get(`${p}::${t}`);
                    return (
                      <td key={t} className="px-1 py-1">
                        <div
                          className="w-full min-w-[3rem] h-9 rounded-md flex items-center justify-center text-xs font-semibold text-[var(--ink)]"
                          style={{ background: cell ? cellColor(cell.visibilityPct) : 'var(--surface-2)' }}
                          title={cell ? `${p} × ${t}: ${cell.visibilityPct}% visible across ${cell.prompts} prompt${cell.prompts === 1 ? '' : 's'}` : 'No data'}
                        >
                          {cell ? `${cell.visibilityPct}%` : '—'}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {richDefs.length > 0 && (
        <div className={hasHeatmap ? 'mt-4 pt-4 border-t border-[var(--border)]' : ''}>
          <div className="text-xs uppercase tracking-wider font-semibold text-[var(--ink-3)] mb-2">Persona Detail</div>
          <div className="flex flex-wrap gap-2">
            {richDefs.map((p) => {
              const isOpen = expanded === p.name;
              return (
                <button
                  key={p.name}
                  onClick={() => setExpanded(isOpen ? null : p.name)}
                  className="text-xs px-2.5 py-1 rounded-full bg-[var(--surface-2)] border border-[var(--border)] text-[var(--ink-2)] hover:border-[var(--brand)]/40 transition-colors flex items-center gap-1"
                >
                  <span className="font-semibold text-[var(--ink)]">{p.name}</span>
                  {p.role ? ` — ${p.role}` : ''}
                  {isOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                </button>
              );
            })}
          </div>
          {richDefs.filter((p) => expanded === p.name).map((p) => (
            <div key={p.name} className="mt-3 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
              {p.painPoints && p.painPoints.length > 0 && (
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-[var(--ink-3)] font-bold mb-1.5">Pain Points</div>
                  <ul className="flex flex-col gap-1">
                    {p.painPoints.map((pt, i) => (
                      <li key={i} className="text-sm text-[var(--ink-2)] flex gap-2"><span className="text-[var(--red)]">•</span>{pt}</li>
                    ))}
                  </ul>
                </div>
              )}
              {p.purchaseCriteria && p.purchaseCriteria.length > 0 && (
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-[var(--ink-3)] font-bold mb-1.5">Purchase Criteria</div>
                  <ul className="flex flex-col gap-1">
                    {p.purchaseCriteria.map((pc, i) => (
                      <li key={i} className="text-sm text-[var(--ink-2)] flex gap-2"><span className="text-[var(--brand)]">•</span>{pc}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
