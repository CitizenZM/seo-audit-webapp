'use client';

import { Smile, Meh, Frown } from 'lucide-react';
import Explainer from './Explainer';
import SolutionPanel, { type SectionSolutionData } from './SolutionPanel';

interface Driver { attribute: string; sentiment: 'positive' | 'neutral' | 'negative'; evidence: string }

const sentimentStyle: Record<Driver['sentiment'], { label: string; color: string; soft: string; Icon: typeof Smile }> = {
  positive: { label: 'Positive', color: 'var(--pass)', soft: 'var(--brand-soft)', Icon: Smile },
  neutral: { label: 'Neutral', color: 'var(--ink-3)', soft: 'var(--surface-2)', Icon: Meh },
  negative: { label: 'Negative', color: 'var(--fail)', soft: 'var(--red-soft)', Icon: Frown },
};

/**
 * Sentiment Drivers — the specific attributes driving how AI models talk
 * about the brand, each backed by a quoted evidence line.
 */
export default function SentimentDriversCard({ drivers, solution }: { drivers?: Driver[] | null; solution?: SectionSolutionData | null }) {
  const list = drivers ?? [];

  return (
    <div id="sentiment-drivers" className="card p-4 sm:p-6 scroll-mt-20">
      <h3 className="text-base font-bold text-[var(--ink)] flex items-center gap-2 mb-1">
        <Smile size={18} className="text-[var(--brand)]" /> Perception Drivers
      </h3>
      <Explainer
        what="The specific attributes (price, quality, shipping…) driving how AI assistants describe your brand, with evidence quotes — not just an overall positive/negative score."
        actions={[
          'Fix negative drivers at the source: update product pages/policies, then re-audit.',
          'Amplify positive drivers in your homepage copy and schema so AI answers repeat them.',
        ]}
      />
      <SolutionPanel solution={solution} />
      <p className="text-sm text-[var(--ink-3)] mb-4">
        The specific attributes shaping how AI models describe this brand.
      </p>
      {list.length === 0 ? (
        <p className="text-sm text-[var(--ink-3)]">
          No sentiment driver data in this audit — run a new audit to populate this.
        </p>
      ) : (
      <div className="flex flex-col gap-2">
        {list.map((d, i) => {
          const s = sentimentStyle[d.sentiment] ?? sentimentStyle.neutral;
          const Icon = s.Icon;
          return (
            <div key={i} className="rounded-lg border border-[var(--border)] p-3.5">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold text-[var(--ink)]">{d.attribute}</span>
                <span
                  className="shrink-0 flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-full"
                  style={{ color: s.color, background: s.soft }}
                >
                  <Icon size={12} /> {s.label}
                </span>
              </div>
              {d.evidence && <p className="text-xs text-[var(--ink-3)] mt-2 italic">&ldquo;{d.evidence}&rdquo;</p>}
            </div>
          );
        })}
      </div>
      )}
    </div>
  );
}
