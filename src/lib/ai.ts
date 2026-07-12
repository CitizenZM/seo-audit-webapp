import OpenAI from 'openai';

/**
 * Unified AI provider layer. All AI analysis (synthesis, visibility probing,
 * personas, perception, content generation) runs on OpenAI per the operator's
 * choice — one key powers everything. Anthropic remains a secondary probe
 * target for multi-model visibility when ANTHROPIC_API_KEY is also present.
 */
export const OPENAI_MODEL = 'gpt-4o-mini';

export function openaiClient(): OpenAI | null {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  return new OpenAI({ apiKey: key });
}

export function isAiConfigured(): boolean {
  return !!process.env.OPENAI_API_KEY;
}
