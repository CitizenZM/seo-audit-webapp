'use client';

import { AlertCircle, AlertTriangle, CheckCircle2, AlertOctagon } from 'lucide-react';
import OnPageIssuesTable from './OnPageIssuesTable';

export default function ActionPlanBoard({ data }: { data: any }) {
  if (!data) return null;

  const actions = [];
  const issuesList = [];
  
  // 1. Technical actions
  if (!data.technical.isHttps) actions.push({ priority: 'Critical', text: 'Migrate site to HTTPS immediately to prevent security warnings and ranking penalties.', type: 'tech' });
  if (!data.technical.hasSitemapXml) {
    actions.push({ priority: 'High', text: 'Generate and submit an XML Sitemap to Google Search Console to improve indexation.', type: 'tech' });
    issuesList.push({ page: 'Global', issue: 'Missing sitemap.xml', severity: 'High', fix: 'Generate and submit an XML sitemap to Google Search Console.' });
  }
  if (data.technical.mobileSpeedScore < 60) {
    actions.push({ priority: 'High', text: `Optimize Core Web Vitals (Current Score: ${data.technical.mobileSpeedScore}/100) by compressing images and reducing unused JS/CSS.`, type: 'tech' });
    issuesList.push({ page: 'Global (Mobile)', issue: `Slow Mobile Load Speed (${data.technical.mobileSpeedScore}/100)`, severity: 'Critical', fix: 'Compress images, defer offscreen assets, minimize blocking scripts.' });
  }
  if (!data.technical.hasRobotsTxt) {
    issuesList.push({ page: 'Global', issue: 'Missing robots.txt', severity: 'Medium', fix: 'Generate a standard robots.txt file to guide crawlers.' });
  }

  // 2. On-Page / Content actions
  if (data.onPage.titleLength > 60) {
    actions.push({ priority: 'Medium', text: 'Trim homepage Title Tag to < 60 characters to prevent truncation in SERPs.', type: 'content' });
    issuesList.push({ page: 'Homepage', issue: 'Title Tag too long (> 60 chars)', severity: 'Low', fix: 'Trim title tag to prevent SERP truncation.' });
  }
  if (data.onPage.metaDescLength < 120 || data.onPage.metaDescLength > 160) actions.push({ priority: 'Medium', text: 'Rewrite Meta Description to be between 120-160 characters for optimal click-through rates.', type: 'content' });
  if (data.onPage.h1Count === 0) {
    actions.push({ priority: 'High', text: 'Add a descriptive H1 tag to the homepage for keyword relevance.', type: 'content' });
    issuesList.push({ page: 'Homepage', issue: 'Missing H1 Tag', severity: 'Critical', fix: 'Wrap primary keyword heading in an H1 tag.' });
  }
  else if (data.onPage.h1Count > 1) actions.push({ priority: 'Medium', text: 'Multiple H1 tags found. Consolidate to a single Primary H1 to establish clear page hierarchy.', type: 'content' });

  // 3. AI / CRO Actions
  if (!data.cro.hasReviewsSchema) {
    actions.push({ priority: 'High', text: 'Implement AggregateRating Schema markup to display review stars in search results.', type: 'cro' });
    issuesList.push({ page: 'Product Pages', issue: 'Missing AggregateRating Schema', severity: 'High', fix: 'Install JSON-LD schema to surface review stars in search results.' });
  }
  if (data.synthesis?.contentGapBrief) actions.push({ priority: 'Strategic', text: `Publish a new comprehensive pillar page: "${data.synthesis.contentGapBrief.title}" to target identified topic gaps.`, type: 'content' });

  const quickWins = actions.filter(a => a.priority === 'Critical' || a.priority === 'High').slice(0, 6);
  const strategic = actions.filter(a => a.priority !== 'Critical').slice(0, 6);

  return (
    <div className="bg-[var(--mid)] border border-[#2a2a4a] rounded-xl overflow-hidden mt-6 mb-12">
      
      {/* 1. On-Page Issues Table View */}
      <div className="px-6 border-b border-[#2a2a4a]">
         <OnPageIssuesTable issues={issuesList} />
      </div>

      <div className="p-6 border-b border-[#2a2a4a] flex justify-between items-center bg-[rgba(201,168,76,0.05)]">
        <div>
           <h3 className="text-xl font-bold text-[var(--gold)] flex items-center gap-2">
             <AlertOctagon size={20} /> Prioritized Action Plan
           </h3>
           <p className="text-sm text-[var(--muted)] mt-1">Consolidated checklist derived from Technical, On-Page, and Content Gap analyses.</p>
        </div>
      </div>
      
      <div className="p-0">
        {actions.length === 0 ? (
           <div className="p-8 text-center text-[var(--pass)] font-bold">Incredible! No immediate technical or on-page issues detected!</div>
        ) : (
           <ul className="divide-y divide-[#1e1e3a]">
             {actions.sort((a,b) => {
               const pMap:any = { 'Critical': 4, 'High': 3, 'Strategic': 2, 'Medium': 1 };
               return pMap[b.priority] - pMap[a.priority];
             }).map((action, idx) => (
               <li key={idx} className="p-5 flex items-start gap-4 hover:bg-white/5 transition-colors group">
                 <div className="mt-1">
                   {action.priority === 'Critical' && <AlertCircle className="text-[var(--fail)]" size={20}/>}
                   {action.priority === 'High' && <AlertTriangle className="text-[var(--warn)]" size={20}/>}
                   {action.priority === 'Medium' && <CheckCircle2 className="text-[var(--blue)]" size={20}/>}
                   {action.priority === 'Strategic' && <CheckCircle2 className="text-[var(--gold)]" size={20}/>}
                 </div>
                 <div className="flex-1">
                   <div className="flex items-center gap-3 mb-1">
                     <span className={`text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded border 
                        ${action.priority === 'Critical' ? 'bg-[rgba(231,76,60,0.1)] text-[#e74c3c] border-[#e74c3c]/30' : 
                          action.priority === 'High' ? 'bg-[rgba(243,156,18,0.1)] text-[#f39c12] border-[#f39c12]/30' : 
                          action.priority === 'Strategic' ? 'bg-[rgba(201,168,76,0.1)] text-[#C9A84C] border-[#C9A84C]/30' : 
                          'bg-[rgba(52,152,219,0.1)] text-[#3498db] border-[#3498db]/30'}`}>
                       {action.priority}
                     </span>
                     <span className="text-xs text-[var(--muted)] capitalize">{action.type}</span>
                   </div>
                   <p className="text-md text-white group-hover:text-[var(--gold)] transition-colors">{action.text}</p>
                 </div>
               </li>
             ))}
           </ul>
        )}
      </div>
    </div>
  );
}
