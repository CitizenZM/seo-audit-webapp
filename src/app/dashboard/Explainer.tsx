'use client';

import { useState } from 'react';
import { Info, ChevronDown, Lightbulb } from 'lucide-react';

/**
 * Per-section "What is this / what should I do" block. Rendered directly
 * under a card heading. Collapsed by default to a single line so it never
 * competes with the data; expands to the full explanation + action list.
 */
export default function Explainer({
  what,
  actions,
  defaultOpen = false,
}: {
  /** 1-3 sentence plain-English explanation of what the section shows and how to read it. */
  what: string;
  /** Concrete next-step suggestions, imperative voice. */
  actions: string[];
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="mb-4 rounded-xl bg-[var(--surface-2)] border border-[var(--border)] no-print">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2 px-3.5 py-2.5 text-left"
        aria-expanded={open}
      >
        <Info size={14} className="text-[var(--brand)] shrink-0" />
        <span className="text-xs font-semibold text-[var(--ink-2)] flex-1">
          What is this &amp; what to do
        </span>
        <ChevronDown
          size={14}
          className={`text-[var(--ink-3)] transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div className="px-3.5 pb-3.5 flex flex-col gap-2.5">
          <p className="text-[13px] leading-relaxed text-[var(--ink-2)]">{what}</p>
          {actions.length > 0 && (
            <ul className="flex flex-col gap-1.5">
              {actions.map((a, i) => (
                <li key={i} className="flex items-start gap-2 text-[13px] text-[var(--ink-2)]">
                  <Lightbulb size={13} className="text-[var(--amber)] mt-0.5 shrink-0" />
                  <span>{a}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
