'use client';

import { ShieldCheck, ShieldAlert, ShieldQuestion } from 'lucide-react';
import Explainer from './Explainer';
import SolutionPanel, { type SectionSolutionData } from './SolutionPanel';

interface Claim { claim: string; verdict: 'supported' | 'contradicted' | 'unverifiable'; evidence?: string }

const verdictStyle: Record<Claim['verdict'], { label: string; color: string; soft: string; Icon: typeof ShieldCheck }> = {
  supported: { label: 'Supported', color: 'var(--pass)', soft: 'var(--brand-soft)', Icon: ShieldCheck },
  contradicted: { label: 'Contradicted', color: 'var(--fail)', soft: 'var(--red-soft)', Icon: ShieldAlert },
  unverifiable: { label: 'Unverifiable', color: 'var(--ink-3)', soft: 'var(--surface-2)', Icon: ShieldQuestion },
};

/**
 * Claims Accuracy — what AI models are actually claiming about the brand,
 * fact-checked and verdict-tagged (supported / contradicted / unverifiable).
 */
export default function ClaimsAccuracyCard({ claims, solution }: { claims?: { claims: Claim[] } | null; solution?: SectionSolutionData | null }) {
  const list = claims?.claims ?? [];

  const contradicted = list.filter((c) => c.verdict === 'contradicted').length;

  return (
    <div id="claims-accuracy" className="card p-4 sm:p-6 scroll-mt-20">
      <div className="flex items-start justify-between flex-wrap gap-3 mb-4">
        <div>
          <h3 className="text-base font-bold text-[var(--ink)] flex items-center gap-2">
            <ShieldCheck size={18} className="text-[var(--brand)]" /> Claims Accuracy
          </h3>
          <p className="text-sm text-[var(--ink-3)] mt-0.5">Fact-check of what AI models say about this brand.</p>
        </div>
        {contradicted > 0 && (
          <span className="text-xs font-semibold px-3 py-1 rounded-full bg-[var(--red-soft)] text-[var(--red)]">
            {contradicted} contradicted claim{contradicted === 1 ? '' : 's'} found
          </span>
        )}
      </div>
      <Explainer
        what="Factual claims AI assistants make about your brand, checked against your actual site. 'Contradicted' means AI is telling customers something that's wrong."
        actions={[
          'Correct contradicted claims by publishing the accurate fact prominently (FAQ, About page, llms.txt).',
          'For unverifiable claims, add the missing fact to your site so AI can ground it.',
        ]}
      />
      <SolutionPanel solution={solution} />
      {list.length === 0 ? (
        <p className="text-sm text-[var(--ink-3)]">
          No claims accuracy data in this audit — run a new audit to populate this.
        </p>
      ) : (
      <div className="flex flex-col gap-2">
        {list.map((c, i) => {
          const v = verdictStyle[c.verdict] ?? verdictStyle.unverifiable;
          const Icon = v.Icon;
          return (
            <div key={i} className="rounded-lg border border-[var(--border)] p-3.5">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm text-[var(--ink)] font-medium">{c.claim}</p>
                <span
                  className="shrink-0 flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full"
                  style={{ color: v.color, background: v.soft }}
                >
                  <Icon size={12} /> {v.label}
                </span>
              </div>
              {c.evidence && <p className="text-xs text-[var(--ink-3)] mt-2 italic">&ldquo;{c.evidence}&rdquo;</p>}
            </div>
          );
        })}
      </div>
      )}
    </div>
  );
}
