'use client';

import { CheckCircle2, AlertCircle, AlertTriangle, AlertOctagon } from 'lucide-react';

interface Issue {
  page: string;
  issue: string;
  severity: string;
  fix: string;
}

export default function OnPageIssuesTable({ issues }: { issues: Issue[] }) {
  if (!issues || issues.length === 0) return null;

  return (
    <div className="mt-8 mb-8">
      <h3 className="text-lg sm:text-xl font-bold text-[var(--ink)] mb-2">On-Page SEO Issues</h3>
      <p className="text-sm text-[var(--muted)] mb-6">Issues identified via external search signals and platform norms.</p>

      <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-[var(--mid)]">
        <table className="w-full text-sm text-left">
          <thead className="text-[10px] uppercase bg-[var(--surface-2)] text-[var(--ink-3)] tracking-wider">
            <tr>
              <th className="px-4 sm:px-6 py-3 sm:py-4">Page / Section</th>
              <th className="px-4 sm:px-6 py-3 sm:py-4">Issue Discovered</th>
              <th className="px-4 sm:px-6 py-3 sm:py-4 whitespace-nowrap">Severity</th>
              <th className="px-4 sm:px-6 py-3 sm:py-4">Recommended Fix</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border)]">
            {issues.map((issue, idx) => (
              <tr key={idx} className="hover:bg-[var(--surface-2)] transition-colors text-[var(--ink)]/90 group">
                <td className="px-4 sm:px-6 py-3 sm:py-4 font-semibold align-top">{issue.page}</td>
                <td className="px-4 sm:px-6 py-3 sm:py-4 align-top text-[var(--ink-2)]">{issue.issue}</td>
                <td className="px-4 sm:px-6 py-3 sm:py-4 align-top whitespace-nowrap">
                  <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] uppercase font-bold tracking-wide border 
                    ${issue.severity === 'Critical' ? 'bg-[rgba(231,76,60,0.15)] text-[#e74c3c] border-[#e74c3c]/30' : 
                      issue.severity === 'High' ? 'bg-[rgba(243,156,18,0.15)] text-[#f39c12] border-[#f39c12]/30' : 
                      issue.severity === 'Medium' ? 'bg-[rgba(52,152,219,0.15)] text-[var(--blue)] border-[#3498db]/30' : 
                      'bg-[rgba(149,165,166,0.15)] text-[var(--ink-3)] border-[#aaa]/30'}`}>
                    
                    {issue.severity === 'Critical' && <AlertOctagon size={12}/>}
                    {issue.severity === 'High' && <AlertTriangle size={12}/>}
                    {issue.severity === 'Medium' && <AlertCircle size={12}/>}
                    {issue.severity === 'Low' && <CheckCircle2 size={12}/>}
                    {issue.severity}
                  </div>
                </td>
                <td className="px-4 sm:px-6 py-3 sm:py-4 align-top text-[var(--ink-2)] italic group-hover:text-[var(--ink)] transition-colors">{issue.fix}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
