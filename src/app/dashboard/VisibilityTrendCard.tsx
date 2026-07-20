'use client';

import { useEffect, useState } from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend,
} from 'chart.js';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

interface TrendPoint { capturedAt: string; visibilityPct: number }
interface CompetitorMover { brand: string; delta: number }
interface TrendsResponse {
  points: TrendPoint[];
  momentum: 'up' | 'down' | 'flat';
  deltaPct: number;
  competitorMovers: CompetitorMover[];
}

const momentumMeta = {
  up: { Icon: TrendingUp, color: 'var(--pass)' },
  down: { Icon: TrendingDown, color: 'var(--fail)' },
  flat: { Icon: Minus, color: 'var(--ink-3)' },
} as const;

/**
 * Visibility Trend — AI-answer visibility % over time for the audited
 * domain, fetched client-side from /api/trends. Distinct from the score
 * history TrendsCard: this tracks the visibility metric specifically and
 * surfaces competitor momentum.
 */
export default function VisibilityTrendCard({ domain }: { domain: string }) {
  const [trend, setTrend] = useState<TrendsResponse | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!domain) return;
    let cancelled = false;
    fetch(`/api/trends?domain=${encodeURIComponent(domain)}`)
      .then((r) => {
        if (r.status === 501 || !r.ok) throw new Error('unavailable');
        return r.json();
      })
      .then((j) => {
        if (cancelled) return;
        if (j && Array.isArray(j.points)) setTrend(j);
        else setFailed(true);
      })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [domain]);

  if (failed || !trend || trend.points.length < 2) return null;

  const meta = momentumMeta[trend.momentum] ?? momentumMeta.flat;
  const MomentumIcon = meta.Icon;

  const labels = trend.points.map((p) => new Date(p.capturedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }));

  return (
    <div id="visibility-trend" className="card p-4 sm:p-6 scroll-mt-20">
      <div className="flex items-start justify-between flex-wrap gap-3 mb-4">
        <h3 className="text-base font-bold text-[var(--ink)] flex items-center gap-2">
          <TrendingUp size={18} className="text-[var(--brand)]" /> AI Visibility Trend
        </h3>
        <span className="flex items-center gap-1.5 text-sm font-semibold shrink-0" style={{ color: meta.color }}>
          <MomentumIcon size={16} /> {trend.deltaPct > 0 ? '+' : ''}{trend.deltaPct}%
        </span>
      </div>
      <Line
        data={{
          labels,
          datasets: [{
            label: 'Visibility %',
            data: trend.points.map((p) => p.visibilityPct),
            borderColor: '#16a34a',
            backgroundColor: '#16a34a',
            spanGaps: true,
            tension: 0.3,
            pointRadius: 3,
          }],
        }}
        options={{
          responsive: true,
          scales: {
            y: { min: 0, max: 100, grid: { color: 'rgba(20,21,26,0.06)' }, ticks: { color: '#8a90a0' } },
            x: { grid: { display: false }, ticks: { color: '#5b6170' } },
          },
          plugins: { legend: { display: false } },
        }}
      />
      {trend.competitorMovers?.length > 0 && (
        <div className="mt-4 pt-4 border-t border-[var(--border)]">
          <div className="text-xs uppercase tracking-wider font-semibold text-[var(--ink-3)] mb-2">Competitor Movers</div>
          <div className="flex flex-wrap gap-2">
            {trend.competitorMovers.map((m, i) => (
              <span key={i} className="text-xs px-2.5 py-1 rounded-full bg-[var(--surface-2)] border border-[var(--border)] text-[var(--ink-2)]">
                <span className="font-semibold text-[var(--ink)]">{m.brand}</span>{' '}
                <span style={{ color: m.delta >= 0 ? 'var(--pass)' : 'var(--fail)' }}>{m.delta > 0 ? '+' : ''}{m.delta}%</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
