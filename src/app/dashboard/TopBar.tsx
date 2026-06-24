'use client';

import { Search, RefreshCw, Share2, Download } from 'lucide-react';

export default function TopBar({ url }: { url?: string }) {
  return (
    <header className="h-[68px] sticky top-0 z-40 bg-[var(--surface)]/80 backdrop-blur-md border-b border-[var(--border)] flex items-center justify-between px-6 gap-4">
      <div>
        <h1 className="text-[18px] font-bold text-[var(--ink)] tracking-tight leading-tight">SEO Report</h1>
        <p className="text-xs text-[var(--ink-3)] truncate max-w-[280px]">{url}</p>
      </div>

      <div className="flex items-center gap-2.5">
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

        <button
          onClick={() => window.print()}
          className="no-print flex items-center gap-1.5 h-9 px-3 rounded-lg border border-[var(--border)] text-sm font-medium text-[var(--ink-2)] hover:bg-[var(--surface-2)] transition-colors"
        >
          <Download size={15} /> Export PDF
        </button>
        <button
          onClick={() => {
            if (navigator.share) navigator.share({ title: 'SEO Report', url: window.location.href }).catch(() => {});
            else { navigator.clipboard?.writeText(window.location.href); }
          }}
          className="no-print flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-[var(--brand)] text-white text-sm font-semibold hover:brightness-95 transition-all"
        >
          <Share2 size={15} /> Share
        </button>
      </div>
    </header>
  );
}
