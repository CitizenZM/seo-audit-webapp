import { describe, it, expect } from 'vitest';
import {
  matchAiBot,
  parseLogDrainPayload,
  filterAiCrawlerHits,
  aggregateCrawlerHits,
  type CrawlerHitRow,
} from './crawlerAnalytics';

describe('matchAiBot', () => {
  it('matches a known bot UA case-insensitively', () => {
    expect(matchAiBot('Mozilla/5.0 (compatible; GPTBot/1.0; +https://openai.com/gptbot)')?.name).toBe('GPTBot');
    expect(matchAiBot('mozilla/5.0 gptbot')?.engine).toBe('OpenAI');
  });

  it('matches ClaudeBot and PerplexityBot', () => {
    expect(matchAiBot('ClaudeBot/1.0')?.engine).toBe('Anthropic');
    expect(matchAiBot('PerplexityBot')?.engine).toBe('Perplexity');
  });

  it('returns null for a normal browser UA', () => {
    expect(matchAiBot('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36')).toBeNull();
  });

  it('returns null for empty UA', () => {
    expect(matchAiBot('')).toBeNull();
  });
});

describe('parseLogDrainPayload', () => {
  it('parses the generic { entries } shape', () => {
    const result = parseLogDrainPayload({
      entries: [
        { userAgent: 'GPTBot/1.0', path: '/blog/post', timestamp: '2026-07-01T00:00:00Z' },
        { userAgent: 'ClaudeBot', path: '/', timestamp: 1750000000000 },
      ],
    });
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ userAgent: 'GPTBot/1.0', path: '/blog/post', timestamp: '2026-07-01T00:00:00.000Z' });
    expect(result[1].path).toBe('/');
  });

  it('skips malformed generic entries without throwing', () => {
    const result = parseLogDrainPayload({ entries: [{ userAgent: 'GPTBot' }, null, 42, { path: '/x' }, {}] });
    expect(result).toEqual([]);
  });

  it('parses Vercel log drain array shape with nested proxy field', () => {
    const result = parseLogDrainPayload([
      {
        id: 'log1',
        proxy: {
          userAgent: 'Mozilla/5.0 (compatible; GPTBot/1.0)',
          path: '/products/widget',
          timestamp: 1751000000000,
        },
      },
      {
        id: 'log2',
        proxy: {
          userAgent: 'ClaudeBot',
          pathname: '/pricing',
          timestamp: '2026-07-02T00:00:00Z',
        },
      },
    ]);
    expect(result).toHaveLength(2);
    expect(result[0].path).toBe('/products/widget');
    expect(result[1].path).toBe('/pricing');
  });

  it('parses Vercel log drain entries with headers["user-agent"]', () => {
    const result = parseLogDrainPayload([
      { proxy: { headers: { 'user-agent': 'PerplexityBot' }, path: '/faq', timestamp: '2026-07-03T00:00:00Z' } },
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].userAgent).toBe('PerplexityBot');
  });

  it('skips malformed vercel-shaped records without throwing', () => {
    const result = parseLogDrainPayload([{ proxy: {} }, null, 'garbage', { proxy: { userAgent: 'Bot' } }]);
    expect(result).toEqual([]);
  });

  it('returns empty array for unknown top-level shapes', () => {
    expect(parseLogDrainPayload(null)).toEqual([]);
    expect(parseLogDrainPayload(undefined)).toEqual([]);
    expect(parseLogDrainPayload('a string')).toEqual([]);
    expect(parseLogDrainPayload(123)).toEqual([]);
    expect(parseLogDrainPayload({})).toEqual([]);
  });

  it('never throws on deeply malformed input', () => {
    expect(() => parseLogDrainPayload({ entries: 'not-an-array' })).not.toThrow();
    expect(() => parseLogDrainPayload([{ proxy: null }])).not.toThrow();
  });
});

describe('filterAiCrawlerHits', () => {
  it('keeps only entries matching known bots and tags bot/engine', () => {
    const hits = filterAiCrawlerHits([
      { userAgent: 'GPTBot/1.0', path: '/a', timestamp: '2026-07-01T00:00:00Z' },
      { userAgent: 'Mozilla/5.0 regular browser', path: '/b', timestamp: '2026-07-01T00:00:00Z' },
      { userAgent: 'ClaudeBot', path: '/c', timestamp: '2026-07-01T00:00:00Z' },
    ]);
    expect(hits).toHaveLength(2);
    expect(hits.map((h) => h.bot)).toEqual(['GPTBot', 'ClaudeBot']);
  });
});

describe('aggregateCrawlerHits', () => {
  const rows: CrawlerHitRow[] = [
    { bot: 'GPTBot', engine: 'OpenAI', path: '/', hitAt: '2026-07-01T00:00:00Z' },
    { bot: 'GPTBot', engine: 'OpenAI', path: '/blog', hitAt: '2026-07-05T00:00:00Z' },
    { bot: 'ClaudeBot', engine: 'Anthropic', path: '/', hitAt: '2026-07-03T00:00:00Z' },
    { bot: 'PerplexityBot', engine: 'Perplexity', path: '/blog', hitAt: '2026-07-02T00:00:00Z' },
  ];

  it('returns empty stats for no rows', () => {
    const stats = aggregateCrawlerHits([]);
    expect(stats.totalHits).toBe(0);
    expect(stats.byBot).toEqual([]);
    expect(stats.firstSeen).toBeNull();
    expect(stats.lastSeen).toBeNull();
  });

  it('aggregates hits per bot and per engine', () => {
    const stats = aggregateCrawlerHits(rows);
    expect(stats.totalHits).toBe(4);
    expect(stats.byBot[0]).toEqual({ bot: 'GPTBot', engine: 'OpenAI', hits: 2 });
    expect(stats.byEngine.find((e) => e.engine === 'OpenAI')?.hits).toBe(2);
  });

  it('computes top paths sorted by hit count', () => {
    const stats = aggregateCrawlerHits(rows);
    expect(stats.topPaths[0]).toEqual({ path: '/', hits: 2 });
    expect(stats.topPaths[1]).toEqual({ path: '/blog', hits: 2 });
  });

  it('computes first/last seen across rows', () => {
    const stats = aggregateCrawlerHits(rows);
    expect(stats.firstSeen).toBe('2026-07-01T00:00:00Z');
    expect(stats.lastSeen).toBe('2026-07-05T00:00:00Z');
  });
});
