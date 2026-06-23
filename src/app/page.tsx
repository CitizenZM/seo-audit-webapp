'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Loader2 } from 'lucide-react';

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
    <main className="min-h-screen flex flex-col items-center justify-center p-6 bg-gradient-to-br from-[#1a1a2e] to-[#0f3460] text-[#eee]">
      <div className="max-w-xl w-full text-center mb-10">
        <h1 className="text-4xl md:text-5xl font-extrabold text-[#C9A84C] mb-4 tracking-tight drop-shadow-lg">
          SEO Audit & Action Plan
        </h1>
        <p className="text-[#aaa] text-lg">
          Generate an executive-ready SEO analysis, complete with competitor gaps, content briefs, and technical health checks.
        </p>
      </div>

      <div className="w-full max-w-xl rounded-2xl bg-[#16213e] p-8 border border-[rgba(255,255,255,0.06)] shadow-2xl backdrop-blur-sm">
        <form onSubmit={handleAnalyze} className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <label htmlFor="url" className="text-sm font-semibold text-[#ddd] tracking-wide uppercase">
              Target URL
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-[#aaa]">
                <Search size={18} />
              </div>
              <input
                id="url"
                type="url"
                placeholder="https://example.com"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                required
                className="w-full pl-10 pr-4 py-3 bg-[rgba(255,255,255,0.03)] border border-[#2a2a4a] rounded-lg text-white placeholder-[#888] focus:outline-none focus:border-[#C9A84C] focus:ring-1 focus:ring-[#C9A84C] transition-all"
              />
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="competitors" className="text-sm font-semibold text-[#ddd] tracking-wide uppercase">
              Competitor URLs (Optional)
            </label>
            <input
              id="competitors"
              type="text"
              placeholder="e.g. beistravel.com, calpaktravel.com"
              value={competitors}
              onChange={(e) => setCompetitors(e.target.value)}
              className="w-full px-4 py-3 bg-[rgba(255,255,255,0.03)] border border-[#2a2a4a] rounded-lg text-white placeholder-[#888] focus:outline-none focus:border-[#C9A84C] focus:ring-1 focus:ring-[#C9A84C] transition-all"
            />
            <p className="text-xs text-[#aaa]">Comma separated list of competitors for gap analysis.</p>
          </div>

          <button
            type="submit"
            disabled={loading || !url}
            className="mt-4 w-full flex justify-center items-center gap-2 py-3 px-6 rounded-lg font-bold text-[#1a1a2e] bg-gradient-to-r from-[#C9A84C] to-[#f1c40f] hover:from-[#f1c40f] hover:to-[#f39c12] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_15px_rgba(201,168,76,0.3)]"
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

      <div className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-6 text-center max-w-3xl">
        <div className="flex flex-col items-center gap-2 text-[#aaa]">
          <div className="w-12 h-12 rounded-full bg-[rgba(52,152,219,0.1)] text-[#3498db] flex items-center justify-center font-bold text-xl">1</div>
          <span className="text-sm mt-1">Crawl Site & Sitemap</span>
        </div>
        <div className="flex flex-col items-center gap-2 text-[#aaa]">
          <div className="w-12 h-12 rounded-full bg-[rgba(46,204,113,0.1)] text-[#2ecc71] flex items-center justify-center font-bold text-xl">2</div>
          <span className="text-sm mt-1">Analyze Competitors</span>
        </div>
        <div className="flex flex-col items-center gap-2 text-[#aaa]">
          <div className="w-12 h-12 rounded-full bg-[rgba(243,156,18,0.1)] text-[#f39c12] flex items-center justify-center font-bold text-xl">3</div>
          <span className="text-sm mt-1">Check Speed & UX</span>
        </div>
        <div className="flex flex-col items-center gap-2 text-[#aaa]">
          <div className="w-12 h-12 rounded-full bg-[rgba(231,76,60,0.1)] text-[#e74c3c] flex items-center justify-center font-bold text-xl">4</div>
          <span className="text-sm mt-1">AI Synthesis</span>
        </div>
      </div>
    </main>
  );
}
