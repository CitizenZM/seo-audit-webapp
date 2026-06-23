import OpenAI from 'openai';
import { z } from 'zod';

/**
 * Zod schema for the AI synthesis. The dashboard consumes every field here,
 * so validating against this guarantees the UI never receives malformed data.
 * If a field is missing/invalid the AI response is rejected and retried.
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
  mobileSpeedScore: number;
  hasCart: boolean;
  hasReviewsSchema: boolean;
  competitors: { domain: string; wordCount: number; h1Count: number; externalCount: number }[];
}

function buildPrompt(input: SynthesisInput): string {
  return `
You are an expert SEO consultant. Below is scraped SEO data for the website ${input.url}.

Domain: ${input.domain}
Title: ${input.title} (Length: ${input.titleLength})
Meta Description: ${input.metaDescription}
H1 Count: ${input.h1Count}
Word Count: ${input.wordCount}
Mobile Speed Score: ${input.mobileSpeedScore}/100
Has Cart/Checkout: ${input.hasCart} | Has Reviews Schema: ${input.hasReviewsSchema}
-----------------------
COMPETITOR CONTEXT (if empty, disregard):
${input.competitors.map((c) => `- ${c.domain} | WordCount: ${c.wordCount} | H1s: ${c.h1Count} | ExtLinks: ${c.externalCount}`).join('\n') || '(none provided)'}

Based strictly on this data, return ONLY a JSON object with EXACTLY this shape (no markdown, no commentary). Every field is required:
{
  "executiveSummary": "3-4 sentence high-level assessment of SEO health.",
  "topPriority": "The single most impactful action to take right now.",
  "topCategoryScores": { "onPage": 40, "technical": 45, "content": 20, "links": 35, "keywords": 30, "schema": 10 },
  "contentGapBrief": {
    "title": "Title of the single highest-value blog post to write",
    "rationale": "1-2 sentences on why this fills a competitor content gap",
    "outline": ["H2 section 1", "H2 section 2", "H2 section 3"]
  },
  "keywordOpportunities": [
    { "keyword": "high intent keyword", "intent": "Commercial", "difficulty": "Medium", "volume": "High" }
  ],
  "contentBriefs": [
    { "id": 1, "title": "Guide title", "targetKeyword": "keyword", "funnelStage": "Bottom", "volume": "High", "difficulty": "Hard", "goal": "Goal of the piece", "outline": ["H2 1", "H2 2"] }
  ],
  "titleTags": [
    { "page": "Homepage", "current": "Current title observed", "newTitle": "Optimized Title — Brand", "metaDesc": "Optimized meta description.", "titleChars": 60, "status": "ok" }
  ],
  "contentCalendar": [
    { "month": "Month 1", "week": "Week 1", "title": "Quick Win Fix", "type": "Quick Win", "details": "Description" }
  ]
}
Provide 4-6 keywordOpportunities, 3-4 contentBriefs, 2-3 titleTags, and 4-6 contentCalendar entries.
All score values are integers 0-100.
`;
}

/**
 * Generate the AI synthesis with one validation-driven retry.
 * Returns null if synthesis cannot be produced (the route degrades gracefully).
 *
 * NOTE: Provider is OpenAI because OPENAI_API_KEY is configured. To switch to
 * Claude, swap this function body for an Anthropic SDK call returning the same
 * validated shape — the schema and callers stay identical.
 */
export async function generateSynthesis(input: SynthesisInput): Promise<Synthesis | null> {
  if (!process.env.OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY is not set; skipping AI synthesis.');
    return null;
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const prompt = buildPrompt(input);

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
        temperature: 0.2,
      });

      const raw = res.choices[0]?.message?.content ?? '{}';
      const parsed = SynthesisSchema.safeParse(JSON.parse(raw));
      if (parsed.success) return parsed.data;

      console.error(`Synthesis validation failed (attempt ${attempt + 1}):`, parsed.error.issues);
    } catch (e) {
      console.error(`Synthesis error (attempt ${attempt + 1}):`, e);
    }
  }

  return null;
}
