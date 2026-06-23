'use client';

import { CheckCircle2, AlertCircle, AlertTriangle, AlertOctagon } from 'lucide-react';

interface Issue {
  page: string;
  issue: string;
  severity: string;
  fix: string;
}

interface CompetitorData {
  domain: string;
  onPage: { wordCount: number, h1Count: number };
  links: { internalCount: number, externalCount: number, indexedPagesApprox: number };
  technical: { mobileSpeedScore: number };
  cro: { hasCartOrCheckout: boolean, hasReviewsSchema: boolean };
}

export default function OnPageIssuesTable({ issues }: { issues: Issue[] }) {
  if (!issues || issues.length === 0) return null;

  return (
    <div className="mt-8 mb-8">
      <h3 className="text-xl font-bold text-white mb-2">On-Page SEO Issues</h3>
      <p className="text-sm text-[var(--muted)] mb-6">Issues identified via external search signals and platform norms.</p>

      <div className="overflow-x-auto rounded-xl border border-[#2a2a4a] bg-[var(--mid)]">
        <table className="w-full text-sm text-left">
          <thead className="text-[10px] uppercase bg-[rgba(201,168,76,0.1)] text-[var(--gold)] tracking-wider">
            <tr>
              <th className="px-6 py-4">Page / Section</th>
              <th className="px-6 py-4">Issue Discovered</th>
              <th className="px-6 py-4 whitespace-nowrap">Severity</th>
              <th className="px-6 py-4">Recommended Fix</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1e1e3a]">
            {issues.map((issue, idx) => (
              <tr key={idx} className="hover:bg-white/5 transition-colors text-white/90 group">
                <td className="px-6 py-4 font-semibold align-top">{issue.page}</td>
                <td className="px-6 py-4 align-top text-[#ccc]">{issue.issue}</td>
                <td className="px-6 py-4 align-top whitespace-nowrap">
                  <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] uppercase font-bold tracking-wide border 
                    ${issue.severity === 'Critical' ? 'bg-[rgba(231,76,60,0.15)] text-[#e74c3c] border-[#e74c3c]/30' : 
                      issue.severity === 'High' ? 'bg-[rgba(243,156,18,0.15)] text-[#f39c12] border-[#f39c12]/30' : 
                      issue.severity === 'Medium' ? 'bg-[rgba(52,152,219,0.15)] text-[#3498db] border-[#3498db]/30' : 
                      'bg-[rgba(149,165,166,0.15)] text-[#aaa] border-[#aaa]/30'}`}>
                    
                    {issue.severity === 'Critical' && <AlertOctagon size={12}/>}
                    {issue.severity === 'High' && <AlertTriangle size={12}/>}
                    {issue.severity === 'Medium' && <AlertCircle size={12}/>}
                    {issue.severity === 'Low' && <CheckCircle2 size={12}/>}
                    {issue.severity}
                  </div>
                </td>
                <td className="px-6 py-4 align-top text-[#bbb] italic group-hover:text-white transition-colors">{issue.fix}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
