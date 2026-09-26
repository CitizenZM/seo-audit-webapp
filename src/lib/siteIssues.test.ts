import { describe, it, expect } from 'vitest';
import { detectSiteIssues } from './siteIssues';
import type { CrawledPageRow } from './siteCrawler';

function page(overrides: Partial<CrawledPageRow> = {}): CrawledPageRow {
  return {
    url: 'https://example.com/page',
    status: 200,
    title: 'A Good Title That Is Reasonably Sized',
    titleLength: 38,
    metaDescriptionLength: 140,
    h1Count: 1,
    wordCount: 500,
    canonical: 'https://example.com/page',
    noindex: false,
    hasJsonLd: true,
    schemaTypes: ['Article'],
    imageCount: 2,
    imagesMissingAlt: 0,
    internalLinkCount: 5,
    externalLinkCount: 1,
    responseTimeMs: 120,
    redirected: false,
    ...overrides,
  };
}

describe('detectSiteIssues', () => {
  it('returns no issues for a perfectly healthy page set', () => {
    const { issues, summary } = detectSiteIssues([
      page(),
      page({ url: 'https://example.com/two', title: 'A Second, Different Title' }),
    ]);
    expect(issues).toEqual([]);
    expect(summary.pagesCrawled).toBe(2);
    expect(summary.pagesWithIssues).toBe(0);
    expect(summary.crawlHealth).toBe(100);
  });

  it('flags 5xx and 4xx pages as critical', () => {
    const pages = [page({ url: 'https://example.com/500', status: 500 }), page({ url: 'https://example.com/404', status: 404 })];
    const { issues } = detectSiteIssues(pages);
    const server = issues.find((i) => i.id === 'SERVER_ERROR');
    const client = issues.find((i) => i.id === 'CLIENT_ERROR');
    expect(server?.severity).toBe('critical');
    expect(server?.affectedUrls).toContain('https://example.com/500');
    expect(client?.severity).toBe('critical');
    expect(client?.affectedUrls).toContain('https://example.com/404');
  });

  it('flags missing title', () => {
    const { issues } = detectSiteIssues([page({ title: null, titleLength: 0 })]);
    expect(issues.find((i) => i.id === 'MISSING_TITLE')).toBeTruthy();
  });

  it('flags title too long', () => {
    const { issues } = detectSiteIssues([page({ titleLength: 75 })]);
    expect(issues.find((i) => i.id === 'TITLE_TOO_LONG')).toBeTruthy();
  });

  it('flags duplicate titles across pages', () => {
    const dupTitle = 'Same Title Everywhere';
    const pages = [
      page({ url: 'https://example.com/a', title: dupTitle }),
      page({ url: 'https://example.com/b', title: dupTitle }),
      page({ url: 'https://example.com/c', title: 'Unique Title' }),
    ];
    const { issues } = detectSiteIssues(pages);
    const dup = issues.find((i) => i.id === 'DUPLICATE_TITLE');
    expect(dup?.count).toBe(2);
    expect(dup?.affectedUrls).toEqual(expect.arrayContaining(['https://example.com/a', 'https://example.com/b']));
    expect(dup?.affectedUrls).not.toContain('https://example.com/c');
  });

  it('flags missing, short, and long meta descriptions', () => {
    const pages = [
      page({ url: 'https://example.com/missing', metaDescriptionLength: 0 }),
      page({ url: 'https://example.com/short', metaDescriptionLength: 50 }),
      page({ url: 'https://example.com/long', metaDescriptionLength: 200 }),
    ];
    const { issues } = detectSiteIssues(pages);
    expect(issues.find((i) => i.id === 'MISSING_META_DESCRIPTION')?.affectedUrls).toContain('https://example.com/missing');
    expect(issues.find((i) => i.id === 'META_DESCRIPTION_TOO_SHORT')?.affectedUrls).toContain('https://example.com/short');
    expect(issues.find((i) => i.id === 'META_DESCRIPTION_TOO_LONG')?.affectedUrls).toContain('https://example.com/long');
  });

  it('flags missing and multiple H1', () => {
    const pages = [
      page({ url: 'https://example.com/none', h1Count: 0 }),
      page({ url: 'https://example.com/multi', h1Count: 3 }),
    ];
    const { issues } = detectSiteIssues(pages);
    expect(issues.find((i) => i.id === 'MISSING_H1')?.affectedUrls).toContain('https://example.com/none');
    expect(issues.find((i) => i.id === 'MULTIPLE_H1')?.affectedUrls).toContain('https://example.com/multi');
  });

  it('flags thin content under 300 words', () => {
    const { issues } = detectSiteIssues([page({ wordCount: 120 })]);
    expect(issues.find((i) => i.id === 'THIN_CONTENT')).toBeTruthy();
  });

  it('flags missing canonical', () => {
    const { issues } = detectSiteIssues([page({ canonical: null })]);
    expect(issues.find((i) => i.id === 'MISSING_CANONICAL')).toBeTruthy();
  });

  it('flags noindex pages', () => {
    const { issues } = detectSiteIssues([page({ noindex: true })]);
    expect(issues.find((i) => i.id === 'NOINDEX_PAGE')).toBeTruthy();
  });

  it('flags redirected URLs', () => {
    const { issues } = detectSiteIssues([page({ redirected: true })]);
    expect(issues.find((i) => i.id === 'REDIRECTED_URL')).toBeTruthy();
  });

  it('flags images missing alt text', () => {
    const { issues } = detectSiteIssues([page({ imagesMissingAlt: 4 })]);
    expect(issues.find((i) => i.id === 'MISSING_ALT_TEXT')).toBeTruthy();
  });

  it('flags no structured data', () => {
    const { issues } = detectSiteIssues([page({ hasJsonLd: false })]);
    expect(issues.find((i) => i.id === 'NO_STRUCTURED_DATA')).toBeTruthy();
  });

  it('caps affectedUrls at 20 but reports the true count', () => {
    const pages = Array.from({ length: 30 }, (_, i) => page({ url: `https://example.com/${i}`, h1Count: 0 }));
    const { issues } = detectSiteIssues(pages);
    const missing = issues.find((i) => i.id === 'MISSING_H1');
    expect(missing?.count).toBe(30);
    expect(missing?.affectedUrls).toHaveLength(20);
  });

  it('computes a lower crawlHealth score as issue severity/volume increases', () => {
    const healthy = detectSiteIssues([page(), page({ url: 'https://example.com/two' })]);
    const unhealthy = detectSiteIssues([
      page({ url: 'https://example.com/bad1', status: 500 }),
      page({ url: 'https://example.com/bad2', title: null, titleLength: 0, h1Count: 0, canonical: null }),
    ]);
    expect(unhealthy.summary.crawlHealth).toBeLessThan(healthy.summary.crawlHealth);
    expect(unhealthy.summary.crawlHealth).toBeGreaterThanOrEqual(0);
  });

  it('handles an empty page list', () => {
    const { issues, summary } = detectSiteIssues([]);
    expect(issues).toEqual([]);
    expect(summary).toEqual({
      pagesCrawled: 0,
      pagesWithIssues: 0,
      issueCounts: { critical: 0, high: 0, medium: 0, low: 0 },
      crawlHealth: 0,
    });
  });
});

describe('throttle statuses are not site errors', () => {
  it('ignores 429/503 rows in CLIENT_ERROR / SERVER_ERROR', async () => {
    const { detectSiteIssues } = await import('./siteIssues');
    const row = (url: string, status: number) => ({
      url, status, title: 't', titleLength: 30, metaDescriptionLength: 130, h1Count: 1, wordCount: 500,
      canonical: url, noindex: false, hasJsonLd: true, schemaTypes: ['Organization'], imageCount: 0,
      imagesMissingAlt: 0, internalLinkCount: 5, externalLinkCount: 1, responseTimeMs: 100,
    });
    const { issues } = detectSiteIssues([row('https://a.com/', 200), row('https://a.com/x', 429), row('https://a.com/y', 503)] as never);
    expect(issues.find((i) => i.id === 'CLIENT_ERROR')).toBeUndefined();
    expect(issues.find((i) => i.id === 'SERVER_ERROR')).toBeUndefined();
  });
});

describe('crawlHealth reflects prevalence (regression: us.tcl.com scored 95 with issues on every page)', () => {
  const page = (i: number, over: Record<string, unknown> = {}) => ({
    url: `https://a.com/p${i}`, status: 200, title: `A reasonable title for page ${i}`, titleLength: 40, metaDescriptionLength: 140,
    h1Count: 1, wordCount: 600, canonical: `https://a.com/p${i}`, noindex: false, hasJsonLd: true, schemaTypes: ['Product'],
    imageCount: 3, imagesMissingAlt: 0, internalLinkCount: 10, externalLinkCount: 1, responseTimeMs: 100, ...over,
  });
  it('a site where every page has two systemic medium issues scores well below 90', async () => {
    const { detectSiteIssues } = await import('./siteIssues');
    const pages = Array.from({ length: 100 }, (_, i) => page(i, { titleLength: 95, title: 'x'.repeat(95) + i, imagesMissingAlt: 3 }));
    expect(detectSiteIssues(pages as never).summary.crawlHealth).toBeLessThanOrEqual(80);
  });
  it('a clean site scores 100 and any critical error costs at least 10 points', async () => {
    const { detectSiteIssues } = await import('./siteIssues');
    const clean = Array.from({ length: 50 }, (_, i) => page(i));
    expect(detectSiteIssues(clean as never).summary.crawlHealth).toBe(100);
    const withError = [...clean, page(99, { status: 500 })];
    expect(detectSiteIssues(withError as never).summary.crawlHealth).toBeLessThanOrEqual(90);
  });
});
