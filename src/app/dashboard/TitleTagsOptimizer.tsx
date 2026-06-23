'use client';

export default function TitleTagsOptimizer({ titleTags }: { titleTags: Array<Record<string, unknown>> }) {
  if (!titleTags) return null;

  return (
    <div className="mt-8">
      <h3 className="text-xl font-bold text-white mb-2">Optimized Title Tags & Meta Descriptions</h3>
      <p className="text-sm text-[var(--muted)] mb-6">Rewrite-ready title tags and meta descriptions for all key pages. Character counts included.</p>

      <div className="grid gap-4">
        {titleTags.map((tag, i) => (
          <div key={i} className="bg-[var(--mid)] border border-[#2a2a4a] rounded-xl p-5">
             <div className="text-xs font-bold uppercase tracking-wider text-[var(--gold)] mb-2">{String(tag.page)}</div>
             <div className="text-sm text-[var(--muted)] mb-1">Current: {String(tag.current)}</div>
             
             <div className="text-md font-semibold text-[var(--blue)] mb-1">✦ New Title: {String(tag.newTitle)}</div>
             <div className={`text-xs mb-4 ${Number(tag.titleChars) > 60 ? 'text-[var(--warn)]' : 'text-[var(--pass)]'}`}>
               {Number(tag.titleChars) > 60 ? '⚠ ' : '✓ '}{Number(tag.titleChars)} characters {Number(tag.titleChars) > 60 && '— trim if possible'}
             </div>
             
             <div className="h-px bg-[#2a2a4a] my-3"></div>
             
             <div className="text-xs text-[#aaa] mb-1">Meta Description:</div>
             <div className="text-sm italic text-[#bbb] mb-1">&quot;{String(tag.metaDesc)}&quot;</div>
             <div className="text-xs text-[var(--pass)]">
               ✓ {String(tag.metaDesc).length} characters
             </div>
          </div>
        ))}
      </div>
    </div>
  );
}
