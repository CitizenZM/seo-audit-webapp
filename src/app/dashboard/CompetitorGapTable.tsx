'use client';

interface SiteData {
  domain: string;
  onPage: { wordCount: number; h1Count: number };
  links: { internalCount: number; externalCount: number; indexedPagesApprox: number };
  technical: { mobileSpeedScore: number };
  cro: { hasCartOrCheckout: boolean; hasReviewsSchema: boolean };
}

export default function CompetitorGapTable({
  targetDomain,
  targetData,
  competitors,
}: {
  targetDomain: string;
  targetData: SiteData;
  competitors: SiteData[];
}) {
  if (!competitors || competitors.length === 0) return null;

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden mt-6">
      <div className="p-4 sm:p-6 border-b border-[var(--border)]">
        <h3 className="text-base sm:text-lg font-bold text-[var(--ink)]">Competitor Gap Analysis</h3>
        <p className="text-sm text-[var(--muted)] mt-1">High-level comparison across key SEO dimensions against your specified peers.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-[var(--surface-2)] text-[var(--ink-3)] uppercase tracking-wider text-xs">
            <tr>
              <th className="px-4 sm:px-6 py-3 sm:py-4">Dimension</th>
              <th className="px-4 sm:px-6 py-3 sm:py-4 text-[var(--ink)] font-bold">{targetDomain}</th>
              {competitors.map((c, idx) => (
                <th key={idx} className="px-4 sm:px-6 py-3 sm:py-4 text-[var(--muted)]">{c.domain}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            <tr className="hover:bg-[var(--surface-2)] transition-colors">
              <td className="px-4 sm:px-6 py-3 sm:py-4 font-semibold text-[var(--ink)]">Word Count (Home)</td>
              <td className="px-4 sm:px-6 py-3 sm:py-4 text-[var(--brand-ink)] font-mono">{targetData.onPage.wordCount}</td>
              {competitors.map((c, idx) => (
                <td key={idx} className="px-4 sm:px-6 py-3 sm:py-4 text-[var(--ink-2)] font-mono">{c.onPage.wordCount}</td>
              ))}
            </tr>
            <tr className="hover:bg-[var(--surface-2)] transition-colors">
              <td className="px-4 sm:px-6 py-3 sm:py-4 font-semibold text-[var(--ink)]">H1 Tags</td>
              <td className="px-4 sm:px-6 py-3 sm:py-4 text-[var(--brand-ink)]">{targetData.onPage.h1Count}</td>
              {competitors.map((c, idx) => (
                <td key={idx} className="px-4 sm:px-6 py-3 sm:py-4 text-[var(--ink-2)]">{c.onPage.h1Count}</td>
              ))}
            </tr>
            <tr className="hover:bg-[var(--surface-2)] transition-colors">
              <td className="px-4 sm:px-6 py-3 sm:py-4 font-semibold text-[var(--ink)]">Mobile Speed Score</td>
              <td className="px-4 sm:px-6 py-3 sm:py-4 text-[var(--brand-ink)]">{targetData.technical.mobileSpeedScore} / 100</td>
              {competitors.map((c, idx) => (
                <td key={idx} className="px-4 sm:px-6 py-3 sm:py-4 text-[var(--ink-2)]">{c.technical.mobileSpeedScore} / 100</td>
              ))}
            </tr>
            <tr className="hover:bg-[var(--surface-2)] transition-colors">
              <td className="px-4 sm:px-6 py-3 sm:py-4 font-semibold text-[var(--ink)]">Approx Indexed Pages</td>
              <td className="px-4 sm:px-6 py-3 sm:py-4 text-[var(--brand-ink)]">{targetData.links.indexedPagesApprox}</td>
              {competitors.map((c, idx) => (
                <td key={idx} className="px-4 sm:px-6 py-3 sm:py-4 text-[var(--ink-2)]">{c.links.indexedPagesApprox}</td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
