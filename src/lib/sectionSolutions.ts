import { z } from 'zod';
import { aiText, extractJson } from './ai';

/**
 * Per-section solution engine.
 *
 * For every analysis section of the dashboard, generate — from that section's
 * ACTUAL findings in this audit, not generic advice — a diagnosed problem
 * list, prioritized solutions with concrete steps, and a Now / 30 days /
 * 90 days roadmap. Rendered by SolutionPanel.tsx inside each card.
 *
 * Cost design: exactly two AI calls per audit (AI-visibility sections and
 * SEO/GEO sections), each with tight item caps so Gemini's verbosity can't
 * hit token-truncation (the failure mode we've been bitten by twice).
 */

export const SolutionSchema = z.object({
  title: z.string(),
  steps: z.array(z.string()).min(1).max(4),
  effort: z.enum(['low', 'medium', 'high']),
  impact: z.enum(['low', 'medium', 'high']),
});

export const SectionSolutionSchema = z.object({
  problems: z.array(z.string()).min(1).max(3),
  solutions: z.array(SolutionSchema).min(1).max(3),
  roadmap: z
    .array(
      z.object({
        phase: z.enum(['Now', '30 days', '90 days']),
        focus: z.string(),
      }),
    )
    .min(1)
    .max(3),
});

export type SectionSolution = z.infer<typeof SectionSolutionSchema>;
export type SectionSolutions = Record<string, SectionSolution>;

/** Section ids covered by each of the two generation calls. */
export const AI_SECTIONS = [
  'visibility',
  'persona-heatmap',
  'sentiment-drivers',
  'claims-accuracy',
  'citations',
  'citation-gap',
] as const;

export const SEO_SECTIONS = [
  'geo',
  'commerce-readiness',
  'technical',
  'keywords',
  'competitors',
  'content',
] as const;

const BatchSchema = (keys: readonly string[]) =>
  z.object(Object.fromEntries(keys.map((k) => [k, SectionSolutionSchema.optional()])));

export interface SectionSolutionsInput {
  domain: string;
  category?: string;
  // Compact findings per section — pass only what exists; sections with no
  // findings are skipped by the model (schema keys optional).
  findings: Partial<Record<(typeof AI_SECTIONS)[number] | (typeof SEO_SECTIONS)[number], string>>;
}

/**
 * Compact an audit result into per-section finding strings. Pure — unit
 * tested. Sections with nothing to say are omitted so prompt stays small.
 */
export function buildFindings(data: {
  domain: string;
  visibility?: {
    visibilityPct: number;
    totalPrompts: number;
    targetBrand: string;
    leaderboard?: { brand: string; visibilityPct: number; isYou: boolean }[];
    perception?: { drivers?: { attribute: string; sentiment: string; evidence: string }[] } | null;
    citations?: { domain: string; count: number }[];
  } | null;
  visibilityExtras?: {
    heatmap?: { cells?: { persona: string; topic: string; visibilityPct: number }[] } | null;
    citationGap?: { gaps?: { domain: string; count: number; outreachAngle?: string }[] } | null;
    claims?: { claims?: { claim: string; verdict: string }[] } | null;
  } | null;
  geo?: {
    score?: number;
    recommendations?: string[];
    commerce?: { score: number; checks: { label: string; passed: boolean; impact: string }[] };
  } | null;
  technicalIssues?: string[];
  onPageIssues?: string[];
  synthesis?: {
    keywordOpportunities?: { keyword: string; intent?: string }[];
    contentGapBrief?: { title: string } | null;
  } | null;
  competitors?: { domain: string; wordCount?: number }[];
}): SectionSolutionsInput['findings'] {
  const f: SectionSolutionsInput['findings'] = {};
  const v = data.visibility;
  if (v) {
    const rivals = (v.leaderboard ?? [])
      .filter((l) => !l.isYou)
      .slice(0, 4)
      .map((l) => `${l.brand} ${l.visibilityPct}%`)
      .join(', ');
    f.visibility = `Brand "${v.targetBrand}" visible in ${v.visibilityPct}% of ${v.totalPrompts} AI answers. Rivals: ${rivals || 'none seen'}.`;
  }
  const cells = data.visibilityExtras?.heatmap?.cells ?? [];
  if (cells.length) {
    const weak = [...cells].sort((a, b) => a.visibilityPct - b.visibilityPct).slice(0, 4);
    f['persona-heatmap'] = `Weakest persona×topic cells: ${weak.map((c) => `${c.persona}/${c.topic} ${c.visibilityPct}%`).join('; ')}.`;
  }
  const drivers = v?.perception?.drivers ?? [];
  if (drivers.length) {
    f['sentiment-drivers'] = drivers
      .slice(0, 5)
      .map((d) => `${d.attribute}: ${d.sentiment} ("${d.evidence.slice(0, 80)}")`)
      .join('; ');
  }
  const claims = data.visibilityExtras?.claims?.claims ?? [];
  if (claims.length) {
    const bad = claims.filter((c) => c.verdict !== 'supported');
    f['claims-accuracy'] = `${claims.length} claims checked, ${bad.length} not supported: ${bad.slice(0, 3).map((c) => `"${c.claim.slice(0, 70)}" (${c.verdict})`).join('; ')}`;
  }
  const cits = v?.citations ?? [];
  if (cits.length) {
    f.citations = `Top cited domains in category: ${cits.slice(0, 6).map((c) => `${c.domain}(${c.count})`).join(', ')}.`;
  }
  const gaps = data.visibilityExtras?.citationGap?.gaps ?? [];
  if (gaps.length) {
    f['citation-gap'] = `Cited domains where brand is absent: ${gaps.slice(0, 5).map((g) => `${g.domain}(${g.count})`).join(', ')}.`;
  }
  if (data.geo) {
    f.geo = `GEO score ${data.geo.score ?? 'n/a'}/100. Issues: ${(data.geo.recommendations ?? []).slice(0, 4).join('; ') || 'none flagged'}.`;
    const cc = data.geo.commerce;
    if (cc) {
      const fails = cc.checks.filter((c) => !c.passed).slice(0, 4);
      f['commerce-readiness'] = `Commerce readiness ${cc.score}/100. Failing: ${fails.map((c) => `${c.label} (${c.impact})`).join('; ') || 'nothing'}.`;
    }
  }
  const tech = [...(data.technicalIssues ?? []), ...(data.onPageIssues ?? [])];
  if (tech.length) f.technical = tech.slice(0, 6).join('; ');
  const kws = data.synthesis?.keywordOpportunities ?? [];
  if (kws.length) {
    f.keywords = `Keyword opportunities: ${kws.slice(0, 6).map((k) => `${k.keyword}${k.intent ? ` [${k.intent}]` : ''}`).join(', ')}.`;
  }
  if (data.competitors?.length) {
    f.competitors = `Crawled competitors: ${data.competitors.slice(0, 4).map((c) => `${c.domain}${c.wordCount ? ` (${c.wordCount}w)` : ''}`).join(', ')}.`;
  }
  if (data.synthesis?.contentGapBrief) {
    f.content = `Biggest detected content gap: "${data.synthesis.contentGapBrief.title}".`;
  }
  return f;
}

async function generateBatch(
  domain: string,
  category: string | undefined,
  keys: readonly string[],
  findings: SectionSolutionsInput['findings'],
): Promise<SectionSolutions> {
  const present = keys.filter((k) => findings[k as keyof typeof findings]);
  if (present.length === 0) return {};

  const findingsBlock = present
    .map((k) => `### ${k}\n${findings[k as keyof typeof findings]}`)
    .join('\n');

  const system =
    'You are a senior SEO/GEO consultant. For each analysis section, produce a problem diagnosis, prioritized solutions, and a phased roadmap SPECIFIC to the findings given — never generic filler. Respond with ONLY JSON.';
  const user =
    `Site: ${domain}${category ? ` (category: ${category})` : ''}\n\n` +
    `Audit findings by section:\n${findingsBlock}\n\n` +
    `For EACH section above, output an object with:\n` +
    `- "problems": 1-3 one-sentence problem statements grounded in the findings\n` +
    `- "solutions": 1-3 items, each {"title","steps":[1-4 imperative concrete steps],"effort":"low|medium|high","impact":"low|medium|high"}\n` +
    `- "roadmap": up to 3 items {"phase":"Now|30 days|90 days","focus":"one sentence"}\n` +
    `Keep every string under 160 characters. Output ONLY a JSON object keyed by section id: {${present.map((k) => `"${k}":{...}`).join(',')}}`;

  const raw = await aiText(system, user, { maxTokens: 3000 });
  if (!raw) return {};
  const parsed = BatchSchema(present).safeParse(extractJson(raw));
  if (!parsed.success) {
    console.warn('Section solutions batch failed validation:', parsed.error.issues.slice(0, 3));
    return {};
  }
  const out: SectionSolutions = {};
  for (const k of present) {
    const val = (parsed.data as Record<string, SectionSolution | undefined>)[k];
    if (val) out[k] = val;
  }
  return out;
}

/**
 * Generate solutions for all sections. Two AI calls; graceful {} on failure
 * of either. Never throws.
 */
export async function generateSectionSolutions(
  input: SectionSolutionsInput & { category?: string },
): Promise<SectionSolutions | null> {
  try {
    const [ai, seo] = await Promise.all([
      generateBatch(input.domain, input.category, AI_SECTIONS, input.findings).catch((e) => {
        console.warn('AI-sections solutions skipped:', e instanceof Error ? e.message : e);
        return {};
      }),
      generateBatch(input.domain, input.category, SEO_SECTIONS, input.findings).catch((e) => {
        console.warn('SEO-sections solutions skipped:', e instanceof Error ? e.message : e);
        return {};
      }),
    ]);
    const merged = { ...ai, ...seo };
    return Object.keys(merged).length > 0 ? merged : null;
  } catch {
    return null;
  }
}
