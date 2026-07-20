'use client';

import { useEffect, useState } from 'react';
import { Bot, Server } from 'lucide-react';

/**
 * Crawler Analytics — aggregate AI/search bot hit counts from a configured
 * Vercel Log Drain, fetched client-side (session-auth). Renders whatever
 * aggregate fields the backend happens to return; graceful empty state
 * otherwise.
 */
export default function CrawlerAnalyticsCard() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [errored, setErrored] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/crawler-logs')
      .then((r) => {
        if (!r.ok) throw new Error('unavailable');
        return r.json();
      })
      .then((j) => { if (!cancelled) setStats(j); })
      .catch(() => { if (!cancelled) setErrored(true); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  if (loading) return null;

  const hitsPerBot: Record<string, number> | undefined = stats?.hitsPerBot;
  const hitsPerEngine: Record<string, number> | undefined = stats?.hitsPerEngine;
  const topPaths: { path: string; hits: number }[] | undefined = stats?.topPaths;

  const hasData = !errored && stats && (
    (hitsPerBot && Object.keys(hitsPerBot).length > 0) ||
    (hitsPerEngine && Object.keys(hitsPerEngine).length > 0) ||
    (topPaths && topPaths.length > 0)
  );

  return (
    <div id="crawler-analytics" className="card p-4 sm:p-6 scroll-mt-20">
      <h3 className="text-base font-bold text-[var(--ink)] flex items-center gap-2 mb-1">
        <Bot size={18} className="text-[var(--blue)]" /> Crawler Analytics
      </h3>
      <p className="text-sm text-[var(--ink-3)] mb-4">
        Real AI &amp; search bot traffic to this site, from your Vercel Log Drain.
      </p>

      {!hasData ? (
        <div className="flex items-start gap-3 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] p-4">
          <Server size={18} className="text-[var(--ink-3)] mt-0.5 shrink-0" />
          <p className="text-sm text-[var(--ink-2)]">No crawler data yet — configure a Vercel Log Drain to /api/crawler-logs.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {hitsPerBot && Object.keys(hitsPerBot).length > 0 && (
            <div>
              <div className="text-xs uppercase tracking-wider font-semibold text-[var(--ink-3)] mb-2">Hits per Bot</div>
              <div className="flex flex-col gap-1.5">
                {Object.entries(hitsPerBot).sort((a, b) => b[1] - a[1]).map(([bot, count]) => (
                  <div key={bot} className="flex justify-between items-center py-1.5 border-b border-[var(--border)] last:border-0">
                    <span className="text-sm text-[var(--ink-2)]">{bot}</span>
                    <span className="text-sm font-semibold text-[var(--ink)] font-mono">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {hitsPerEngine && Object.keys(hitsPerEngine).length > 0 && (
            <div>
              <div className="text-xs uppercase tracking-wider font-semibold text-[var(--ink-3)] mb-2">Hits per Engine</div>
              <div className="flex flex-col gap-1.5">
                {Object.entries(hitsPerEngine).sort((a, b) => b[1] - a[1]).map(([engine, count]) => (
                  <div key={engine} className="flex justify-between items-center py-1.5 border-b border-[var(--border)] last:border-0">
                    <span className="text-sm text-[var(--ink-2)]">{engine}</span>
                    <span className="text-sm font-semibold text-[var(--ink)] font-mono">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {topPaths && topPaths.length > 0 && (
            <div className="md:col-span-2">
              <div className="text-xs uppercase tracking-wider font-semibold text-[var(--ink-3)] mb-2">Top Crawled Paths</div>
              <div className="flex flex-col gap-1.5">
                {topPaths.map((p, i) => (
                  <div key={i} className="flex justify-between items-center py-1.5 border-b border-[var(--border)] last:border-0">
                    <span className="text-sm text-[var(--blue)] truncate max-w-[70%]">{p.path}</span>
                    <span className="text-sm font-semibold text-[var(--ink)] font-mono">{p.hits}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
