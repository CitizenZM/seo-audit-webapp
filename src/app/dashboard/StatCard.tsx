'use client';

import { TrendingUp, TrendingDown, MoreHorizontal, type LucideIcon } from 'lucide-react';

interface StatCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  /** percentage change vs last audit, e.g. 20 or -5 */
  delta?: number;
  deltaSuffix?: string;
  tone?: 'brand' | 'blue' | 'amber' | 'red';
}

const TONE: Record<string, { soft: string; ink: string }> = {
  brand: { soft: 'var(--brand-soft)', ink: 'var(--brand)' },
  blue: { soft: 'var(--blue-soft)', ink: 'var(--blue)' },
  amber: { soft: 'var(--amber-soft)', ink: 'var(--amber)' },
  red: { soft: 'var(--red-soft)', ink: 'var(--red)' },
};

export default function StatCard({ label, value, icon: Icon, delta, deltaSuffix = 'from last audit', tone = 'brand' }: StatCardProps) {
  const t = TONE[tone];
  const up = (delta ?? 0) >= 0;

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: t.soft, color: t.ink }}>
            <Icon size={18} />
          </div>
          <span className="text-sm font-medium text-[var(--ink-2)]">{label}</span>
        </div>
        <MoreHorizontal size={18} className="text-[var(--ink-3)]" />
      </div>

      <div className="text-[28px] font-extrabold text-[var(--ink)] leading-none tracking-tight mb-3">{value}</div>

      {delta !== undefined && (
        <div className="flex items-center gap-2">
          <span
            className="inline-flex items-center gap-1 text-xs font-semibold px-1.5 py-0.5 rounded-md"
            style={{
              background: up ? 'var(--brand-soft)' : 'var(--red-soft)',
              color: up ? 'var(--brand)' : 'var(--red)',
            }}
          >
            {up ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {up ? '+' : ''}{delta}%
          </span>
          <span className="text-xs text-[var(--ink-3)]">{deltaSuffix}</span>
        </div>
      )}
    </div>
  );
}
