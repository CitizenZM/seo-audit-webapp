'use client';

import { Radar } from 'lucide-react';
import Explainer from './Explainer';
import SolutionPanel, { type SectionSolutionData } from './SolutionPanel';

interface GapEntry { domain: string; count: number; citedForTopics: string[]; outreachAngle: string }

function normalizeEntries(citationGap: unknown): GapEntry[] {
  if (!citationGap) return [];
  if (Array.isArray(citationGap)) return citationGap as GapEntry[];
  if (typeof citationGap === 'object' && citationGap !== null) {
    const box = citationGap as { entries?: unknown; gaps?: unknown };
    const entries = box.entries ?? box.gaps;
    if (Array.isArray(entries)) return entries as GapEntry[];
  }
  return [];
}

/**
 * Citation Gap — domains AI engines cite in this category where the brand is
 * absent. Ranked digital-PR / outreach target list.
 */
export default function CitationGapCard({ citationGap, solution }: { citationGap?: unknown; solution?: SectionSolutionData | null }) {
  const entries = normalizeEntries(citationGap);

  const max = Math.max(...entries.map((e) => e.count || 0), 1);

  return (
    <div id="citation-gap" className="card p-4 sm:p-6 scroll-mt-20">
      <h3 className="text-base font-bold text-[var(--ink)] flex items-center gap-2 mb-1">
        <Radar size={18} className="text-[var(--blue)]" /> Citation Gap
      </h3>
      <Explainer
        what="Domains AI engines cite in your category where your brand is absent — your highest-leverage digital-PR target list, each with a suggested outreach angle."
        actions={[
          'Work top-down: pitch the highest-count domains first using the outreach angle.',
          'Track wins by re-auditing — cited domains should move into your Citation audit.',
        ]}
      />
      <SolutionPanel solution={solution} />
      <p className="text-sm text-[var(--ink-3)] mb-4">
        Domains AI engines cite in your category where you&apos;re absent — the highest-leverage outreach targets.
      </p>
      {entries.length === 0 ? (
        <p className="text-sm text-[var(--ink-3)]">
          No citation gap data in this audit — run a new audit to populate this.
        </p>
      ) : (
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-[var(--surface-2)] text-[var(--ink-3)] uppercase tracking-wider text-xs">
            <tr>
              <th className="px-4 py-3 rounded-l-lg">Domain</th>
              <th className="px-4 py-3">Mentions</th>
              <th className="px-4 py-3">Topics Cited For</th>
              <th className="px-4 py-3 rounded-r-lg">Outreach Angle</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e, i) => (
              <tr key={e.domain + i} className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--surface-2)] transition-colors align-top">
                <td className="px-4 py-3 font-semibold text-[var(--ink)] whitespace-nowrap">{e.domain}</td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-1.5 rounded-full bg-[var(--surface-2)] overflow-hidden shrink-0">
                      <div className="h-full rounded-full bg-[var(--blue)]" style={{ width: `${((e.count || 0) / max) * 100}%` }} />
                    </div>
                    <span className="text-[var(--ink-2)] font-mono text-xs">{e.count}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-[var(--ink-2)]">
                  {(e.citedForTopics ?? []).length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {e.citedForTopics.map((t, ti) => (
                        <span key={ti} className="text-xs px-2 py-0.5 rounded-full bg-[var(--surface-2)] border border-[var(--border)]">{t}</span>
                      ))}
                    </div>
                  ) : <span className="text-[var(--ink-3)]">—</span>}
                </td>
                <td className="px-4 py-3 text-[var(--ink-2)] max-w-xs">{e.outreachAngle || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}
    </div>
  );
}
