'use client';

import { Search, ExternalLink } from 'lucide-react';

export interface KeywordRanking {
  keyword: string;
  targetPosition: number | null;
  topResults: { title: string; url: string; domain: string }[];
  competitorPositions: Record<string, number | null>;
}

/** Best (lowest) competitor position + which domain holds it, or null if none rank. */
function topCompetitor(competitorPositions: Record<string, number | null>): { domain: string; position: number } | null {
  let best: { domain: string; position: number } | null = null;
  for (const [domain, position] of Object.entries(competitorPositions)) {
    if (position == null) continue;
    if (!best || position < best.position) best = { domain, position };
  }
  return best;
}

/**
 * Real Google Rankings (SERP upgrade): live organic positions pulled from
 * Serper.dev for the top non-brand keyword opportunities, rather than the
 * AI-estimated keyword data elsewhere in the report. Renders nothing if the
 * pipeline didn't produce any rankings (no API key, or no keywords to check).
 */
export default function KeywordRankingsCard({ keywordRankings }: { keywordRankings: KeywordRanking[] | null | undefined }) {
  if (!keywordRankings || keywordRankings.length === 0) return null;

  return (
    <div id="real-rankings" className="card p-4 sm:p-6 scroll-mt-20">
      <h3 className="text-base font-bold text-[var(--ink)] flex items-center gap-2 mb-1">
        <Search size={18} className="text-[var(--brand)]" /> Real Google Rankings
      </h3>
      <p className="text-sm text-[var(--ink-3)] mb-4">
        Live positions from Google search results (Serper.dev) — measured, not estimated.
      </p>

      <div className="overflow-x-auto -mx-1">
        <table className="w-full text-sm min-w-[560px]">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wider text-[var(--ink-3)] font-semibold">
              <th className="px-1 py-2">Keyword</th>
              <th className="px-1 py-2">Your Position</th>
              <th className="px-1 py-2">Top Competitor in Results</th>
              <th className="px-1 py-2 w-10"></th>
            </tr>
          </thead>
          <tbody>
            {keywordRankings.map((r) => {
              const inTop10 = r.targetPosition != null && r.targetPosition <= 10;
              const competitor = topCompetitor(r.competitorPositions);
              return (
                <tr key={r.keyword} className="border-t border-[var(--border)]">
                  <td className="px-1 py-2.5 font-medium text-[var(--ink)] max-w-[220px] truncate">{r.keyword}</td>
                  <td className="px-1 py-2.5">
                    {inTop10 ? (
                      <span className="inline-flex items-center rounded-full bg-[var(--brand-soft)] text-[var(--brand-ink)] text-xs font-bold px-2.5 py-1">
                        #{r.targetPosition}
                      </span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-[var(--surface-2)] text-[var(--ink-3)] text-xs font-semibold px-2.5 py-1">
                        Not in top 10
                      </span>
                    )}
                  </td>
                  <td className="px-1 py-2.5 text-[var(--ink-2)]">
                    {competitor ? (
                      <span>
                        <span className="font-medium text-[var(--ink)]">{competitor.domain}</span>{' '}
                        <span className="text-[var(--ink-3)]">#{competitor.position}</span>
                      </span>
                    ) : (
                      <span className="text-[var(--ink-3)]">None in top 10</span>
                    )}
                  </td>
                  <td className="px-1 py-2.5 text-right">
                    <a
                      href={`https://www.google.com/search?q=${encodeURIComponent(r.keyword)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Search "${r.keyword}" on Google`}
                      className="inline-flex items-center justify-center w-7 h-7 rounded-md text-[var(--ink-3)] hover:text-[var(--brand)] hover:bg-[var(--surface-2)] transition-colors"
                    >
                      <ExternalLink size={14} />
                    </a>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
