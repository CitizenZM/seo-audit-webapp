'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Clock, ArrowRight } from 'lucide-react';
import { getAudits, type AuditRecord } from '@/lib/history';

export default function RecentAudits() {
  const router = useRouter();
  const [audits, setAudits] = useState<AuditRecord[]>([]);

  useEffect(() => {
    // localStorage is only available client-side; reading it during render
    // would cause a hydration mismatch, so this genuinely needs to happen
    // post-mount rather than during render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAudits(getAudits());
  }, []);

  if (audits.length === 0) return null;

  return (
    <div className="w-full max-w-xl mt-8">
      <div className="flex items-center gap-2 mb-3 text-[var(--ink-3)]">
        <Clock size={15} />
        <span className="text-xs font-semibold uppercase tracking-wide">Recent Audits</span>
      </div>
      <div className="flex flex-col gap-2">
        {audits.map((a) => (
          <button
            key={a.url + a.timestamp}
            onClick={() => router.push(`/dashboard?url=${encodeURIComponent(a.url)}`)}
            className="card px-4 py-3 flex items-center justify-between text-left hover:border-[var(--brand)] transition-colors group"
          >
            <div className="min-w-0">
              <div className="text-sm font-semibold text-[var(--ink)] truncate">{a.domain}</div>
              <div className="text-xs text-[var(--ink-3)]">
                {new Date(a.timestamp).toLocaleDateString()} · {a.competitors} competitor{a.competitors === 1 ? '' : 's'}
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <span className="text-sm font-bold text-[var(--brand-ink)]">{a.score}/100</span>
              <ArrowRight size={16} className="text-[var(--ink-3)] group-hover:text-[var(--brand)] transition-colors" />
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
