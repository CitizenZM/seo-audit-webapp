import OpenAI from 'openai';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const pExecFile = promisify(execFile);

/**
 * Unified AI provider layer with a three-tier fallback:
 *
 *  1. OpenAI API   — production path (OPENAI_API_KEY).
 *  2. Anthropic    — secondary probe target for multi-model visibility.
 *  3. Claude CLI   — local-only subscription path: when no API key is set and
 *     we're NOT on a serverless host, AI calls shell out to the operator's
 *     `claude -p` (Claude Code subscription). This lets local audits run the
 *     full AI pipeline on subscription tokens at zero API cost. Never used in
 *     production (no CLI exists there), so deployments still need a key.
 */
export const OPENAI_MODEL = 'gpt-4o-mini';

export function openaiClient(): OpenAI | null {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  return new OpenAI({ apiKey: key });
}

/** CLI fallback is only meaningful on a local machine, never on Vercel/Lambda. */
export function cliAvailable(): boolean {
  return !process.env.VERCEL && !process.env.AWS_LAMBDA_FUNCTION_NAME && process.env.AI_CLI_DISABLE !== '1';
}

export function isAiConfigured(): boolean {
  return !!process.env.OPENAI_API_KEY || cliAvailable();
}

/** Which provider a given call will use — surfaced in results/labels. */
export function aiProviderLabel(): string {
  if (process.env.OPENAI_API_KEY) return `OpenAI ${OPENAI_MODEL}`;
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
  const oai = openaiClient();
  if (oai) {
    try {
      const r = await oai.chat.completions.create({
        model: OPENAI_MODEL,
        max_tokens: opts.maxTokens ?? 1000,
        messages: [
          ...(system ? [{ role: 'system' as const, content: system }] : []),
          { role: 'user' as const, content: user },
        ],
      });
      return r.choices[0]?.message?.content ?? null;
    } catch (e) {
      console.warn('OpenAI call failed:', e instanceof Error ? e.message : e);
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
