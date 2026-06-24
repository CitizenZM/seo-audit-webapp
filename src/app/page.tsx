'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Loader2 } from 'lucide-react';
import RecentAudits from './RecentAudits';

export default function Home() {
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [competitors, setCompetitors] = useState('');
  const [loading, setLoading] = useState(false);

  const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;
    
    setLoading(true);
    
    // In a real flow, you'd send a request to /api/analyze here and wait for the job to finish.
    // We will simulate navigating to the dashboard with query params for now.
    const query = new URLSearchParams();
    query.set('url', url);
    if (competitors) query.set('competitors', competitors);
    
    router.push(`/dashboard?${query.toString()}`);
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 bg-[var(--bg)] text-[var(--ink)]">
      <div className="max-w-xl w-full text-center mb-10">
        <div className="inline-flex items-center gap-2 mb-5">
          <div className="w-9 h-9 rounded-lg bg-[var(--brand)] flex items-center justify-center text-white">
            <Search size={18} />
          </div>
          <span className="font-bold text-lg tracking-tight">SEO Audit</span>
        </div>
        <h1 className="text-4xl md:text-5xl font-extrabold text-[var(--ink)] mb-4 tracking-tight">
          SEO Audit &amp; Action Plan
        </h1>
        <p className="text-[var(--ink-2)] text-lg">
          Generate an executive-ready SEO analysis, complete with competitor gaps, content briefs, and technical health checks.
        </p>
      </div>

      <div className="w-full max-w-xl card p-8" style={{ boxShadow: 'var(--shadow-md)' }}>
        <form onSubmit={handleAnalyze} className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <label htmlFor="url" className="text-xs font-semibold text-[var(--ink-2)] tracking-wide uppercase">
              Target URL
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[var(--ink-3)]">
                <Search size={18} />
              </div>
              <input
                id="url"
                type="url"
                placeholder="https://example.com"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                required
                className="w-full pl-10 pr-4 py-3 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg text-[var(--ink)] placeholder-[var(--ink-3)] focus:outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand-soft)] transition-all"
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="competitors" className="text-xs font-semibold text-[var(--ink-2)] tracking-wide uppercase">
              Competitor URLs (Optional)
            </label>
            <input
              id="competitors"
              type="text"
              placeholder="e.g. beistravel.com, calpaktravel.com"
              value={competitors}
              onChange={(e) => setCompetitors(e.target.value)}
              className="w-full px-4 py-3 bg-[var(--surface-2)] border border-[var(--border)] rounded-lg text-[var(--ink)] placeholder-[var(--ink-3)] focus:outline-none focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand-soft)] transition-all"
            />
            <p className="text-xs text-[var(--ink-3)]">Comma separated list of competitors for gap analysis.</p>
          </div>

          <button
            type="submit"
            disabled={loading || !url}
            className="mt-2 w-full flex justify-center items-center gap-2 py-3 px-6 rounded-lg font-semibold text-white bg-[var(--brand)] hover:brightness-95 active:scale-[0.99] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <Loader2 className="animate-spin" size={20} />
                Initializing Analysis Engine...
              </>
            ) : (
              'Run Full Audit'
            )}
          </button>
        </form>
      </div>

      <RecentAudits />

      <div className="mt-14 grid grid-cols-2 md:grid-cols-4 gap-6 text-center max-w-3xl">
        {[
          { n: 1, label: 'Crawl Site & Sitemap', tone: 'var(--blue)', soft: 'var(--blue-soft)' },
          { n: 2, label: 'Analyze Competitors', tone: 'var(--brand)', soft: 'var(--brand-soft)' },
          { n: 3, label: 'Check Speed & UX', tone: 'var(--amber)', soft: 'var(--amber-soft)' },
          { n: 4, label: 'AI Synthesis', tone: 'var(--red)', soft: 'var(--red-soft)' },
        ].map((s) => (
          <div key={s.n} className="flex flex-col items-center gap-2 text-[var(--ink-2)]">
            <div className="w-12 h-12 rounded-full flex items-center justify-center font-bold text-xl" style={{ background: s.soft, color: s.tone }}>{s.n}</div>
            <span className="text-sm mt-1">{s.label}</span>
          </div>
        ))}
      </div>
    </main>
  );
}
