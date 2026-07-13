interface Keyword {
  keyword: string;
  intent: string;
  volume: string;
  difficulty: string;
}

export default function KeywordTable({ keywords }: { keywords: Keyword[] }) {
  if (!keywords || keywords.length === 0) return null;

  return (
    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden mt-6">
      <div className="p-4 sm:p-6 border-b border-[var(--border)]">
        <h3 className="text-base sm:text-lg font-bold text-[var(--ink)]">Keyword Opportunities</h3>
        <p className="text-sm text-[var(--muted)] mt-1">Identified high and medium intent targets based on content gaps.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm whitespace-nowrap">
          <thead className="bg-[var(--surface-2)] text-[var(--ink-3)] uppercase tracking-wider text-xs">
            <tr>
              <th className="px-4 sm:px-6 py-3 sm:py-4">Keyword</th>
              <th className="px-4 sm:px-6 py-3 sm:py-4">Intent</th>
              <th className="px-4 sm:px-6 py-3 sm:py-4">Difficulty <span className="normal-case font-normal opacity-70">(AI est.)</span></th>
              <th className="px-4 sm:px-6 py-3 sm:py-4">Volume <span className="normal-case font-normal opacity-70">(AI est.)</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {keywords.map((kw: Keyword, idx: number) => (
              <tr key={idx} className="hover:bg-[var(--surface-2)] transition-colors border-t border-[var(--border)]">
                <td className="px-4 sm:px-6 py-3 sm:py-4 font-semibold text-[var(--ink-2)]">{kw.keyword}</td>
                <td className="px-4 sm:px-6 py-3 sm:py-4 text-[var(--ink-2)]">{kw.intent}</td>
                <td className="px-4 sm:px-6 py-3 sm:py-4">
                  <span className={`px-3 py-1 rounded-full text-xs font-bold border ${kw.difficulty?.toLowerCase() === 'high' ? 'bg-[rgba(231,76,60,0.15)] text-[#e74c3c] border-[rgba(231,76,60,0.3)]' : kw.difficulty?.toLowerCase() === 'medium' ? 'bg-[rgba(243,156,18,0.15)] text-[#f39c12] border-[rgba(243,156,18,0.3)]' : 'bg-[rgba(46,204,113,0.15)] text-[#2ecc71] border-[rgba(46,204,113,0.3)]'}`}>
                    {kw.difficulty || 'Low'}
                  </span>
                </td>
                <td className="px-4 sm:px-6 py-3 sm:py-4 text-[var(--ink-3)]">{kw.volume || 'N/A'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
