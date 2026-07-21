import { z } from 'zod';
import { zodResponseFormat } from 'openai/helpers/zod';
import { activeProvider, cliAvailable, aiText, extractJson } from './ai';
import type { SectionSolutions } from './sectionSolutions';

/**
 * Program Strategy engine — the systematic layer above per-section fixes.
 *
 * Where sectionSolutions answers "what do I fix in THIS section" and
 * optimizationPlan answers "what moves THIS score", programStrategy answers
 * "how do we run the whole program": a north-star objective, workstreams
 * with prioritized initiatives (P0/P1/P2, dependencies, success metrics),
 * a three-phase roadmap with milestones and KPI targets, and a measurement
 * cadence. One AI call, grounded in every artifact the audit produced.
 */

export const InitiativeSchema = z.object({
  title: z.string(),
  priority: z.enum(['P0', 'P1', 'P2']),
  effort: z.enum(['low', 'medium', 'high']),
  impact: z.enum(['low', 'medium', 'high']),
  timeframe: z.string(), // e.g. "Week 1-2"
  successMetric: z.string(),
  // Models routinely emit `"dependsOn": null` for no-dependency items —
  // accept null/absent alike (an .optional() here failed live validation).
  dependsOn: z.string().nullish(),
});

export const WorkstreamSchema = z.object({
  name: z.string(),
  objective: z.string(),
  kpi: z.string(),
  initiatives: z.array(InitiativeSchema).min(1).max(4),
});

export const PhaseSchema = z.object({
  name: z.string(),
  timeframe: z.string(),
  goals: z.array(z.string()).min(1).max(3),
  milestones: z.array(z.string()).min(1).max(4),
  kpiTargets: z.array(z.string()).min(1).max(4),
});

export const ProgramStrategySchema = z.object({
  northStar: z.string(),
  currentState: z.array(z.string()).min(2).max(5),
  workstreams: z.array(WorkstreamSchema).min(3).max(5),
  phases: z.array(PhaseSchema).min(2).max(3),
  measurement: z.object({
    cadence: z.string(),
    coreKpis: z.array(z.string()).min(2).max(6),
  }),
});

export type ProgramStrategy = z.infer<typeof ProgramStrategySchema>;

export interface ProgramStrategyInput {
  domain: string;
  category?: string;
  overallScore: number | null;
  geoScore: number | null;
  visibilityPct: number | null;
  commerceScore?: number | null;
  technicalIssues: string[];
  onPageIssues: string[];
  geoIssues: string[];
  citedDomains: string[];
  competitors: string[];
  keywords: { keyword: string; intent?: string }[];
  contradictedClaims?: string[];
  weakestPersonaCells?: string[];
  sectionSolutions?: SectionSolutions | null;
  projectedScore?: number | null;
}

/**
 * Compact the strategy input into the grounding block for the AI call.
 * Pure — unit tested. Every list is hard-capped so the prompt stays small.
 */
export function buildStrategyBrief(input: ProgramStrategyInput): string {
  const lines: string[] = [
    `Site: ${input.domain}${input.category ? ` — ${input.category}` : ''}`,
    `Scores: SEO ${input.overallScore ?? 'n/a'}/100, GEO ${input.geoScore ?? 'n/a'}/100, AI visibility ${input.visibilityPct ?? 'n/a'}%${input.commerceScore != null ? `, commerce ${input.commerceScore}/100` : ''}${input.projectedScore != null ? `. Projected SEO after fixes: ${input.projectedScore}/100` : ''}`,
  ];
  if (input.competitors.length) lines.push(`AI-answer competitors: ${input.competitors.slice(0, 5).join(', ')}`);
  if (input.citedDomains.length) lines.push(`Domains AI engines cite in category: ${input.citedDomains.slice(0, 6).join(', ')}`);
  if (input.technicalIssues.length) lines.push(`Technical issues: ${input.technicalIssues.slice(0, 5).join('; ')}`);
  if (input.onPageIssues.length) lines.push(`On-page issues: ${input.onPageIssues.slice(0, 5).join('; ')}`);
  if (input.geoIssues.length) lines.push(`GEO issues: ${input.geoIssues.slice(0, 5).join('; ')}`);
  if (input.contradictedClaims?.length) lines.push(`AI states wrong facts: ${input.contradictedClaims.slice(0, 3).join('; ')}`);
  if (input.weakestPersonaCells?.length) lines.push(`Weakest persona×topic: ${input.weakestPersonaCells.slice(0, 4).join('; ')}`);
  if (input.keywords.length) lines.push(`Keyword opportunities: ${input.keywords.slice(0, 8).map((k) => k.keyword).join(', ')}`);
  const solvedSections = Object.keys(input.sectionSolutions ?? {});
  if (solvedSections.length) {
    const topFixes = solvedSections
      .flatMap((s) => (input.sectionSolutions?.[s]?.solutions ?? []).slice(0, 1).map((x) => `${s}: ${x.title}`))
      .slice(0, 8);
    lines.push(`Per-section fixes already identified: ${topFixes.join('; ')}`);
  }
  return lines.join('\n');
}

const SYSTEM =
  'You are a fractional head of SEO/GEO running a systematic growth program. Produce an executive-grade program strategy from the audit brief: specific to the findings, numeric where possible, zero generic filler. Respond with ONLY JSON.';

export async function generateProgramStrategy(
  input: ProgramStrategyInput,
): Promise<ProgramStrategy | null> {
  const brief = buildStrategyBrief(input);
  const user =
    `${brief}\n\n` +
    `Design the complete program as JSON:\n` +
    `{\n` +
    ` "northStar": "one sentence: the single program objective with a number and horizon",\n` +
    ` "currentState": ["2-5 bullets: where the program stands, each grounded in a metric above"],\n` +
    ` "workstreams": [3-5 of {"name":"e.g. Technical SEO | Content & Keywords | AI Visibility (GEO) | Digital PR & Citations | Commerce Readiness","objective":"one sentence","kpi":"the metric this workstream moves","initiatives":[1-4 of {"title","priority":"P0|P1|P2","effort":"low|medium|high","impact":"low|medium|high","timeframe":"e.g. Week 1-2","successMetric":"measurable outcome","dependsOn":"optional initiative title"}]}],\n` +
    ` "phases": [2-3 of {"name":"e.g. Foundation | Growth | Authority","timeframe":"e.g. Days 0-30","goals":[1-3],"milestones":[1-4 concrete deliverables],"kpiTargets":[1-4 e.g. \\"AI visibility 0% → 15%\\"]}],\n` +
    ` "measurement": {"cadence":"e.g. weekly re-audit + monthly review","coreKpis":[2-6 metric names]}\n` +
    `}\n` +
    `Rules: only include workstreams the findings justify; P0 = blocking/urgent; every string under 180 chars; phases must reference the same initiatives, not invent new ones.`;

  // Mirror optimizationPlan's proven pattern: structured output via
  // zodResponseFormat at a generous token budget (Gemini free-form JSON at
  // 3.5k tokens truncated mid-object in live testing), 2 attempts, then the
  // local CLI with extractJson as last resort.
  const provider = activeProvider();
  if (provider) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await provider.client.chat.completions.parse({
          model: provider.model,
          max_tokens: 8000,
          messages: [
            { role: 'system', content: SYSTEM },
            { role: 'user', content: user },
          ],
          response_format: zodResponseFormat(ProgramStrategySchema, 'program_strategy'),
        });
        const parsed = response.choices[0]?.message?.parsed;
        if (parsed) return parsed;
        console.warn(`Program strategy returned no parsed output (attempt ${attempt + 1})`);
      } catch (e) {
        console.warn(`Program strategy error (attempt ${attempt + 1}):`, e instanceof Error ? e.message : e);
        if (cliAvailable()) break;
      }
    }
  }

  if (cliAvailable()) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const raw = await aiText(SYSTEM, user, { maxTokens: 8000 });
      if (!raw) continue;
      const parsed = ProgramStrategySchema.safeParse(extractJson(raw));
      if (parsed.success) return parsed.data;
      console.warn(`CLI program strategy failed validation (attempt ${attempt + 1}):`, parsed.error.issues.slice(0, 3));
    }
  }

  console.warn('No AI provider produced a valid program strategy.');
  return null;
}
