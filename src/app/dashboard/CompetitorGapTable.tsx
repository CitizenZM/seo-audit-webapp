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
    <div className="bg-[var(--mid)] border border-[#2a2a4a] rounded-xl overflow-hidden mt-6">
      <div className="p-6 border-b border-[#2a2a4a]">
        <h3 className="text-lg font-bold text-white">Competitor Gap Analysis</h3>
        <p className="text-sm text-[var(--muted)] mt-1">High-level comparison across key SEO dimensions against your specified peers.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="bg-[rgba(201,168,76,0.1)] text-[var(--gold)] uppercase tracking-wider text-xs">
            <tr>
              <th className="px-6 py-4">Dimension</th>
              <th className="px-6 py-4 text-white font-bold">{targetDomain}</th>
              {competitors.map((c, idx) => (
                <th key={idx} className="px-6 py-4 text-[var(--muted)]">{c.domain}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1e1e3a]">
            <tr className="hover:bg-white/5 transition-colors">
              <td className="px-6 py-4 font-semibold text-white">Word Count (Home)</td>
              <td className="px-6 py-4 text-[var(--gold)] font-mono">{targetData.onPage.wordCount}</td>
              {competitors.map((c, idx) => (
                <td key={idx} className="px-6 py-4 text-[#ddd] font-mono">{c.onPage.wordCount}</td>
              ))}
            </tr>
            <tr className="hover:bg-white/5 transition-colors">
              <td className="px-6 py-4 font-semibold text-white">H1 Tags</td>
              <td className="px-6 py-4 text-[var(--gold)]">{targetData.onPage.h1Count}</td>
              {competitors.map((c, idx) => (
                <td key={idx} className="px-6 py-4 text-[#ddd]">{c.onPage.h1Count}</td>
              ))}
            </tr>
            <tr className="hover:bg-white/5 transition-colors">
              <td className="px-6 py-4 font-semibold text-white">Mobile Speed Score</td>
              <td className="px-6 py-4 text-[var(--gold)]">{targetData.technical.mobileSpeedScore} / 100</td>
              {competitors.map((c, idx) => (
                <td key={idx} className="px-6 py-4 text-[#ddd]">{c.technical.mobileSpeedScore} / 100</td>
              ))}
            </tr>
            <tr className="hover:bg-white/5 transition-colors">
              <td className="px-6 py-4 font-semibold text-white">Approx Indexed Pages</td>
              <td className="px-6 py-4 text-[var(--gold)]">{targetData.links.indexedPagesApprox}</td>
              {competitors.map((c, idx) => (
                <td key={idx} className="px-6 py-4 text-[#ddd]">{c.links.indexedPagesApprox}</td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
