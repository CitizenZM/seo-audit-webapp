'use client';

import { Quote } from 'lucide-react';
import type { CitationEntry } from '@/lib/visibility';

/**
 * Citation audit (Gumshoe "Monitor → Citation audit"): the domains AI models
 * actually cite when answering category questions — your digital-PR target
 * list. Earning mentions/links on these sites is the highest-leverage way to
 * enter AI answers.
 */
export default function CitationsCard({ citations, domain }: { citations: CitationEntry[]; domain: string }) {
  if (!citations || citations.length === 0) return null;
  const max = Math.max(...citations.map((c) => c.count));
  const you = domain.replace(/^www\./, '');

  return (
    <div id="citations" className="card p-4 sm:p-6 scroll-mt-20">
      <h3 className="text-base font-bold text-[var(--ink)] flex items-center gap-2 mb-1">
        <Quote size={18} className="text-[var(--blue)]" /> Citation Audit
      </h3>
      <p className="text-sm text-[var(--ink-3)] mb-4">
        Domains AI models cite when answering questions in your category. Earning coverage on these sites is the
        most direct path into AI answers.
      </p>
      <div className="flex flex-col gap-1.5">
        {citations.map((c, i) => {
          const isYou = c.domain === you;
          return (
            <div key={c.domain} className={`flex items-center gap-3 px-2 py-1.5 rounded-lg ${isYou ? 'bg-[var(--brand-soft)]' : ''}`}>
              <span className="text-xs font-bold text-[var(--ink-3)] w-5">{i + 1}</span>
              <span className={`text-sm w-28 sm:w-56 truncate ${isYou ? 'font-semibold text-[var(--brand-ink)]' : 'text-[var(--ink)]'}`}>
                {c.domain}{isYou ? ' · You' : ''}
              </span>
              <div className="flex-1 h-2 rounded-full bg-[var(--surface-2)] overflow-hidden">
                <div className="h-full rounded-full bg-[var(--blue)]" style={{ width: `${(c.count / max) * 100}%` }} />
              </div>
              <span className="text-sm font-semibold text-[var(--ink)] w-8 text-right">{c.count}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
