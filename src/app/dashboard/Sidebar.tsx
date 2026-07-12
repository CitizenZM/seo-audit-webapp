'use client';

import {
  LayoutDashboard, Zap, Search, Users, FileText, BarChart3, Settings, HelpCircle,
  Sparkles, Eye, Trophy, Quote, PenLine, UserRound,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/**
 * Gumshoe/Profound-style grouped navigation:
 *   Dashboard → the headline visibility audit
 *   Monitor   → what AI/search says about you (read)
 *   Act       → what to change (do)
 *   Configure → setup (personas coming later)
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
    label: 'Monitor',
    items: [
      { id: 'leaderboard', label: 'Competitive leaderboard', icon: Trophy },
      { id: 'geo', label: 'AI crawlers & GEO', icon: Sparkles },
      { id: 'citations', label: 'Citation audit', icon: Quote },
      { id: 'keywords', label: 'Keywords', icon: Search },
    ],
  },
  {
    label: 'Act',
    items: [
      { id: 'technical', label: 'Technical audit', icon: Zap },
      { id: 'competitors', label: 'Competitor gap', icon: Users },
      { id: 'content', label: 'Content plan', icon: FileText },
      { id: 'reports', label: 'Action plan', icon: BarChart3 },
    ],
  },
  {
    label: 'Configure',
    items: [
      { id: 'personas', label: 'Personas', icon: UserRound, soon: true },
      { id: 'content-generation', label: 'Content generation', icon: PenLine, soon: true },
    ],
  },
];

export default function Sidebar({ active = 'overview', domain }: { active?: string; domain?: string }) {
  return (
    <aside className="hidden lg:flex w-[244px] shrink-0 flex-col bg-[var(--surface)] border-r border-[var(--border)] h-screen sticky top-0 overflow-y-auto">
      {/* Brand */}
      <div className="px-6 h-[68px] flex items-center gap-2.5 border-b border-[var(--border)] shrink-0">
        <div className="w-8 h-8 rounded-lg bg-[var(--brand)] flex items-center justify-center text-white">
          <BarChart3 size={18} />
        </div>
        <span className="font-bold text-[var(--ink)] text-[17px] tracking-tight">SEO Audit</span>
      </div>

      {/* Grouped nav */}
      <nav className="flex-1 px-3 py-4 flex flex-col gap-1">
        {GROUPS.map((group, gi) => (
          <div key={gi} className={gi > 0 ? 'mt-4' : ''}>
            {group.label && (
              <div className="px-3 pb-1.5 text-[10px] uppercase tracking-widest font-bold text-[var(--ink-3)]">{group.label}</div>
            )}
            {group.items.map(({ id, label, icon: Icon, soon }) => {
              const isActive = id === active;
              if (soon) {
                return (
                  <span key={id} className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-[var(--ink-3)] cursor-default select-none">
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
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-[var(--brand-soft)] text-[var(--brand-ink)]'
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
          <a href="#" className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-[var(--ink-2)] hover:bg-[var(--surface-2)] transition-colors">
            <Settings size={17} className="text-[var(--ink-3)]" /> Settings
          </a>
          <a href="#" className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-[var(--ink-2)] hover:bg-[var(--surface-2)] transition-colors">
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
    </aside>
  );
}
