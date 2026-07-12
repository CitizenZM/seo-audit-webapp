'use client';

export default function ContentCalendar({ calendar }: { calendar: Array<Record<string, unknown>> }) {
  if (!calendar || calendar.length === 0) return null;

  return (
    <div className="mt-8">
      <h3 className="text-lg sm:text-xl font-bold text-[var(--ink)] mb-2">Content Calendar — 12 Week Roadmap</h3>
      <p className="text-sm text-[var(--muted)] mb-6">12-week content roadmap based on gap analysis. Prioritizes quick wins first, builds toward strategic content.</p>

      {/* Legend */}
      <div className="flex flex-wrap gap-4 mb-6">
        <div className="flex items-center gap-2 text-xs text-[var(--muted)]"><span className="w-2 h-2 rounded-full bg-[#2ecc71]"></span> Quick Win</div>
        <div className="flex items-center gap-2 text-xs text-[var(--muted)]"><span className="w-2 h-2 rounded-full bg-[#3498db]"></span> Strategic</div>
        <div className="flex items-center gap-2 text-xs text-[var(--muted)]"><span className="w-2 h-2 rounded-full bg-[#bb8fce]"></span> Blog Post</div>
        <div className="flex items-center gap-2 text-xs text-[var(--muted)]"><span className="w-2 h-2 rounded-full border border-[var(--gold)]"></span> Page Optimization</div>
      </div>

      <div className="space-y-4">
        {calendar.map((item, idx) => (
           <div key={idx} className="bg-[var(--surface)] border border-[var(--border)] rounded-lg p-4 flex gap-4 items-start">
             
             {/* Timeline Week */}
             <div className="min-w-[70px] mt-1">
               <span className="text-[10px] text-[var(--brand-ink)] font-bold uppercase tracking-widest">{String(item.week)}</span>
               <div className="text-xs text-[var(--muted)] mt-1">{String(item.month)}</div>
             </div>

             {/* Content content */}
             <div className="flex-1">
               <h4 className="text-sm font-bold text-[var(--ink)] mb-1">{String(item.title)}</h4>
               <p className="text-xs text-[var(--ink-2)] mb-3">{String(item.details)}</p>
               
               {/* Badges */}
               <div className="flex flex-wrap gap-2">
                 <span className={`text-[10px] px-2 py-0.5 rounded-full border ${item.type === 'Quick Win' ? 'bg-[rgba(46,204,113,0.15)] text-[#2ecc71] border-[#2ecc71]/30' : 'bg-[rgba(52,152,219,0.15)] text-[var(--blue)] border-[#3498db]/30'}`}>
                   {String(item.type)}
                 </span>
               </div>
             </div>

           </div>
        ))}
      </div>
    </div>
  );
}
