'use client';

import { useEffect, useState } from 'react';
import { Download, Share2, Check, ArrowLeft, BarChart3 } from 'lucide-react';
import Link from 'next/link';
import BrandingSettings from './BrandingSettings';
import { sanitizeBranding, BRANDING_LOCALSTORAGE_KEY, type Branding } from '@/lib/branding';

function readLocalBranding(): Branding {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(BRANDING_LOCALSTORAGE_KEY);
    return raw ? sanitizeBranding(JSON.parse(raw)) : {};
  } catch {
    return {};
  }
}

export default function ReportHeader({ domain, url, generatedAt }: { domain: string; url: string; generatedAt: string }) {
  const [shared, setShared] = useState(false);
  const [branding, setBranding] = useState<Branding>({});

  useEffect(() => {
    setBranding(readLocalBranding());
    const onUpdate = (e: Event) => setBranding((e as CustomEvent<Branding>).detail ?? readLocalBranding());
    window.addEventListener('agency-branding-updated', onUpdate);
    return () => window.removeEventListener('agency-branding-updated', onUpdate);
  }, []);

  const productName = branding.agencyName || 'Audit Report';

  return (
    <header
      className="no-print sticky top-0 z-40 bg-[var(--surface)]/90 backdrop-blur-md border-b border-[var(--border)] h-16 sm:h-[68px] flex items-center justify-between px-3 sm:px-6 gap-2"
      style={branding.accentColor ? ({ '--brand': branding.accentColor, '--brand-ink': branding.accentColor } as React.CSSProperties) : undefined}
    >
      <div className="flex items-center gap-2 sm:gap-3 min-w-0">
        <Link href="/reports" className="w-10 h-10 sm:w-9 sm:h-9 flex items-center justify-center rounded-lg border border-[var(--border)] text-[var(--ink-2)] hover:bg-[var(--surface-2)] transition-colors shrink-0">
          <ArrowLeft size={16} />
        </Link>
        {branding.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={branding.logoUrl} alt={productName} className="w-8 h-8 rounded-lg hidden sm:block object-contain shrink-0" />
        ) : (
          <div className="w-8 h-8 rounded-lg hidden sm:flex items-center justify-center text-white shrink-0" style={{ background: 'var(--grad-brand)' }}>
            <BarChart3 size={16} />
          </div>
        )}
        <div className="min-w-0">
          <h1 className="text-[13px] sm:text-[15px] font-bold text-[var(--ink)] tracking-tight leading-tight truncate">{productName} — {domain}</h1>
          <p className="text-[11px] sm:text-xs text-[var(--ink-3)] truncate hidden sm:block">{url} · Generated {new Date(generatedAt).toLocaleDateString()}</p>
        </div>
      </div>
      <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
        <BrandingSettings />
        <button
          onClick={() => window.print()}
          aria-label="Export PDF"
          className="flex items-center gap-1.5 h-10 sm:h-9 px-2.5 sm:px-3 rounded-lg border border-[var(--border)] text-sm font-medium text-[var(--ink-2)] hover:bg-[var(--surface-2)] transition-colors"
        >
          <Download size={15} /> <span className="hidden sm:inline">Export PDF</span>
        </button>
        <button
          onClick={() => {
            if (navigator.share) navigator.share({ title: 'Audit Report', url: window.location.href }).catch(() => {});
            else navigator.clipboard?.writeText(window.location.href);
            setShared(true);
            setTimeout(() => setShared(false), 2000);
          }}
          className="flex items-center gap-1.5 h-10 sm:h-9 px-2.5 sm:px-3.5 rounded-lg text-white text-sm font-semibold hover:brightness-105 transition-all"
          style={{ background: 'var(--grad-brand)' }}
        >
          {shared ? <Check size={15} /> : <Share2 size={15} />} <span className="hidden sm:inline">{shared ? 'Copied' : 'Share'}</span>
        </button>
      </div>
    </header>
  );
}
