'use client';

import { LayoutDashboard, Zap, Search, Users, FileText, BarChart3, Settings, HelpCircle, Sparkles } from 'lucide-react';

const NAV = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'geo', label: 'AI Visibility', icon: Sparkles },
  { id: 'technical', label: 'Technical', icon: Zap },
  { id: 'keywords', label: 'Keywords', icon: Search },
  { id: 'competitors', label: 'Competitors', icon: Users },
  { id: 'content', label: 'Content Plan', icon: FileText },
  { id: 'reports', label: 'Reports', icon: BarChart3 },
];

export default function Sidebar({ active = 'overview', domain }: { active?: string; domain?: string }) {
  return (
    <aside className="hidden lg:flex w-[244px] shrink-0 flex-col bg-[var(--surface)] border-r border-[var(--border)] h-screen sticky top-0">
      {/* Brand */}
      <div className="px-6 h-[68px] flex items-center gap-2.5 border-b border-[var(--border)]">
        <div className="w-8 h-8 rounded-lg bg-[var(--brand)] flex items-center justify-center text-white">
          <BarChart3 size={18} />
        </div>
        <span className="font-bold text-[var(--ink)] text-[17px] tracking-tight">SEO Audit</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 flex flex-col gap-1">
        {NAV.map(({ id, label, icon: Icon }) => {
          const isActive = id === active;
          return (
            <a
              key={id}
              href={`#${id}`}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-[var(--brand-soft)] text-[var(--brand-ink)]'
                  : 'text-[var(--ink-2)] hover:bg-[var(--surface-2)] hover:text-[var(--ink)]'
              }`}
            >
              <Icon size={18} className={isActive ? 'text-[var(--brand)]' : 'text-[var(--ink-3)]'} />
              {label}
            </a>
          );
        })}

        <div className="mt-auto flex flex-col gap-1 pt-4">
          <a href="#" className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-[var(--ink-2)] hover:bg-[var(--surface-2)] transition-colors">
            <Settings size={18} className="text-[var(--ink-3)]" /> Settings
          </a>
          <a href="#" className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-[var(--ink-2)] hover:bg-[var(--surface-2)] transition-colors">
            <HelpCircle size={18} className="text-[var(--ink-3)]" /> Help
          </a>
        </div>
      </nav>

      {/* Domain footer */}
      {domain && (
        <div className="px-4 py-3 border-t border-[var(--border)]">
          <div className="rounded-lg bg-[var(--surface-2)] px-3 py-2.5">
            <div className="text-[10px] uppercase tracking-wider text-[var(--ink-3)] font-semibold mb-0.5">Auditing</div>
            <div className="text-sm font-semibold text-[var(--ink)] truncate">{domain}</div>
          </div>
        </div>
      )}
    </aside>
  );
}
