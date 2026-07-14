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
  /** Render as a solid gradient hero tile instead of the default soft-icon card. */
  hero?: boolean;
}

const TONE: Record<string, { soft: string; ink: string; grad: string }> = {
  brand: { soft: 'var(--brand-soft)', ink: 'var(--brand)', grad: 'var(--grad-brand)' },
  blue: { soft: 'var(--blue-soft)', ink: 'var(--blue)', grad: 'var(--grad-blue)' },
  amber: { soft: 'var(--amber-soft)', ink: 'var(--amber)', grad: 'var(--grad-amber)' },
  red: { soft: 'var(--red-soft)', ink: 'var(--red)', grad: 'var(--grad-ink)' },
};

export default function StatCard({ label, value, icon: Icon, delta, deltaSuffix = 'from last audit', tone = 'brand', hero = false }: StatCardProps) {
  const t = TONE[tone];
  const up = (delta ?? 0) >= 0;

  if (hero) {
    return (
      <div className="tile-gradient p-4 sm:p-5" style={{ background: t.grad }}>
        <div className="flex items-center justify-between gap-2 mb-4">
          <div className="flex items-start gap-2 sm:gap-2.5 min-w-0">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg flex items-center justify-center bg-white/15 text-white shrink-0">
              <Icon size={18} />
            </div>
            <span className="text-xs sm:text-sm font-medium text-white/85 leading-tight line-clamp-2 pt-0.5 sm:pt-1">{label}</span>
          </div>
          <MoreHorizontal size={18} className="hidden sm:block text-white/60 shrink-0" />
        </div>
        <div className="text-[24px] sm:text-[30px] font-extrabold text-white leading-none tracking-tight mb-3">{value}</div>
        {delta !== undefined && (
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1 text-xs font-semibold px-1.5 py-0.5 rounded-md bg-white/15 text-white">
              {up ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
              {up ? '+' : ''}{delta}%
            </span>
            <span className="text-xs text-white/70">{deltaSuffix}</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="card p-4 sm:p-5">
      <div className="flex items-start justify-between gap-2 mb-4">
        <div className="flex items-start gap-2 sm:gap-2.5 min-w-0">
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: t.soft, color: t.ink }}>
            <Icon size={18} />
          </div>
          <span className="text-xs sm:text-sm font-medium text-[var(--ink-2)] leading-tight line-clamp-2 pt-0.5 sm:pt-1">{label}</span>
        </div>
        <MoreHorizontal size={18} className="hidden sm:block text-[var(--ink-3)] shrink-0" />
      </div>

      <div className="text-[22px] sm:text-[28px] font-extrabold text-[var(--ink)] leading-none tracking-tight mb-3">{value}</div>

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
