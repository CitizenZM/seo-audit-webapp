import { aiText, extractJson } from '@/lib/ai';
import type { PromptResult } from '@/lib/visibility';
import type { SerpResult } from '@/lib/serp';

/**
 * Citation gap analysis (#2) — from the visibility engine's per-prompt
 * citations, find domains AI models cite repeatedly for the client's
 * category while never citing the client's own domain. That's the digital-PR
 * target list: publications/sites worth pitching because the AI models
 * already trust them for this topic.
 */

export interface CitationGapEntry {
  domain: string;
  count: number;
  citedForTopics: string[];
  outreachAngle: string;
}

export interface CitationGapResult {
  targetDomain: string;
  gaps: CitationGapEntry[];
}

interface CitationGapInput {
  citations: PromptResult[];
  targetDomain: string;
  serpResults?: SerpResult[];
}

function hostOf(domainOrUrl: string): string {
  const s = domainOrUrl.trim();
  if (!s) return '';
  try {
    if (/^https?:\/\//i.test(s)) return new URL(s).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    // fall through to manual strip below
  }
  return s
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split('/')[0];
}

/**
 * Pure ranking function: aggregate citation domains across prompt results,
 * excluding the client's own domain, ranked by citation frequency with the
 * topics each domain was cited under. No AI call — fully unit-testable.
 */
export function rankCitationGaps(
  citations: PromptResult[],
  targetDomain: string,
  serpResults: SerpResult[] = [],
): CitationGapEntry[] {
  const targetHost = hostOf(targetDomain);
  const domainMap = new Map<string, { count: number; topics: Set<string> }>();

  for (const r of citations) {
    const sources = [...(r.citations ?? []), ...(r.citationUrls ?? [])];
    const seenThisPrompt = new Set<string>();
    for (const src of sources) {
      const d = hostOf(src);
      if (!d || !d.includes('.') || d === targetHost || d.endsWith(`.${targetHost}`)) continue;
      if (seenThisPrompt.has(d)) continue;
      seenThisPrompt.add(d);
      const e = domainMap.get(d) ?? { count: 0, topics: new Set<string>() };
      e.count++;
      if (r.topic) e.topics.add(r.topic);
      domainMap.set(d, e);
    }
  }

  // SERP organic results are a secondary signal — domains ranking for the
  // category in real search that AI models also lean on. Folded into the
  // same map (small weight bump, not a separate ranking dimension) so a
  // domain that shows up in both AI citations and SERP still surfaces once.
  for (const serp of serpResults) {
    for (const org of serp.organic ?? []) {
      const d = hostOf(org.domain || org.url);
      if (!d || !d.includes('.') || d === targetHost || d.endsWith(`.${targetHost}`)) continue;
      const e = domainMap.get(d);
      if (e) e.topics.add(serp.query);
    }
  }

  return [...domainMap.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 15)
    .map(([domain, { count, topics }]) => ({
      domain,
      count,
      citedForTopics: [...topics].slice(0, 6),
      outreachAngle: '',
    }));
}

/** AI-polish: turn a bare ranked list into a persuasive one-line outreach angle per domain. Graceful null. */
async function polishOutreachAngles(gaps: CitationGapEntry[], targetDomain: string): Promise<CitationGapEntry[]> {
  if (gaps.length === 0) return gaps;
  const raw = await aiText(
    null,
    `We run "${targetDomain}" and want digital-PR outreach targets. AI assistants (ChatGPT/Gemini/Claude/Perplexity) repeatedly cite these domains when answering questions in our category, but never cite us:\n\n${gaps
      .map((g) => `- ${g.domain} (cited ${g.count}x, topics: ${g.citedForTopics.join(', ') || 'general'})`)
      .join('\n')}\n\nFor each domain, write ONE short, specific outreach angle (why they might feature/link/cite us — e.g. "publishes buying guides in this category, pitch a data-backed comparison"). Respond with ONLY JSON, no prose: {"angles":[{"domain":"...","outreachAngle":"one sentence"}]}`,
    { maxTokens: 3000 },
  );
  if (!raw) return gaps;
  const parsed = extractJson(raw) as { angles?: unknown } | null;
  if (!Array.isArray(parsed?.angles)) return gaps;
  const angleMap = new Map<string, string>();
  for (const a of parsed.angles as unknown[]) {
    const rec = a as Record<string, unknown>;
    if (typeof rec.domain === 'string' && typeof rec.outreachAngle === 'string') {
      angleMap.set(rec.domain.toLowerCase(), rec.outreachAngle);
    }
  }
  return gaps.map((g) => ({ ...g, outreachAngle: angleMap.get(g.domain) || g.outreachAngle }));
}

/**
 * Full citation-gap analysis: rank domains cited in the category where the
 * client is absent, then optionally polish outreach angles with AI (graceful
 * null when no provider is configured — ranking itself is always returned).
 */
export async function analyzeCitationGap(input: CitationGapInput): Promise<CitationGapResult> {
  const ranked = rankCitationGaps(input.citations, input.targetDomain, input.serpResults ?? []);
  const polished = await polishOutreachAngles(ranked, input.targetDomain);
  return { targetDomain: hostOf(input.targetDomain) || input.targetDomain, gaps: polished };
}
