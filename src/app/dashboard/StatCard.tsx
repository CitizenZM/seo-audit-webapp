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
      <div className="tile-gradient p-3.5 sm:p-5" style={{ background: t.grad }}>
        <div className="flex items-center justify-between mb-2.5 sm:mb-4">
          <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0">
            <div className="w-7 h-7 sm:w-9 sm:h-9 shrink-0 rounded-lg flex items-center justify-center bg-white/15 text-white">
              <Icon size={16} className="sm:hidden" />
              <Icon size={18} className="hidden sm:block" />
            </div>
            <span className="text-xs sm:text-sm font-medium text-white/85 truncate">{label}</span>
          </div>
          <MoreHorizontal size={18} className="hidden sm:block text-white/60 shrink-0" />
        </div>
        <div className="text-xl sm:text-[30px] font-extrabold text-white leading-none tracking-tight mb-1.5 sm:mb-3">{value}</div>
        {delta !== undefined && (
          <div className="flex items-center gap-1.5 sm:gap-2">
            <span className="inline-flex items-center gap-1 text-[11px] sm:text-xs font-semibold px-1.5 py-0.5 rounded-md bg-white/15 text-white">
              {up ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
              {up ? '+' : ''}{delta}%
            </span>
            <span className="hidden sm:inline text-xs text-white/70">{deltaSuffix}</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="card p-3.5 sm:p-5">
      <div className="flex items-center justify-between mb-2.5 sm:mb-4">
        <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0">
          <div className="w-7 h-7 sm:w-9 sm:h-9 shrink-0 rounded-lg flex items-center justify-center" style={{ background: t.soft, color: t.ink }}>
            <Icon size={16} className="sm:hidden" />
            <Icon size={18} className="hidden sm:block" />
          </div>
          <span className="text-xs sm:text-sm font-medium text-[var(--ink-2)] truncate">{label}</span>
        </div>
        <MoreHorizontal size={18} className="hidden sm:block text-[var(--ink-3)] shrink-0" />
      </div>

      <div className="text-xl sm:text-[28px] font-extrabold text-[var(--ink)] leading-none tracking-tight mb-1.5 sm:mb-3">{value}</div>

      {delta !== undefined && (
        <div className="flex items-center gap-1.5 sm:gap-2">
          <span
            className="inline-flex items-center gap-1 text-[11px] sm:text-xs font-semibold px-1.5 py-0.5 rounded-md"
            style={{
              background: up ? 'var(--brand-soft)' : 'var(--red-soft)',
              color: up ? 'var(--brand)' : 'var(--red)',
            }}
          >
            {up ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
            {up ? '+' : ''}{delta}%
          </span>
          <span className="hidden sm:inline text-xs text-[var(--ink-3)]">{deltaSuffix}</span>
        </div>
      )}
    </div>
  );
}
