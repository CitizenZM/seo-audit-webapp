'use client';

export default function ContentBriefs({ briefs }: { briefs: Array<Record<string, unknown>> }) {
  if (!briefs || briefs.length === 0) return null;

  return (
    <div className="mt-8">
      <h3 className="text-xl font-bold text-white mb-2">Content Briefs — Top Keyword Opportunities</h3>
      <p className="text-sm text-[var(--muted)] mb-6">Ready-to-brief content specs. Hand each brief to a writer with these requirements.</p>

      <div className="space-y-6">
        {briefs.map((brief, idx) => (
          <div key={idx} className="bg-[var(--mid)] border border-[#2a2a4a] rounded-xl p-6 relative overflow-hidden">
            
            {/* Header */}
            <div className="flex justify-between items-start flex-wrap gap-2 mb-4">
              <h4 className="text-lg font-bold text-white">#{String(brief.id)} — &quot;{String(brief.title)}&quot;</h4>
              <span className={`px-3 py-1 text-xs font-bold uppercase rounded-full border ${idx === 0 ? 'bg-[rgba(231,76,60,0.15)] text-[#e74c3c] border-[#e74c3c]/30' : 'bg-[rgba(243,156,18,0.15)] text-[#f39c12] border-[#f39c12]/30'}`}>
                {idx === 0 ? 'High Priority' : 'Medium Priority'}
              </span>
            </div>

            {/* Meta Tags */}
            <div className="flex flex-wrap gap-2 mb-4">
              <span className="bg-white/5 border border-white/10 rounded-full px-3 py-1 text-xs text-[var(--muted)]">Target Keyword: <strong className="text-white">{String(brief.targetKeyword)}</strong></span>
              <span className="bg-white/5 border border-white/10 rounded-full px-3 py-1 text-xs text-[var(--muted)]">Volume: <strong className="text-white">{String(brief.volume)}</strong></span>
              <span className="bg-white/5 border border-white/10 rounded-full px-3 py-1 text-xs text-[var(--muted)]">Difficulty: <strong className="text-white">{String(brief.difficulty)}</strong></span>
              <span className="bg-white/5 border border-white/10 rounded-full px-3 py-1 text-xs text-[var(--muted)]">Funnel Stage: <strong className="text-white">{String(brief.funnelStage)}</strong></span>
            </div>

            {/* Goal */}
            <div className="mb-4">
              <div className="text-[10px] uppercase tracking-widest font-bold text-[var(--gold)] mb-1">Goal</div>
              <p className="text-sm text-[#ccc] leading-relaxed">{String(brief.goal)}</p>
            </div>

            {/* Outline Block */}
            <div className="mb-2">
              <div className="text-[10px] uppercase tracking-widest font-bold text-[var(--gold)] mb-2">Recommended Outline</div>
              <div className="bg-black/20 border-l-[3px] border-[var(--gold)] rounded-r-lg p-4">
                 <ul className="space-y-1">
                   {(brief.outline as unknown as string[]).map((point: string, pIdx: number) => (
                      <li key={pIdx} className="text-sm text-[#bbb]">
                        {point.includes('H1') || point.includes('H2') ? 
                            <strong className="text-white">{point}</strong> : 
                            <span className="pl-4 text-[var(--muted)]">→ {point}</span>
                        }
                      </li>
                   ))}
                 </ul>
              </div>
            </div>

          </div>
        ))}
      </div>
    </div>
  );
}
