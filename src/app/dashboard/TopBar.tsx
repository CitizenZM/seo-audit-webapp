'use client';

import { useState } from 'react';
import { Search, RefreshCw, Share2, Download, Bell, Check, Menu } from 'lucide-react';
import AccountMenu from '@/app/AccountMenu';

const NAV_LINKS: { label: string; href: string }[] = [
  { label: 'Reports', href: '/reports' },
  { label: 'Insights', href: '#' },
  { label: 'Roadmap', href: '#' },
  { label: 'Help', href: '#' },
];

export default function TopBar({ url, onMenuClick }: { url?: string; onMenuClick?: () => void }) {
  const [shared, setShared] = useState(false);
  const [showNotifs, setShowNotifs] = useState(false);

  return (
    <header className="h-[60px] sm:h-[68px] sticky top-0 z-40 bg-[var(--surface)]/85 backdrop-blur-md border-b border-[var(--border)] flex items-center justify-between px-3 sm:px-6 gap-2 sm:gap-4">
      <div className="flex items-center gap-2 min-w-0">
        <button
          onClick={onMenuClick}
          aria-label="Open menu"
          className="lg:hidden shrink-0 w-11 h-11 -ml-1 flex items-center justify-center rounded-lg text-[var(--ink-2)] hover:bg-[var(--surface-2)] transition-colors"
        >
          <Menu size={20} />
        </button>
        <div className="min-w-0">
          <h1 className="text-[15px] sm:text-[18px] font-bold text-[var(--ink)] tracking-tight leading-tight truncate">SEO Report</h1>
          <p className="hidden sm:block text-xs text-[var(--ink-3)] truncate max-w-[280px]">{url}</p>
        </div>
      </div>

      {/* Horizontal utility nav — Salesforce-one style */}
      <nav className="no-print hidden xl:flex items-center gap-6 text-sm font-medium text-[var(--ink-2)]">
        {NAV_LINKS.map((l) => (
          <a key={l.label} href={l.href} className="hover:text-[var(--ink)] transition-colors">{l.label}</a>
        ))}
      </nav>

      <div className="flex items-center gap-1.5 sm:gap-2.5">
        <div className="hidden md:flex items-center gap-2 px-3 h-9 rounded-lg bg-[var(--surface-2)] border border-[var(--border)] text-[var(--ink-3)] w-[200px]">
          <Search size={15} />
          <input
            placeholder="Search report…"
            className="bg-transparent text-sm text-[var(--ink)] placeholder:text-[var(--ink-3)] outline-none w-full"
          />
        </div>

        <div className="hidden sm:flex items-center gap-1.5 text-xs text-[var(--ink-3)] px-2">
          <RefreshCw size={13} /> Updated just now
        </div>

        {/* Notification bell */}
        <div className="no-print relative">
          <button
            onClick={() => setShowNotifs((s) => !s)}
            aria-label="Notifications"
            className="relative w-10 h-10 sm:w-9 sm:h-9 flex items-center justify-center rounded-lg border border-[var(--border)] text-[var(--ink-2)] hover:bg-[var(--surface-2)] transition-colors bell-dot"
          >
            <Bell size={16} />
          </button>
          {showNotifs && (
            <div className="absolute right-0 top-12 w-[min(288px,85vw)] rounded-xl bg-[var(--surface)] border border-[var(--border)] shadow-[var(--shadow-md)] p-3 z-50">
              <div className="text-xs font-bold uppercase tracking-wider text-[var(--ink-3)] mb-2 px-1">Notifications</div>
              <div className="flex flex-col gap-1">
                <div className="px-2 py-2 rounded-lg hover:bg-[var(--surface-2)] text-sm text-[var(--ink-2)]">Report generated successfully.</div>
                <div className="px-2 py-2 rounded-lg hover:bg-[var(--surface-2)] text-sm text-[var(--ink-2)]">Add this URL to your watchlist for weekly re-audits.</div>
              </div>
            </div>
          )}
        </div>

        <button
          onClick={() => window.print()}
          aria-label="Export PDF"
          className="no-print flex items-center gap-1.5 h-10 sm:h-9 px-2.5 sm:px-3 rounded-lg border border-[var(--border)] text-sm font-medium text-[var(--ink-2)] hover:bg-[var(--surface-2)] transition-colors"
        >
          <Download size={15} /> <span className="hidden sm:inline">Export PDF</span>
        </button>
        <button
          onClick={() => {
            if (navigator.share) navigator.share({ title: 'SEO Report', url: window.location.href }).catch(() => {});
            else navigator.clipboard?.writeText(window.location.href);
            setShared(true);
            setTimeout(() => setShared(false), 2000);
          }}
          className="no-print flex items-center gap-1.5 h-10 sm:h-9 px-2.5 sm:px-3.5 rounded-lg text-white text-sm font-semibold hover:brightness-105 transition-all shadow-[0_2px_8px_rgba(22,163,74,0.25)]"
          style={{ background: 'var(--grad-brand)' }}
        >
          {shared ? <Check size={15} /> : <Share2 size={15} />} <span className="hidden sm:inline">{shared ? 'Copied' : 'Share'}</span>
        </button>
        <AccountMenu />
      </div>
    </header>
  );
}
