import { describe, it, expect, vi } from 'vitest';
import { resolveCompatEngines, planProbes, withRetry } from './probeEngines';

describe('resolveCompatEngines', () => {
  it('returns nothing without keys', () => {
    expect(resolveCompatEngines({})).toEqual([]);
  });

  it('builds OpenRouter + Matrix engines with defaults and Qwen thinking disabled', () => {
    const engines = resolveCompatEngines({ OPENROUTER_API_KEY: 'or', MATRIX_API_KEY: 'mx' });
    expect(engines.map((e) => e.model)).toEqual(['nvidia/nemotron-3-super-120b-a12b:free', 'qwen/qwen3.5-397b-a17b']);
    const qwen = engines.find((e) => e.model.startsWith('qwen/'))!;
    expect(qwen.baseURL).toBe('https://mzsjai.com/v1');
    expect(qwen.extraBody).toEqual({ chat_template_kwargs: { enable_thinking: false } });
    expect(engines[0].baseURL).toBe('https://openrouter.ai/api/v1');
    expect(engines[0].label).toMatch(/Nemotron/);
  });

  it('honors comma-separated model overrides and ignores blanks', () => {
    const engines = resolveCompatEngines({ MATRIX_API_KEY: 'mx', MATRIX_PROBE_MODELS: ' qwen/qwen3.8-27b , ,deepseek/deepseek-v4-flash-w8a8' });
    expect(engines.map((e) => e.model)).toEqual(['qwen/qwen3.8-27b', 'deepseek/deepseek-v4-flash-w8a8']);
    expect(engines[1].extraBody).toBeUndefined();
  });

  it('never enables OpenAI/Perplexity-branded models through OpenRouter (operator policy)', () => {
    const engines = resolveCompatEngines({ OPENROUTER_API_KEY: 'or', OPENROUTER_PROBE_MODELS: 'openai/gpt-5,perplexity/sonar,google/gemma-4-31b-it:free' });
    expect(engines.map((e) => e.model)).toEqual(['google/gemma-4-31b-it:free']);
  });
});

describe('planProbes', () => {
  const plan = ['a', 'b', 'c', 'd'];
  it('asks every prompt of every engine when engines ≤ cap (comparable per-engine slices)', () => {
    const out = planProbes(plan, ['E1', 'E2', 'E3'], 3);
    expect(out).toHaveLength(12);
    expect(out.filter((o) => o.target === 'E2').map((o) => o.prompt)).toEqual(plan);
  });
  it('falls back to round-robin beyond the cap to bound cost', () => {
    const out = planProbes(plan, ['E1', 'E2', 'E3', 'E4', 'E5'], 3);
    expect(out).toHaveLength(4);
  });
  it('handles no engines', () => {
    expect(planProbes(plan, [], 3)).toEqual([]);
  });
});

describe('withRetry', () => {
  it('retries rate-limit errors then succeeds', async () => {
    const fn = vi.fn().mockRejectedValueOnce(Object.assign(new Error('429'), { status: 429 })).mockResolvedValueOnce('ok');
    await expect(withRetry(fn, { retries: 2, baseDelayMs: 1 })).resolves.toBe('ok');
    expect(fn).toHaveBeenCalledTimes(2);
  });
  it('does not retry non-retryable errors', async () => {
    const fn = vi.fn().mockRejectedValue(Object.assign(new Error('403'), { status: 403 }));
    await expect(withRetry(fn, { retries: 2, baseDelayMs: 1 })).rejects.toThrow('403');
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
