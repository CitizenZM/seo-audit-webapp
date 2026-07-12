'use client';

import { useState } from 'react';
import { ClipboardList, Loader2, CheckCircle2 } from 'lucide-react';
import type { ActionProposal } from '@/lib/actionProposal';

const FUNNEL_TONE: Record<string, { bg: string; text: string }> = {
  Awareness: { bg: 'var(--blue-soft)', text: 'var(--blue)' },
  Consideration: { bg: 'var(--amber-soft)', text: 'var(--amber)' },
  Decision: { bg: 'var(--brand-soft)', text: 'var(--brand-ink)' },
};

function FunnelPill({ stage }: { stage: string }) {
  const tone = FUNNEL_TONE[stage] ?? { bg: 'var(--surface-2)', text: 'var(--ink-3)' };
  return (
    <span
      className="text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full"
      style={{ background: tone.bg, color: tone.text }}
    >
      {stage}
    </span>
  );
}

export default function ActionProposalCard({ auditId, initialProposal }: { auditId: string; initialProposal: ActionProposal | null }) {
  const [proposal, setProposal] = useState<ActionProposal | null>(initialProposal);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [error, setError] = useState('');

  async function handleGenerate() {
    setStatus('loading');
    setError('');
    try {
      const res = await fetch(`/api/audits/${auditId}/proposal`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to generate proposal');
      setProposal(json.proposal);
      setStatus('idle');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate proposal');
      setStatus('error');
    }
  }

  if (!proposal) {
    return (
      <div id="action-proposal" className="card p-6 scroll-mt-20">
        <h3 className="text-base font-bold text-[var(--ink)] flex items-center gap-2">
          <ClipboardList size={18} className="text-[var(--brand)]" /> Systematic Action Plan Proposal
        </h3>
        <p className="text-sm text-[var(--ink-2)] mt-2 max-w-2xl">
          Generates a full on-site technical SEO/GEO setup and workflow roadmap, plus an off-site backlink, keyword, and channel strategy tailored to this audit&apos;s findings.
        </p>
        <button
          type="button"
          className="no-print mt-4 inline-flex items-center gap-2 h-10 px-4 rounded-lg text-white font-semibold text-sm disabled:opacity-70"
          style={{ background: 'var(--grad-brand)' }}
          onClick={handleGenerate}
          disabled={status === 'loading'}
        >
          {status === 'loading' && <Loader2 size={16} className="animate-spin" />}
          {status === 'loading' ? 'Generating…' : 'Generate Action Plan Proposal'}
        </button>
        {status === 'error' && <p className="mt-2 text-sm text-[var(--fail)]">{error}</p>}
      </div>
    );
  }

  return (
    <div id="action-proposal" className="card p-6 scroll-mt-20">
      {/* Header */}
      <div>
        <h3 className="text-base font-bold text-[var(--ink)] flex items-center gap-2">
          <ClipboardList size={18} className="text-[var(--brand)]" /> Systematic Action Plan Proposal
        </h3>
        <p className="text-sm text-[var(--ink-2)] mt-0.5 max-w-3xl">{proposal.overview}</p>
      </div>

      {/* On-site: technical setup */}
      <div className="mt-6">
        <div className="text-xs uppercase tracking-wider font-semibold text-[var(--ink-3)] mb-3">On-Site · Technical SEO &amp; GEO Setup</div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {proposal.onSite.technicalSetup.map((item, i) => (
            <div key={i} className="rounded-xl border border-[var(--border)] p-4">
              <div className="text-sm font-bold text-[var(--ink)]">{item.area}</div>
              <div className="text-xs text-[var(--ink-3)] mt-0.5">{item.rationale}</div>
              <ol className="mt-2 list-decimal list-inside text-sm text-[var(--ink-2)] marker:text-[var(--brand)] flex flex-col gap-1">
                {item.steps.map((s, j) => (
                  <li key={j}>{s}</li>
                ))}
              </ol>
              {item.snippet && (
                <pre className="mt-2 text-[11px] leading-relaxed bg-[#14151a] text-[#e5e7eb] rounded-lg p-3 overflow-x-auto whitespace-pre-wrap">
                  {item.snippet}
                </pre>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* On-site: workflow roadmap */}
      <div className="mt-6">
        <div className="text-xs uppercase tracking-wider font-semibold text-[var(--ink-3)] mb-3">On-Site · Workflow Roadmap</div>
        <div className="flex flex-col">
          {proposal.onSite.workflowRoadmap.map((phase, i) => {
            const isLast = i === proposal.onSite.workflowRoadmap.length - 1;
            return (
              <div key={i} className="flex gap-4">
                <div className="flex flex-col items-center">
                  <div className="w-7 h-7 rounded-full bg-[var(--brand-soft)] text-[var(--brand-ink)] text-xs font-bold flex items-center justify-center shrink-0">
                    {i + 1}
                  </div>
                  {!isLast && <div className="w-px flex-1 bg-[var(--border)] my-1" />}
                </div>
                <div className={isLast ? 'pb-0' : 'pb-5'}>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-bold text-[var(--ink)] text-sm">{phase.phase}</span>
                    <span className="text-[10px] uppercase bg-[var(--surface-2)] border border-[var(--border)] rounded-full px-2 py-0.5 text-[var(--ink-3)]">
                      {phase.timeframe}
                    </span>
                  </div>
                  <p className="text-sm text-[var(--ink-2)] mt-1">{phase.focus}</p>
                  <ul className="mt-2 flex flex-col gap-1">
                    {phase.tasks.map((t, j) => (
                      <li key={j} className="flex items-start gap-2 text-sm text-[var(--ink-2)]">
                        <CheckCircle2 size={13} className="text-[var(--brand)] mt-0.5 shrink-0" /> {t}
                      </li>
                    ))}
                  </ul>
                  <div className="text-xs font-medium text-[var(--brand-ink)] mt-2">Deliverable: {phase.deliverable}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Off-site: backlink strategy */}
      <div className="mt-6">
        <div className="text-xs uppercase tracking-wider font-semibold text-[var(--ink-3)] mb-3">Off-Site · Backlink Strategy</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {proposal.offSite.backlinkTactics.map((t, i) => (
            <div key={i} className="rounded-xl border border-[var(--border)] p-4">
              <div className="font-bold text-sm text-[var(--ink)]">{t.tactic}</div>
              <p className="text-sm text-[var(--ink-2)] mt-1">{t.description}</p>
              <div className="flex flex-wrap gap-1.5 mt-2">
                {t.targetSites.map((site, j) => (
                  <span key={j} className="text-xs px-2 py-0.5 rounded-full bg-[var(--blue-soft)] text-[var(--blue)]">
                    {site}
                  </span>
                ))}
              </div>
              <div className="text-xs text-[var(--ink-3)] mt-2">KPI: {t.kpi}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Off-site: GEO keywords */}
      <div className="mt-6">
        <div className="text-xs uppercase tracking-wider font-semibold text-[var(--ink-3)] mb-3">Off-Site · GEO Keywords to Own</div>
        <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
          <table className="w-full text-left text-sm">
            <thead className="bg-[var(--surface-2)] text-[var(--ink-3)] uppercase tracking-wider text-xs">
              <tr>
                <th className="px-4 py-3">Keyword</th>
                <th className="px-4 py-3">Intent</th>
                <th className="px-4 py-3">Funnel Stage</th>
                <th className="px-4 py-3">Rationale</th>
              </tr>
            </thead>
            <tbody>
              {proposal.offSite.geoKeywords.map((k, i) => (
                <tr key={i} className="border-b border-[var(--border)] last:border-b-0">
                  <td className="px-4 py-3 font-medium text-[var(--ink)]">{k.keyword}</td>
                  <td className="px-4 py-3 text-[var(--ink-2)]">{k.intent}</td>
                  <td className="px-4 py-3">
                    <FunnelPill stage={k.funnelStage} />
                  </td>
                  <td className="px-4 py-3 text-[var(--ink-2)] text-sm">{k.rationale}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Off-site: channel targets */}
      <div className="mt-6">
        <div className="text-xs uppercase tracking-wider font-semibold text-[var(--ink-3)] mb-3">Off-Site · Funnels &amp; Content Channels</div>
        <div className="flex flex-col gap-3">
          {proposal.offSite.channelTargets.map((c, i) => (
            <div key={i} className="rounded-xl border border-[var(--border)] p-4">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-[var(--ink)]">{c.channel}</span>
                <span className="text-[10px] uppercase px-2 py-0.5 rounded-full bg-[var(--surface-2)] border border-[var(--border)] text-[var(--ink-3)]">{c.type}</span>
                <FunnelPill stage={c.funnelStage} />
              </div>
              <p className="text-sm text-[var(--ink-2)] mt-1">{c.action}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
