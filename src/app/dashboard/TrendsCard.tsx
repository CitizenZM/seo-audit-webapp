'use client';

import { useEffect, useState } from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend,
} from 'chart.js';
import { TrendingUp } from 'lucide-react';
import Explainer from './Explainer';

const trendsExplainer = {
  what: 'Your overall SEO health score across past audits of this URL — shows whether technical/content fixes are moving the needle.',
  actions: [
    'Re-audit after each batch of fixes to log progress.',
    'A falling score after no changes usually means a competitor or platform shift — check Technical audit.',
  ],
};

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

interface HistoryPoint { date: string; overall: number | null; geo: number | null; visibility: number | null }

/**
 * Trends (Gumshoe "Monitor → Trends"): headline scores over time from the
 * persisted audit history. Appears once a URL has ≥2 completed audits.
 */
export default function TrendsCard({ url }: { url: string }) {
  const [history, setHistory] = useState<HistoryPoint[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/audits?url=${encodeURIComponent(url)}`)
      .then((r) => r.json())
      .then((j) => { if (!cancelled && Array.isArray(j.history)) setHistory(j.history); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [url]);

  if (history.length < 2) {
    return (
      <div id="trends" className="card p-4 sm:p-6 scroll-mt-20">
        <h3 className="text-base font-bold text-[var(--ink)] flex items-center gap-2 mb-1">
          <TrendingUp size={18} className="text-[var(--brand)]" /> Trends
        </h3>
        <Explainer {...trendsExplainer} />
        <p className="text-sm text-[var(--ink-3)]">
          Score history appears after this URL has been audited more than once. Add it to your watchlist for
          automatic weekly re-audits, and this chart fills in by itself.
        </p>
      </div>
    );
  }

  const labels = history.map((h) => new Date(h.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }));
  const series = [
    { label: 'Overall SEO', data: history.map((h) => h.overall), color: '#16a34a' },
    { label: 'GEO Readiness', data: history.map((h) => h.geo), color: '#f59e0b' },
    { label: 'Brand Visibility %', data: history.map((h) => h.visibility), color: '#3b82f6' },
  ];

  return (
    <div id="trends" className="card p-4 sm:p-6 scroll-mt-20">
      <h3 className="text-base font-bold text-[var(--ink)] flex items-center gap-2 mb-4">
        <TrendingUp size={18} className="text-[var(--brand)]" /> Trends
      </h3>
      <Explainer {...trendsExplainer} />
      <Line
        data={{
          labels,
          datasets: series.map((s) => ({
            label: s.label,
            data: s.data,
            borderColor: s.color,
            backgroundColor: s.color,
            spanGaps: true,
            tension: 0.3,
            pointRadius: 3,
          })),
        }}
        options={{
          responsive: true,
          scales: {
            y: { min: 0, max: 100, grid: { color: 'rgba(20,21,26,0.06)' }, ticks: { color: '#8a90a0' } },
            x: { grid: { display: false }, ticks: { color: '#5b6170' } },
          },
          plugins: { legend: { position: 'bottom', labels: { color: '#5b6170', font: { size: 11 }, padding: 14 } } },
        }}
      />
    </div>
  );
}
