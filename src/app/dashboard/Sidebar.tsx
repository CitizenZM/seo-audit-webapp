'use client';

import { useEffect, useState } from 'react';
import {
  LayoutDashboard, Zap, Search, Users, FileText, BarChart3, Settings, HelpCircle,
  Sparkles, Eye, Trophy, Quote, PenLine, UserRound, TrendingUp, Rocket, X,
  Grid3x3, Heart, ShieldCheck, Link2, LineChart, ShoppingCart, Bot, FileCode2,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/**
 * Grouped navigation, ordered to MATCH the actual render order of sections in
 * dashboard/page.tsx — every id here must exist in the DOM (page.tsx renders
 * hidden fallback anchors for any card that returned null, so clicks always
 * land on the right spot even when a section has no data).
 */
const GROUPS: { label: string | null; items: { id: string; label: string; icon: LucideIcon; soon?: boolean }[] }[] = [
  {
    label: null,
    items: [
      { id: 'overview', label: 'Overview', icon: LayoutDashboard },
      { id: 'visibility', label: 'Visibility audit', icon: Eye },
    ],
  },
  {
    label: 'AI visibility',
    items: [
      { id: 'leaderboard', label: 'Competitive leaderboard', icon: Trophy },
      { id: 'persona-heatmap', label: 'Persona heatmap', icon: Grid3x3 },
      { id: 'sentiment-drivers', label: 'Sentiment drivers', icon: Heart },
      { id: 'claims-accuracy', label: 'Claims accuracy', icon: ShieldCheck },
      { id: 'citations', label: 'Citation audit', icon: Quote },
      { id: 'citation-gap', label: 'Citation gap', icon: Link2 },
    ],
  },
  {
    label: 'Tracking',
    items: [
      { id: 'trends', label: 'Score trends', icon: TrendingUp },
      { id: 'visibility-trend', label: 'Visibility trend', icon: LineChart },
      { id: 'crawler-analytics', label: 'Crawler analytics', icon: Bot },
    ],
  },
  {
    label: 'GEO',
    items: [
      { id: 'geo', label: 'AI crawlers & GEO', icon: Sparkles },
      { id: 'commerce-readiness', label: 'Commerce readiness', icon: ShoppingCart },
    ],
  },
  {
    label: 'SEO',
    items: [
      { id: 'technical', label: 'Technical audit', icon: Zap },
      { id: 'keywords', label: 'Keywords', icon: Search },
      { id: 'competitors', label: 'Competitor gap', icon: Users },
      { id: 'content', label: 'Content plan', icon: FileText },
    ],
  },
  {
    label: 'Act',
    items: [
      { id: 'reports', label: 'Optimization plan', icon: Rocket },
      { id: 'activation', label: 'AI-ready artifacts', icon: FileCode2 },
      { id: 'content-generation', label: 'Content generation', icon: PenLine },
      { id: 'personas', label: 'Personas', icon: UserRound, soon: true },
    ],
  },
];

const ALL_IDS = GROUPS.flatMap((g) => g.items.filter((i) => !i.soon).map((i) => i.id));

/**
 * Scrollspy: highlight the section nearest the top of the viewport. The old
 * hardcoded `active="overview"` never updated, which made every click look
 * like it landed on the wrong section.
 */
function useScrollSpy(initial: string): string {
  const [active, setActive] = useState(initial);
  useEffect(() => {
    const visible = new Map<string, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) visible.set(e.target.id, e.boundingClientRect.top);
          else visible.delete(e.target.id);
        }
        if (visible.size > 0) {
          const top = [...visible.entries()].sort((a, b) => a[1] - b[1])[0][0];
          setActive(top);
        }
      },
      { rootMargin: '-64px 0px -55% 0px', threshold: 0 },
    );
    const els = ALL_IDS.map((id) => document.getElementById(id)).filter((el): el is HTMLElement => !!el);
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);
  return active;
}

export default function Sidebar({
  active = 'overview',
  domain,
  open = false,
  onClose,
}: {
  active?: string;
  domain?: string;
  open?: boolean;
  onClose?: () => void;
}) {
  const spied = useScrollSpy(active);
  const navContent = (
    <>
      {/* Grouped nav */}
      <nav className="flex-1 px-3 py-4 flex flex-col gap-1 overflow-y-auto">
        {GROUPS.map((group, gi) => (
          <div key={gi} className={gi > 0 ? 'mt-4' : ''}>
            {group.label && (
              <div className="px-3 pb-1.5 text-[10px] uppercase tracking-widest font-bold text-[var(--ink-3)]">{group.label}</div>
            )}
            {group.items.map(({ id, label, icon: Icon, soon }) => {
              const isActive = id === spied;
              if (soon) {
                return (
                  <span key={id} className="flex items-center gap-3 px-3 py-2.5 lg:py-2 rounded-lg text-sm font-medium text-[var(--ink-3)] cursor-default select-none">
                    <Icon size={17} className="text-[var(--ink-3)] opacity-60" />
                    {label}
                    <span className="ml-auto text-[9px] uppercase tracking-wider bg-[var(--surface-2)] border border-[var(--border)] rounded px-1.5 py-0.5">Soon</span>
                  </span>
                );
              }
              return (
                <a
                  key={id}
                  href={`#${id}`}
                  onClick={onClose}
                  className={`flex items-center gap-3 px-3 py-2.5 lg:py-2 rounded-xl text-sm font-medium transition-all min-h-11 lg:min-h-0 ${
                    isActive
                      ? 'bg-[var(--brand-soft)] text-[var(--brand-ink)] shadow-[inset_0_0_0_1px_rgba(22,163,74,0.15)]'
                      : 'text-[var(--ink-2)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]'
                  }`}
                >
                  <Icon size={17} className={isActive ? 'text-[var(--brand)]' : 'text-[var(--ink-3)]'} />
                  {label}
                </a>
              );
            })}
          </div>
        ))}

        <div className="mt-auto flex flex-col gap-1 pt-4">
          <a href="#" className="flex items-center gap-3 px-3 py-2.5 lg:py-2 rounded-lg text-sm font-medium text-[var(--ink-2)] hover:bg-[var(--surface-2)] transition-colors min-h-11 lg:min-h-0">
            <Settings size={17} className="text-[var(--ink-3)]" /> Settings
          </a>
          <a href="#" className="flex items-center gap-3 px-3 py-2.5 lg:py-2 rounded-lg text-sm font-medium text-[var(--ink-2)] hover:bg-[var(--surface-2)] transition-colors min-h-11 lg:min-h-0">
            <HelpCircle size={17} className="text-[var(--ink-3)]" /> Help
          </a>
        </div>
      </nav>

      {/* Domain footer (project context, Gumshoe-style) */}
      {domain && (
        <div className="px-4 py-3 border-t border-[var(--border)] shrink-0">
          <div className="rounded-lg bg-[var(--surface-2)] px-3 py-2.5">
            <div className="text-[10px] uppercase tracking-wider text-[var(--ink-3)] font-semibold mb-0.5">Project</div>
            <div className="text-sm font-semibold text-[var(--ink)] truncate">{domain}</div>
          </div>
        </div>
      )}
    </>
  );

  return (
    <>
      {/* Desktop fixed sidebar */}
      <aside className="hidden lg:flex w-[244px] shrink-0 flex-col bg-[var(--surface)] border-r border-[var(--border)] h-screen sticky top-0 overflow-y-auto">
        <div className="px-6 h-[68px] flex items-center gap-2.5 border-b border-[var(--border)] shrink-0">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white shadow-[0_2px_6px_rgba(22,163,74,0.3)]" style={{ background: 'var(--grad-brand)' }}>
            <BarChart3 size={18} />
          </div>
          <span className="font-bold text-[var(--ink)] text-[17px] tracking-tight">SEO Audit</span>
        </div>
        {navContent}
      </aside>

      {/* Mobile drawer + backdrop */}
      <div className={`lg:hidden fixed inset-0 z-50 no-print ${open ? '' : 'pointer-events-none'}`} aria-hidden={!open}>
        <div
          className={`absolute inset-0 bg-black/40 transition-opacity duration-200 ${open ? 'opacity-100' : 'opacity-0'}`}
          onClick={onClose}
        />
        <aside
          className={`absolute left-0 top-0 h-full w-[85vw] max-w-[300px] bg-[var(--surface)] shadow-2xl flex flex-col transition-transform duration-200 ease-out ${
            open ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="px-4 h-[60px] flex items-center justify-between gap-2.5 border-b border-[var(--border)] shrink-0">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white shrink-0 shadow-[0_2px_6px_rgba(22,163,74,0.3)]" style={{ background: 'var(--grad-brand)' }}>
                <BarChart3 size={18} />
              </div>
              <span className="font-bold text-[var(--ink)] text-[17px] tracking-tight truncate">SEO Audit</span>
            </div>
            <button
              onClick={onClose}
              aria-label="Close menu"
              className="w-11 h-11 -mr-2 flex items-center justify-center rounded-lg text-[var(--ink-2)] hover:bg-[var(--surface-2)] shrink-0"
            >
              <X size={20} />
            </button>
          </div>
          {navContent}
        </aside>
      </div>
    </>
  );
}
