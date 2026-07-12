import OpenAI from 'openai';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const pExecFile = promisify(execFile);

/**
 * Unified AI provider layer with a four-tier fallback:
 *
 *  1. Gemini API   — primary production path (GEMINI_API_KEY), via Google's
 *     OpenAI-compatible endpoint so the same `openai` SDK client works
 *     unmodified with just a different base URL + model name.
 *  2. OpenAI API   — used instead of Gemini if OPENAI_API_KEY is set and
 *     GEMINI_API_KEY is not (kept for operators who prefer OpenAI billing).
 *  3. Anthropic    — secondary probe target for multi-model visibility.
 *  4. Claude CLI   — local-only subscription path: when no API key is set and
 *     we're NOT on a serverless host, AI calls shell out to the operator's
 *     `claude -p` (Claude Code subscription). This lets local audits run the
 *     full AI pipeline on subscription tokens at zero API cost. Never used in
 *     production (no CLI exists there), so deployments still need a key.
 */
export const GEMINI_MODEL = 'gemini-2.5-flash';
export const OPENAI_MODEL = 'gpt-4o-mini';

type Provider = { client: OpenAI; model: string; label: string };

/** The active OpenAI-compatible provider: Gemini first, then OpenAI. */
export function activeProvider(): Provider | null {
  const geminiKey = process.env.GEMINI_API_KEY;
  if (geminiKey) {
    return {
      client: new OpenAI({ apiKey: geminiKey, baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/' }),
      model: GEMINI_MODEL,
      label: `Gemini ${GEMINI_MODEL}`,
    };
  }
  const openaiKey = process.env.OPENAI_API_KEY;
  if (openaiKey) {
    return { client: new OpenAI({ apiKey: openaiKey }), model: OPENAI_MODEL, label: `OpenAI ${OPENAI_MODEL}` };
  }
  return null;
}

/** @deprecated use activeProvider() — kept for call sites not yet migrated. */
export function openaiClient(): OpenAI | null {
  return activeProvider()?.client ?? null;
}

/** CLI fallback is only meaningful on a local machine, never on Vercel/Lambda. */
export function cliAvailable(): boolean {
  return !process.env.VERCEL && !process.env.AWS_LAMBDA_FUNCTION_NAME && process.env.AI_CLI_DISABLE !== '1';
}

export function isAiConfigured(): boolean {
  return !!activeProvider() || cliAvailable();
}

/** Which provider a given call will use — surfaced in results/labels. */
export function aiProviderLabel(): string {
  const p = activeProvider();
  if (p) return p.label;
  if (cliAvailable()) return 'Claude Sonnet (subscription CLI)';
  return 'none';
}

/**
 * One-shot chat completion through whichever provider is available.
 * Returns null when no provider works (callers degrade gracefully).
 */
export async function aiText(
  system: string | null,
  user: string,
  opts: { maxTokens?: number } = {},
): Promise<string | null> {
  const provider = activeProvider();
  if (provider) {
    try {
      const r = await provider.client.chat.completions.create({
        model: provider.model,
        max_tokens: opts.maxTokens ?? 1000,
        messages: [
          ...(system ? [{ role: 'system' as const, content: system }] : []),
          { role: 'user' as const, content: user },
        ],
      });
      return r.choices[0]?.message?.content ?? null;
    } catch (e) {
      console.warn(`${provider.label} call failed:`, e instanceof Error ? e.message : e);
      // fall through to CLI if available (e.g. invalid key locally)
    }
  }

  if (cliAvailable()) {
    try {
      const prompt = system ? `${system}\n\n---\n\n${user}` : user;
      const { stdout } = await pExecFile('claude', ['-p', prompt, '--model', 'sonnet'], {
        timeout: 180000,
        maxBuffer: 4 * 1024 * 1024,
        env: { ...process.env, PATH: `${process.env.PATH ?? ''}:${process.env.HOME}/.local/bin` },
      });
      return stdout.trim() || null;
    } catch (e) {
      console.warn('Claude CLI call failed:', e instanceof Error ? e.message : e);
    }
  }

  return null;
}

/** Extract the first JSON object/array from a response that may include prose or code fences. */
export function extractJson(text: string): unknown | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.search(/[[{]/);
  if (start === -1) return null;
  // Walk to the matching close bracket so trailing prose doesn't break parsing.
  const open = candidate[start];
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  for (let i = start; i < candidate.length; i++) {
    if (candidate[i] === open) depth++;
    else if (candidate[i] === close && --depth === 0) {
      try {
        return JSON.parse(candidate.slice(start, i + 1));
      } catch {
        return null;
      }
    }
  }
  return null;
}
