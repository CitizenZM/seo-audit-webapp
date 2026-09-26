import { describe, it, expect, vi, afterEach } from 'vitest';
import { crawlSite, parseRetryAfter } from './siteCrawler';

const html = (title: string) =>
  `<html><head><title>${title}</title><meta name="description" content="${'d'.repeat(130)}"></head><body><h1>${title}</h1><p>${'word '.repeat(400)}</p></body></html>`;

afterEach(() => vi.unstubAllGlobals());

describe('parseRetryAfter', () => {
  it('parses seconds, HTTP dates, and bad values', () => {
    expect(parseRetryAfter('3')).toBe(3000);
    expect(parseRetryAfter(null)).toBeNull();
    expect(parseRetryAfter('nonsense')).toBeNull();
    const future = new Date(Date.now() + 5000).toUTCString();
    expect(parseRetryAfter(future)).toBeGreaterThan(3000);
  });
});

describe('crawlSite throttling (429)', () => {
  it('backs off, retries, and never records a 429 as a page', async () => {
    let homeHits = 0;
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.endsWith('/robots.txt') || url.includes('sitemap')) return new Response('', { status: 404 });
      homeHits++;
      if (homeHits === 1) return new Response('slow down', { status: 429, headers: { 'retry-after': '0' } });
      return new Response(html('Home'), { status: 200, headers: { 'content-type': 'text/html' } });
    }));
    const out = await crawlSite('https://example.com', { maxPages: 5, budgetMs: 20000 });
    expect(out.pages.map((p) => p.status)).toEqual([200]);
    expect(out.rateLimited).toBe(true);
    expect(homeHits).toBe(2);
  });

  it('stops gracefully when the site keeps throttling, flagging rateLimited', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.endsWith('/robots.txt') || url.includes('sitemap')) return new Response('', { status: 404 });
      return new Response('no', { status: 429, headers: { 'retry-after': '0' } });
    }));
    const out = await crawlSite('https://example.com', { maxPages: 5, budgetMs: 20000 });
    expect(out.pages).toHaveLength(0);
    expect(out.rateLimited).toBe(true);
    expect(out.warnings.join(' ')).toMatch(/rate-limit/i);
  });
});

describe('crawlSite WAF challenge (Cloudflare 403 cf-mitigated)', () => {
  it('stops immediately, records no page, and flags botBlocked', async () => {
    let hits = 0;
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.endsWith('/robots.txt') || url.includes('sitemap')) return new Response('', { status: 404 });
      hits++;
      return new Response('Just a moment...', { status: 403, headers: { 'cf-mitigated': 'challenge', server: 'cloudflare' } });
    }));
    const out = await crawlSite('https://example.com', { maxPages: 5, budgetMs: 20000 });
    expect(out.pages).toHaveLength(0);
    expect(out.botBlocked).toBe(true);
    expect(hits).toBe(1);
    expect(out.warnings.join(' ')).toMatch(/bot protection/i);
  });

  it('a plain 403 without challenge markers is still a real page error', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.endsWith('/robots.txt') || url.includes('sitemap')) return new Response('', { status: 404 });
      return new Response('Forbidden', { status: 403 });
    }));
    const out = await crawlSite('https://example.com', { maxPages: 5, budgetMs: 20000 });
    expect(out.botBlocked).toBe(false);
    expect(out.pages.map((p) => p.status)).toEqual([403]);
  });
});
