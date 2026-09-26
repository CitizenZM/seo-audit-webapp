/**
 * Config-driven OpenAI-compatible probe engines for AI-visibility (GEO)
 * probing, beyond the primary provider in ai.ts.
 *
 *   OPENROUTER_API_KEY  + OPENROUTER_PROBE_MODELS (comma list; free models)
 *   MATRIX_API_KEY      + MATRIX_PROBE_MODELS     (comma list; Matrix gateway)
 *
 * Operator policy (2026-09-26): no paid OpenAI / Perplexity models — OpenAI-
 * and Perplexity-branded model ids are filtered out even if configured.
 *
 * Defaults were validated live 2026-09-26 against the real probe prompt:
 * Nemotron Super (OpenRouter free) and Qwen 3.5 397B (Matrix; its thinking
 * mode must be disabled or it spends the whole token budget reasoning and
 * never emits the BRANDS/SOURCES lines). Gemma free was 429-throttled and
 * DeepSeek v4 w8a8 on Matrix timed out >120s, so neither is a default.
 */

export interface CompatEngine {
  id: string;
  label: string;
  baseURL: string;
  apiKey: string;
  model: string;
  /** Extra request-body fields (e.g. Qwen chat_template_kwargs). */
  extraBody?: Record<string, unknown>;
  /** Max in-flight requests to this engine (free tiers rate-limit hard). */
  concurrency: number;
  headers?: Record<string, string>;
}

const BLOCKED = /^(openai|perplexity)\//i;

const PRETTY: [RegExp, string][] = [
  [/nemotron/i, 'Nemotron'],
  [/qwen/i, 'Qwen'],
  [/deepseek/i, 'DeepSeek'],
  [/gemma/i, 'Gemma'],
  [/kimi/i, 'Kimi'],
  [/glm/i, 'GLM'],
  [/minimax/i, 'MiniMax'],
  [/llama/i, 'Llama'],
];

function labelFor(model: string, gateway: string): string {
  const family = PRETTY.find(([re]) => re.test(model))?.[1] ?? model.split('/').pop()!.split(':')[0];
  const variant = model.split('/').pop()!.replace(/:free$/, '');
  return `${family} (${gateway}) ${variant}`;
}

const list = (raw: string | undefined, fallback: string[]) => {
  const parsed = (raw ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  return (parsed.length ? parsed : fallback).filter((m) => !BLOCKED.test(m));
};

type Env = Record<string, string | undefined>;

export function resolveCompatEngines(env: Env): CompatEngine[] {
  const engines: CompatEngine[] = [];

  if (env.OPENROUTER_API_KEY?.trim()) {
    for (const model of list(env.OPENROUTER_PROBE_MODELS, ['nvidia/nemotron-3-super-120b-a12b:free'])) {
      engines.push({
        id: `openrouter:${model}`,
        label: labelFor(model, 'OpenRouter'),
        baseURL: 'https://openrouter.ai/api/v1',
        apiKey: env.OPENROUTER_API_KEY.trim(),
        model,
        concurrency: model.endsWith(':free') ? 2 : 4,
        headers: { 'HTTP-Referer': 'https://seo-audit-webapp.vercel.app', 'X-Title': 'SEO Audit GEO probe' },
      });
    }
  }

  if (env.MATRIX_API_KEY?.trim()) {
    for (const model of list(env.MATRIX_PROBE_MODELS, ['qwen/qwen3.5-397b-a17b'])) {
      engines.push({
        id: `matrix:${model}`,
        label: labelFor(model, 'Matrix'),
        baseURL: (env.MATRIX_BASE_URL?.trim() || 'https://mzsjai.com/v1').replace(/\/$/, ''),
        apiKey: env.MATRIX_API_KEY.trim(),
        model,
        extraBody: /^qwen\//i.test(model) ? { chat_template_kwargs: { enable_thinking: false } } : undefined,
        concurrency: 4,
      });
    }
  }

  return engines;
}

/**
 * Probe allocation. With ≤ `fullCoverageCap` engines every prompt goes to
 * every engine, so each engine's visibility slice is measured on the same
 * question set and is directly comparable. Beyond the cap, round-robin keeps
 * cost bounded at ~plan.length.
 */
export function planProbes<P, T>(plan: P[], targets: T[], fullCoverageCap = 3): { target: T; prompt: P }[] {
  if (targets.length === 0) return [];
  if (targets.length <= fullCoverageCap) {
    return targets.flatMap((target) => plan.map((prompt) => ({ target, prompt })));
  }
  return plan.map((prompt, i) => ({ target: targets[i % targets.length], prompt }));
}

const RETRYABLE = new Set([408, 409, 425, 429, 500, 502, 503, 504]);

/** Retry rate-limit / transient failures with exponential backoff. */
export async function withRetry<T>(fn: () => Promise<T>, opts: { retries?: number; baseDelayMs?: number } = {}): Promise<T> {
  const retries = opts.retries ?? 2;
  const base = opts.baseDelayMs ?? 1500;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;
      const status = (e as { status?: number })?.status;
      if (attempt === retries || (status != null && !RETRYABLE.has(status))) throw e;
      await new Promise((r) => setTimeout(r, base * 2 ** attempt));
    }
  }
  throw lastErr;
}

/** Tiny per-engine concurrency limiter. */
export function limiter(max: number) {
  let active = 0;
  const queue: (() => void)[] = [];
  return async function run<T>(task: () => Promise<T>): Promise<T> {
    if (active >= max) await new Promise<void>((r) => queue.push(r));
    active++;
    try {
      return await task();
    } finally {
      active--;
      queue.shift()?.();
    }
  };
}

/**
 * Reject when a shared wall-clock deadline passes. Visibility probing runs
 * inside a 300s audit function; a slow/queued engine must not push the whole
 * audit past it (full us.tcl.com run with 3 engines took 222s). Late probes
 * are dropped and the gathered results are used.
 */
export function withDeadline<T>(task: Promise<T>, deadline: number): Promise<T> {
  const remaining = deadline - Date.now();
  if (remaining <= 0) return Promise.reject(new Error('probe budget exhausted'));
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('probe budget exhausted')), remaining);
    task.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}
