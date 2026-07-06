import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';

/**
 * Zod schema for the AI synthesis. The dashboard consumes every field here,
 * so validating against this guarantees the UI never receives malformed data.
 * Structured outputs (zodOutputFormat) constrain Claude to this exact shape.
 */
export const SynthesisSchema = z.object({
  executiveSummary: z.string(),
  topPriority: z.string(),
  topCategoryScores: z.object({
    onPage: z.number(),
    technical: z.number(),
    content: z.number(),
    links: z.number(),
    keywords: z.number(),
    schema: z.number(),
  }),
  contentGapBrief: z.object({
    title: z.string(),
    rationale: z.string(),
    outline: z.array(z.string()),
  }),
  keywordOpportunities: z.array(
    z.object({
      keyword: z.string(),
      intent: z.string(),
      difficulty: z.string(),
      volume: z.string(),
    }),
  ),
  contentBriefs: z.array(
    z.object({
      id: z.number(),
      title: z.string(),
      targetKeyword: z.string(),
      funnelStage: z.string(),
      volume: z.string(),
      difficulty: z.string(),
      goal: z.string(),
      outline: z.array(z.string()),
    }),
  ),
  titleTags: z.array(
    z.object({
      page: z.string(),
      current: z.string(),
      newTitle: z.string(),
      metaDesc: z.string(),
      titleChars: z.number(),
      status: z.string(),
    }),
  ),
  contentCalendar: z.array(
    z.object({
      month: z.string(),
      week: z.string(),
      title: z.string(),
      type: z.string(),
      details: z.string(),
    }),
  ),
});

export type Synthesis = z.infer<typeof SynthesisSchema>;

export interface SynthesisInput {
  url: string;
  domain: string;
  title: string;
  titleLength: number;
  metaDescription: string;
  h1Count: number;
  wordCount: number;
  /** null when PageSpeed didn't return a score — never a fake 0 (B5). */
  mobileSpeedScore: number | null;
  hasCart: boolean;
  hasReviewsSchema: boolean;
  competitors: { domain: string; wordCount: number; h1Count: number; externalCount: number }[];
}

function buildPrompt(input: SynthesisInput): string {
  return `You are an expert SEO consultant. Below is scraped SEO data for the website ${input.url}.

Domain: ${input.domain}
Title: ${input.title} (Length: ${input.titleLength})
Meta Description: ${input.metaDescription}
H1 Count: ${input.h1Count}
Word Count: ${input.wordCount}
Mobile Speed Score: ${input.mobileSpeedScore != null ? `${input.mobileSpeedScore}/100` : 'unavailable (PageSpeed API did not return a result — do not assume a value)'}
Has Cart/Checkout: ${input.hasCart} | Has Reviews Schema: ${input.hasReviewsSchema}
-----------------------
COMPETITOR CONTEXT (if empty, disregard):
${input.competitors.map((c) => `- ${c.domain} | WordCount: ${c.wordCount} | H1s: ${c.h1Count} | ExtLinks: ${c.externalCount}`).join('\n') || '(none provided)'}

Based strictly on this data, produce an SEO analysis. Requirements:
- topCategoryScores values are integers 0-100.
- contentGapBrief is the single highest-value blog post to write, with a rationale tying it to a competitor content gap and a 3+ item H2 outline.
- Provide 4-6 keywordOpportunities, 3-4 contentBriefs, 2-3 titleTags, and 4-6 contentCalendar entries.`;
}

/**
 * Generate the AI synthesis using Claude with structured outputs.
 * messages.parse() validates the response against the Zod schema automatically.
 * Returns null if synthesis cannot be produced (the route degrades gracefully).
 */
export async function generateSynthesis(input: SynthesisInput): Promise<Synthesis | null> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY is not set; skipping AI synthesis.');
    return null;
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const prompt = buildPrompt(input);

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await client.messages.parse({
        model: 'claude-haiku-4-5',
        max_tokens: 8000,
        messages: [{ role: 'user', content: prompt }],
        output_config: { format: zodOutputFormat(SynthesisSchema) },
      });

      if (response.parsed_output) return response.parsed_output;
      console.error(`Synthesis returned no parsed output (attempt ${attempt + 1})`);
    } catch (e) {
      console.error(`Synthesis error (attempt ${attempt + 1}):`, e);
    }
  }

  return null;
}
