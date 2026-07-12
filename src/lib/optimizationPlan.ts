import { z } from 'zod';
import { zodResponseFormat } from 'openai/helpers/zod';
import { activeProvider, aiText, extractJson, cliAvailable } from '@/lib/ai';

/**
 * The Optimization Plan is the answer to "what do I actually do, and what do
 * I get for it?" — every other section of the audit describes the current
 * state; this section is the only one that projects a *future* state. Each
 * scored category gets 2-4 concrete actions (with effort/impact so they can
 * be prioritized) and a projected score assuming they're all implemented,
 * plus one overall projected score and a plain-English summary.
 *
 * This is intentionally a distinct AI call from generateSynthesis — it needs
 * the FINAL computed scores as input (which only exist after computeScore
 * runs), so it can't be parallelized with the rest of the audit pipeline.
 */

const ActionSchema = z.object({
  title: z.string(),
  description: z.string(),
  effort: z.enum(['Low', 'Medium', 'High']),
  impact: z.enum(['Low', 'Medium', 'High']),
});

const CategoryPlanSchema = z.object({
  key: z.string(),
  label: z.string(),
  currentScore: z.number(),
  projectedScore: z.number(),
  actions: z.array(ActionSchema),
});

export const OptimizationPlanSchema = z.object({
  summary: z.string(),
  currentOverallScore: z.number(),
  projectedOverallScore: z.number(),
  projectedTimeframe: z.string(), // e.g. "6-8 weeks"
  categories: z.array(CategoryPlanSchema),
  quickWins: z.array(z.string()), // 3-5 things doable this week
});

export type OptimizationPlan = z.infer<typeof OptimizationPlanSchema>;

export interface OptimizationPlanInput {
  domain: string;
  overallScore: number;
  scoreBreakdown: { key: string; label: string; score: number; weight: number }[];
  geoScore: number | null;
  visibilityPct: number | null;
  technicalIssues: string[]; // short bullet facts already known to be true
  onPageIssues: string[];
  geoIssues: string[]; // GEO recommendations already generated
}

function buildPrompt(input: OptimizationPlanInput): string {
  const scoreLines = input.scoreBreakdown.map((c) => `- ${c.label}: ${c.score}/100 (weight ${c.weight}%)`).join('\n');
  return `You are an SEO/GEO optimization consultant. A site (${input.domain}) has been audited with this result:

Overall Score: ${input.overallScore}/100
${scoreLines}
${input.geoScore != null ? `GEO (AI-visibility) Readiness: ${input.geoScore}/100` : ''}
${input.visibilityPct != null ? `Brand Visibility in AI answers: ${input.visibilityPct}%` : ''}

Known technical issues:
${input.technicalIssues.map((i) => `- ${i}`).join('\n') || '(none detected)'}

Known on-page issues:
${input.onPageIssues.map((i) => `- ${i}`).join('\n') || '(none detected)'}

Known GEO (AI-visibility) gaps:
${input.geoIssues.map((i) => `- ${i}`).join('\n') || '(none detected)'}

Produce a concrete optimization plan. Be CONCISE — this output must fit a strict length budget, so keep every text field short:
- For EACH scored category above, give 2-3 specific, actionable steps (not generic advice — reference the actual issues listed). Each action: a short title (≤6 words) and a ONE-SENTENCE description (≤20 words), plus an effort (Low/Medium/High) and expected impact (Low/Medium/High).
- Give a realistic PROJECTED score for that category if all its actions are implemented (projected score must be higher than current, but realistic — don't project 100 unless the category is nearly perfect already).
- Give one overall projected score (weighted the same way as the category weights above), a realistic timeframe to achieve it (e.g. "4-6 weeks"), a summary in 2 SHORT sentences (≤40 words total), and exactly 3 "quick wins" (≤12 words each) completable this week.`;
}

export async function generateOptimizationPlan(input: OptimizationPlanInput): Promise<OptimizationPlan | null> {
  const prompt = buildPrompt(input);
  const provider = activeProvider();

  if (provider) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await provider.client.chat.completions.parse({
          model: provider.model,
          max_tokens: 8000,
          messages: [{ role: 'user', content: prompt }],
          response_format: zodResponseFormat(OptimizationPlanSchema, 'optimization_plan'),
        });
        const parsed = response.choices[0]?.message?.parsed;
        if (parsed) return parsed;
        console.error(`Optimization plan returned no parsed output (attempt ${attempt + 1})`);
      } catch (e) {
        console.error(`Optimization plan error (attempt ${attempt + 1}):`, e);
        if (cliAvailable()) break;
      }
    }
  }

  if (cliAvailable()) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const raw = await aiText(
        null,
        `${prompt}\n\nRespond with ONLY a JSON object (no prose, no code fences) with exactly these keys: summary (string), currentOverallScore (number), projectedOverallScore (number), projectedTimeframe (string), quickWins ([string]), categories ([{key,label,currentScore:number,projectedScore:number,actions:[{title,description,effort:"Low"|"Medium"|"High",impact:"Low"|"Medium"|"High"}]}]).`,
        { maxTokens: 8000 },
      );
      if (!raw) continue;
      const parsed = OptimizationPlanSchema.safeParse(extractJson(raw));
      if (parsed.success) return parsed.data;
      console.error(`CLI optimization plan failed schema validation (attempt ${attempt + 1}):`, parsed.error?.issues?.slice(0, 3));
    }
  }

  console.error('No AI provider produced a valid optimization plan.');
  return null;
}
