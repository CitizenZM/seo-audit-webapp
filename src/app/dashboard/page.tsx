'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { AlertCircle, CheckCircle2, XCircle, LayoutDashboard, Globe, Zap, Target } from 'lucide-react';
import ActionPlanBoard from './ActionPlanBoard';
import RadarChart from './RadarChart';
import TitleTagsOptimizer from './TitleTagsOptimizer';
import ContentBriefs from './ContentBriefs';
import ContentCalendar from './ContentCalendar';
import KeywordIntentChart from './KeywordIntentChart';
import KeywordTable from './KeywordTable';
import CompetitorGapTable from './CompetitorGapTable';

function DashboardContent() {
  const searchParams = useSearchParams();
  const targetUrl = searchParams.get('url');
  const competitorsParam = searchParams.get('competitors');
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [data, setData] = useState<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [competitors, setCompetitors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!targetUrl) return;
    
    let apiUrl = `/api/analyze?url=${encodeURIComponent(targetUrl)}`;
    if (competitorsParam) apiUrl += `&competitors=${encodeURIComponent(competitorsParam)}`;

    fetch(apiUrl)
      .then(res => res.json())
      .then(res => {
        if (res.error) throw new Error(res.error);
        setData(res.data);
        setCompetitors(res.competitors || []);
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [targetUrl, competitorsParam]);

  if (!targetUrl) {
    return <div className="p-10 text-center text-red-400">No URL provided</div>;
  }

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 pb-32">
        <div className="w-16 h-16 border-4 border-[rgba(201,168,76,0.2)] border-t-[var(--gold)] rounded-full animate-spin mb-6"></div>
        <h2 className="text-xl font-bold text-[var(--gold)] animate-pulse">Running Analysis Engine...</h2>
        <p className="text-[#aaa] mt-2">Crawling {targetUrl}</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6">
        <div className="bg-[#e74c3c]/10 text-[#e74c3c] border border-[#e74c3c]/30 p-6 rounded-lg flex items-center gap-4 max-w-lg">
          <XCircle size={32} />
          <div>
            <h3 className="font-bold text-lg">Analysis Failed</h3>
            <p className="text-sm opacity-80">{error || 'Unknown error occurred'}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <nav className="sticky top-0 z-50 bg-[var(--mid)] border-b-2 border-[var(--gold)] px-8 py-4 flex justify-between items-center shadow-lg">
        <div className="font-bold text-[var(--gold)] flex items-center gap-2 tracking-wide text-lg">
          <LayoutDashboard size={20} />
          SEO REPORT 2026
        </div>
        <div className="text-[var(--muted)] text-sm">{data.domain}</div>
      </nav>

      {/* Hero Header */}
      <section className="bg-gradient-to-br from-[#1a1a2e] to-[#0f3460] border-b border-[#222] pt-12 pb-10 px-8">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-3xl font-extrabold text-[var(--gold)] mb-2">Full SEO Audit & Action Plan</h1>
          <p className="text-[var(--muted)] text-sm mb-8 flex items-center gap-2">
            <Globe size={14} /> {data.url}
          </p>

          <div className="flex flex-wrap gap-5">
            <div className="bg-white/5 border border-[rgba(201,168,76,0.3)] rounded-xl py-5 px-6 min-w-[160px] backdrop-blur-sm">
              <div className="text-[10px] text-[var(--muted)] uppercase tracking-wider font-bold mb-1">On-Page Links</div>
              <div className="text-3xl font-black text-[var(--gold)]">{data.links.internalCount + data.links.externalCount}</div>
            </div>
            <div className="bg-white/5 border border-[rgba(201,168,76,0.3)] rounded-xl py-5 px-6 min-w-[160px] backdrop-blur-sm">
              <div className="text-[10px] text-[var(--muted)] uppercase tracking-wider font-bold mb-1">Words Content</div>
              <div className="text-3xl font-black text-[var(--gold)]">{data.onPage.wordCount}</div>
            </div>
            <div className="bg-white/5 border border-[rgba(201,168,76,0.3)] rounded-xl py-5 px-6 min-w-[160px] backdrop-blur-sm">
              <div className="text-[10px] text-[var(--muted)] uppercase tracking-wider font-bold mb-1">H1 Tags</div>
              <div className="text-3xl font-black text-[var(--gold)]">{data.onPage.h1Count}</div>
            </div>
          </div>
        </div>
      </section>

      {/* Executive Summary from AI Synthesis */}
      {data.synthesis && (
        <section className="py-8 px-8 bg-[#1a1a2e] border-b border-[#222]">
           <div className="max-w-6xl mx-auto">
             <div className="bg-[rgba(201,168,76,0.08)] border border-[rgba(201,168,76,0.3)] rounded-xl p-6 mb-6">
                <h2 className="text-xl font-bold text-[var(--gold)] mb-3">Executive Summary</h2>
                <p className="text-[#ddd] text-[0.95rem] leading-relaxed">{data.synthesis.executiveSummary}</p>
             </div>
             
             <div className="bg-[rgba(231,76,60,0.1)] border border-[rgba(231,76,60,0.3)] rounded-xl p-5 mb-8">
                <div className="text-[10px] text-[var(--red)] uppercase tracking-wider font-bold mb-1 flex items-center gap-2"><Target size={14}/> Top Priority Action</div>
                <p className="text-white font-semibold text-lg">{data.synthesis.topPriority}</p>
             </div>

             {/* SEO Health Radar Chart overlaying Hero section */}
             {data.synthesis.topCategoryScores && (
               <div className="bg-[var(--mid)] border border-[#2a2a4a] rounded-xl p-8 mb-8 max-w-lg mx-auto">
                 <h3 className="text-lg font-bold text-center text-[var(--gold)] mb-4">SEO Health by Category</h3>
                 <RadarChart scores={data.synthesis.topCategoryScores} />
               </div>
             )}

             <h3 className="text-lg font-bold text-white mb-4">Content Gap Recommendation</h3>
             {data.synthesis.contentGapBrief && (
               <div className="bg-[var(--mid)] border border-[#2a2a4a] rounded-xl p-6 mb-8">
                 <div className="mb-4">
                   <span className="bg-[rgba(52,152,219,0.15)] text-[#3498db] border border-[rgba(52,152,219,0.3)] text-xs px-3 py-1 rounded-full uppercase font-bold tracking-wide">Suggested Post</span>
                   <h4 className="text-xl font-bold text-white mt-3">{data.synthesis.contentGapBrief.title}</h4>
                   <p className="text-[#aaa] text-sm italic mt-1">{data.synthesis.contentGapBrief.rationale}</p>
                 </div>
                 <div className="bg-black/20 border-l-2 border-[var(--gold)] p-4 rounded-r-lg">
                   <h6 className="text-xs uppercase text-[var(--gold)] font-bold mb-2">Suggested Outline:</h6>
                   <ul className="list-none space-y-2">
                     {data.synthesis.contentGapBrief.outline?.map((h2: string, idx: number) => (
                       <li key={idx} className="text-sm text-[#ddd] flex items-center gap-2">
                         <span className="text-[var(--gold)] text-lg leading-none">→</span> {h2}
                       </li>
                     ))}
                   </ul>
                 </div>
               </div>
             )}

             {/* Render the full Content Briefs Array from AI */}
             <ContentBriefs briefs={data.synthesis.contentBriefs} />
           </div>
        </section>
      )}

      {/* Main Content Grid */}
      <section className="py-12 px-8">
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6">
          
          {/* Technical Health */}
          <div className="bg-[var(--mid)] border border-[#2a2a4a] rounded-xl p-6">
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <Zap size={18} className="text-[var(--blue)]" /> Technical & Performance
            </h3>
            <div className="flex flex-col gap-3">
              <div className="flex justify-between items-center py-2 border-b border-[#2a2a4a]">
                <span className="text-sm text-[#ddd]">Lighthouse Mobile Speed</span>
                <span className={`text-sm font-bold ${data.technical.mobileSpeedScore > 80 ? 'text-[var(--pass)]' : data.technical.mobileSpeedScore > 50 ? 'text-[var(--warn)]' : 'text-[var(--fail)]'}`}>
                   {data.technical.mobileSpeedScore} / 100
                </span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-[#2a2a4a]">
                <span className="text-sm text-[#ddd]">HTTPS Secure</span>
                {data.technical.isHttps ? <CheckCircle2 size={18} className="text-[var(--pass)]" /> : <XCircle size={18} className="text-[var(--fail)]" />}
              </div>
              <div className="flex justify-between items-center py-2 border-b border-[#2a2a4a]">
                <span className="text-sm text-[#ddd]">Robots.txt Present</span>
                {data.technical.hasRobotsTxt ? <CheckCircle2 size={18} className="text-[var(--pass)]" /> : <AlertCircle size={18} className="text-[var(--warn)]" />}
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="text-sm text-[#ddd]">Sitemap.xml Found</span>
                {data.technical.hasSitemapXml ? <CheckCircle2 size={18} className="text-[var(--pass)]" /> : <AlertCircle size={18} className="text-[var(--warn)]" />}
              </div>
            </div>
          </div>

          {/* CRO Signals */}
          <div className="bg-[var(--mid)] border border-[#2a2a4a] rounded-xl p-6">
            <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <Target size={18} className="text-[var(--accent)]" /> CRO / UX Signals
            </h3>
            <div className="flex flex-col gap-3">
              <div className="flex justify-between items-center py-2 border-b border-[#2a2a4a]">
                <span className="text-sm text-[#ddd]">Cart / Checkout Detected</span>
                {data.cro.hasCartOrCheckout ? <CheckCircle2 size={18} className="text-[var(--pass)]" /> : <span className="text-xs text-[var(--muted)] px-2 py-1 bg-white/5 rounded">Not Found/Unknown</span>}
              </div>
              <div className="flex justify-between items-center py-2 border-b border-[#2a2a4a]">
                <span className="text-sm text-[#ddd]">Review / Rating Schema</span>
                {data.cro.hasReviewsSchema ? <CheckCircle2 size={18} className="text-[var(--pass)]" /> : <XCircle size={18} className="text-[var(--fail)]" />}
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="text-sm text-[#ddd]">Image Alt Tag Coverage</span>
                <span className="text-sm font-mono text-[var(--gold)]">{data.onPage.imageAltCoverage}</span>
              </div>
            </div>
          </div>

          {/* Keyword Opportunities */}
          {data.synthesis?.keywordOpportunities && (
            <div className="md:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-6 mt-4">
              <div className="md:col-span-1">
                 <KeywordIntentChart keywords={data.synthesis.keywordOpportunities} />
              </div>
              <div className="md:col-span-2">
                 <KeywordTable keywords={data.synthesis.keywordOpportunities} />
              </div>
            </div>
          )}

          {/* Competitor Gap Analysis */}
          {competitors.length > 0 && (
            <div className="md:col-span-2">
               <CompetitorGapTable targetDomain={data.domain} targetData={data} competitors={competitors} />
            </div>
          )}

          {/* On-Page Snapshot */}
          <div className="md:col-span-2 bg-[var(--mid)] border border-[#2a2a4a] rounded-xl p-6 mt-4">
            <h3 className="text-lg font-bold text-white mb-6">Current Title Tag Snapshot</h3>
            
            <div className="bg-[#1a1a2e] border border-[rgba(201,168,76,0.3)] rounded-lg p-5 mb-4">
              <div className="text-[10px] text-[var(--gold)] uppercase tracking-wider font-bold mb-2">Current Title Tag</div>
              <div className="text-md text-[#3498db] font-semibold mb-1">{data.onPage.title || 'Missing Title'}</div>
              <div className={`text-xs ${data.onPage.titleLength > 60 ? 'text-[var(--warn)]' : 'text-[var(--pass)]'}`}>
                {data.onPage.titleLength} characters {data.onPage.titleLength > 60 ? '(Too Long)' : '(Optimal)'}
              </div>
            </div>

            <div className="bg-[#1a1a2e] border border-[#2a2a4a] rounded-lg p-5">
              <div className="text-[10px] text-[var(--muted)] uppercase tracking-wider font-bold mb-2">Current Meta Description</div>
              <div className="text-sm text-[#bbb] italic mb-1">{data.onPage.metaDescription || 'No Meta Description Found'}</div>
              <div className={`text-xs ${data.onPage.metaDescLength < 120 || data.onPage.metaDescLength > 160 ? 'text-[var(--warn)]' : 'text-[var(--pass)]'}`}>
                {data.onPage.metaDescLength} chars (Recommended: 120-160)
              </div>
            </div>
          </div>

          <div className="md:col-span-2">
            {/* The Detailed Title Tags Component from AI generator */}
            <TitleTagsOptimizer titleTags={data.synthesis.titleTags} />
          </div>

        </div>

        {/* Action Plan Board & Content Calendar - Full Width Bottom */}
        <div className="max-w-6xl mx-auto mt-8">
           <ContentCalendar calendar={data.synthesis.contentCalendar} />
           <ActionPlanBoard data={data} />
        </div>
      </section>
    </div>
  );
}

export default function Dashboard() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-[var(--gold)]">Loading...</div>}>
      <DashboardContent />
    </Suspense>
  );
}
