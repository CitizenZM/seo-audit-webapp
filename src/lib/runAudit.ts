import * as cheerio from 'cheerio';
import { launchBrowser } from '@/lib/browser';
import { generateSynthesis } from '@/lib/synthesis';
import { fetchSerp } from '@/lib/serp';
import { assertSafeUrl } from '@/lib/urlSafety';
import { computeScore } from '@/lib/score';

export type Stage = 'crawl' | 'competitors' | 'speed' | 'ai' | 'serp' | 'done';
export type OnStage = (stage: Stage) => void;

/**
 * Get the page HTML. Tries headless Chromium first (renders JS-heavy sites),
 * and falls back to a plain fetch if the browser can't launch (e.g. no local
 * Chrome installed, or a serverless cold-start failure). Resilience upgrade so
 * a single rendering failure never aborts the whole audit. (#10)
 */
async function getHtml(targetUrl: string): Promise<{ html: string; rendered: boolean }> {
  // (B7) Single render attempt at a tight timeout, not 2×30s — under the
  // route's 60s budget we still need room for competitor scraping, the site
  // crawl, PageSpeed, AI synthesis, and SERP. A single slow render shouldn't
  // burn the whole budget before those even start.
  let browser;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage();
    await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 20000 });
    const html = await page.content();
    return { html, rendered: true };
  } catch (err) {
    console.warn('Headless render failed, falling back to plain fetch:', err instanceof Error ? err.message : err);
  } finally {
    if (browser) await browser.close().catch(() => {});
  }

  // Fallback: plain HTTP fetch (no JS execution, but enough for static SEO signals).
  const res = await fetch(targetUrl, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SEOAuditBot/1.0)' },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`Could not fetch ${targetUrl} (HTTP ${res.status})`);
  return { html: await res.text(), rendered: false };
}

/** Parse all JSON-LD blocks and collect their schema.org @type values. (#8) */
function detectSchemaTypes($: cheerio.CheerioAPI): string[] {
  const types = new Set<string>();
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const json = JSON.parse($(el).text());
      const nodes = Array.isArray(json) ? json : json['@graph'] ?? [json];
      for (const node of [].concat(nodes as never)) {
        const t = (node as Record<string, unknown>)?.['@type'];
        if (typeof t === 'string') types.add(t);
        else if (Array.isArray(t)) t.forEach((x) => typeof x === 'string' && types.add(x));
      }
    } catch {
      /* ignore malformed JSON-LD */
    }
  });
  return [...types];
}

async function scrapeSite(targetUrl: string, isCompetitor = false) {
  const urlObj = new URL(targetUrl);
  const domain = urlObj.hostname;

  // 1. Render the page (headless Chromium with fetch fallback)
  const { html, rendered } = await getHtml(targetUrl);

  // 2. Parse HTML
  const $ = cheerio.load(html);
  const title = $('title').text();
  const metaDesc = $('meta[name="description"]').attr('content') || '';
  const h1s = $('h1')
    .map((i, el) => $(el).text().trim())
    .get();

  $('script, style, noscript').remove();
  const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
  const wordCount = bodyText ? bodyText.split(' ').length : 0;

  const internalLinks = new Set<string>();
  const externalLinks = new Set<string>();

  $('a').each((i, el) => {
    const href = $(el).attr('href');
    if (!href || href.startsWith('javascript:')) return;
    try {
      const linkObj = new URL(href, targetUrl);
      if (linkObj.hostname === domain) internalLinks.add(linkObj.href);
      else externalLinks.add(linkObj.href);
    } catch {
      /* ignore malformed hrefs */
    }
  });

  const hasCartOrCheckout =
    $('a[href*="cart"], a[href*="checkout"], button:contains("Add to cart")').length > 0;
  const schemaTypes = detectSchemaTypes($);
  const hasReviewsSchema =
    $('script[type="application/ld+json"]').text().includes('AggregateRating') ||
    schemaTypes.includes('AggregateRating') ||
    schemaTypes.includes('Review');
  const imageCount = $('img').length;
  const imagesWithAlt = $('img[alt]').length;

  // 3. Aux files + PageSpeed (main site only)
  let hasRobots = false;
  let hasSitemap = false;
  // null = not measured (PageSpeed failed/rate-limited) — distinct from a real
  // score of 0, so the UI/history/email never treat "unknown" as "worst" (B5).
  let speedScore: number | null = null;
  // Core Web Vitals (#5) — populated from the Lighthouse audit metrics.
  const cwv = { lcp: '', cls: '', fcp: '', tbt: '', ttfb: '' };

  if (!isCompetitor) {
    // (B7) PageSpeed previously had no timeout and could hang indefinitely,
    // eating into the route's fixed time budget.
    const [robots, sitemap, pagespeed] = await Promise.allSettled([
      fetch(`${urlObj.origin}/robots.txt`, { signal: AbortSignal.timeout(8000) }),
      fetch(`${urlObj.origin}/sitemap.xml`, { signal: AbortSignal.timeout(8000) }),
      fetch(
        `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(
          targetUrl,
        )}&strategy=mobile`,
        { signal: AbortSignal.timeout(25000) },
      ),
    ]);

    if (robots.status === 'fulfilled' && robots.value.ok) hasRobots = true;
    if (sitemap.status === 'fulfilled' && sitemap.value.ok) hasSitemap = true;
    if (pagespeed.status === 'fulfilled' && pagespeed.value.ok) {
      try {
        const data = await pagespeed.value.json();
        const rawScore = data?.lighthouseResult?.categories?.performance?.score;
        if (typeof rawScore === 'number') speedScore = Math.round(rawScore * 100);
        const audits = data?.lighthouseResult?.audits ?? {};
        cwv.lcp = audits['largest-contentful-paint']?.displayValue ?? '';
        cwv.cls = audits['cumulative-layout-shift']?.displayValue ?? '';
        cwv.fcp = audits['first-contentful-paint']?.displayValue ?? '';
        cwv.tbt = audits['total-blocking-time']?.displayValue ?? '';
        cwv.ttfb = audits['server-response-time']?.displayValue ?? '';
      } catch {
        /* ignore */
      }
    }
  }

  return {
    url: targetUrl,
    domain,
    rendered,
    // Not part of the public response — stripped before returning to callers.
    // Lets the site crawl reuse the homepage HTML instead of re-fetching it.
    _html: html,
    onPage: {
      title,
      titleLength: title.length,
      metaDescription: metaDesc,
      metaDescLength: metaDesc.length,
      h1Count: h1s.length,
      h1List: h1s,
      wordCount,
      imageAltCoverage: `${imagesWithAlt}/${imageCount} images have alt text`,
    },
    links: {
      internalCount: internalLinks.size,
      externalCount: externalLinks.size,
    },
    technical: {
      hasRobotsTxt: hasRobots,
      hasSitemapXml: hasSitemap,
      isHttps: targetUrl.startsWith('https://'),
      mobileSpeedScore: speedScore,
      cwv,
    },
    cro: {
      hasCartOrCheckout,
      hasReviewsSchema,
    },
    schema: {
      types: schemaTypes,
      hasOrganization: schemaTypes.some((t) => ['Organization', 'LocalBusiness', 'Corporation'].includes(t)),
      hasBreadcrumb: schemaTypes.includes('BreadcrumbList'),
      hasProduct: schemaTypes.includes('Product'),
      hasFAQ: schemaTypes.includes('FAQPage'),
      hasReview: schemaTypes.includes('AggregateRating') || schemaTypes.includes('Review'),
    },
  };
}

export function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  return trimmed.startsWith('http') ? trimmed : `https://${trimmed}`;
}

/**
 * Site-level crawl (#3). Reads sitemap.xml (or falls back to homepage internal
 * links), samples up to MAX_PAGES URLs, and aggregates on-page health across
 * them so the audit reflects the whole site, not just the homepage. Uses plain
 * fetch (fast, no per-page PageSpeed) and is fully best-effort — any failure
 * just shrinks the sample rather than aborting the audit.
 */
async function crawlSite(origin: string, homepageHtml: string, targetUrl: string) {
  const MAX_PAGES = 8;
  const domain = new URL(origin).hostname;
  const urls = new Set<string>();

  // 1. Prefer sitemap.xml
  try {
    const res = await fetch(`${origin}/sitemap.xml`, { signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      const xml = await res.text();
      const $x = cheerio.load(xml, { xmlMode: true });
      $x('loc').each((_, el) => {
        const loc = $x(el).text().trim();
        if (loc) urls.add(loc);
      });
    }
  } catch {
    /* no sitemap — fall back to links below */
  }

  // 2. Fall back to / supplement with internal links from the homepage
  if (urls.size < MAX_PAGES) {
    const $h = cheerio.load(homepageHtml);
    $h('a').each((_, el) => {
      const href = $h(el).attr('href');
      if (!href) return;
      try {
        const u = new URL(href, targetUrl);
        if (u.hostname === domain) urls.add(u.href.split('#')[0]);
      } catch { /* ignore */ }
    });
  }

  const sample = [...urls].filter((u) => u !== targetUrl).slice(0, MAX_PAGES);

  const pages = await Promise.allSettled(
    sample.map(async (url) => {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SEOAuditBot/1.0)' },
        signal: AbortSignal.timeout(12000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const $ = cheerio.load(await res.text());
      const title = $('title').text();
      const metaDesc = $('meta[name="description"]').attr('content') || '';
      const h1Count = $('h1').length;
      $('script, style, noscript').remove();
      const wordCount = ($('body').text().replace(/\s+/g, ' ').trim().split(' ').filter(Boolean)).length;
      return { url, title, titleLen: title.length, metaLen: metaDesc.length, h1Count, wordCount };
    }),
  );

  const ok = pages
    .filter((p): p is PromiseFulfilledResult<Awaited<ReturnType<() => Promise<{ url: string; title: string; titleLen: number; metaLen: number; h1Count: number; wordCount: number }>>>> => p.status === 'fulfilled')
    .map((p) => p.value);

  const analyzed = ok.length;
  return {
    discovered: urls.size,
    pagesAnalyzed: analyzed,
    avgWordCount: analyzed ? Math.round(ok.reduce((s, p) => s + p.wordCount, 0) / analyzed) : 0,
    pagesMissingTitle: ok.filter((p) => !p.title).length,
    pagesMissingMeta: ok.filter((p) => p.metaLen === 0).length,
    pagesMissingH1: ok.filter((p) => p.h1Count === 0).length,
    pagesMultipleH1: ok.filter((p) => p.h1Count > 1).length,
    thinContentPages: ok.filter((p) => p.wordCount < 300).length,
    sample: ok.map((p) => ({ url: p.url, title: p.title || '(missing)', words: p.wordCount, h1: p.h1Count, hasMeta: p.metaLen > 0 })),
  };
}

export class UnsafeUrlError extends Error {}

/**
 * Runs the full audit pipeline for a single target URL (+ optional
 * competitors) and returns the same response shape the dashboard has always
 * consumed. Shared by the synchronous /api/analyze route (used directly, by
 * cron re-audits, and by the email-report flow) and the async job path
 * (/api/audits), which additionally persists progress via `onStage`.
 */
export async function runAudit(
  rawTargetUrl: string,
  rawCompetitorsParam: string | null | undefined,
  onStage?: OnStage,
) {
  const normalizedTarget = normalizeUrl(rawTargetUrl);
  new URL(normalizedTarget); // throws on malformed input — caller should catch

  // S1: block SSRF — reject targets that resolve to internal/private/metadata IPs.
  try {
    await assertSafeUrl(normalizedTarget);
  } catch (e) {
    throw new UnsafeUrlError(e instanceof Error ? e.message : 'URL not allowed');
  }

  const competitorUrls = (rawCompetitorsParam ?? '')
    .split(',')
    .map((u) => u.trim())
    .filter(Boolean)
    .map(normalizeUrl);

  // S1: also validate competitor URLs — same SSRF surface via a second param.
  const safeCompetitorUrls: string[] = [];
  for (const u of competitorUrls) {
    try {
      await assertSafeUrl(u);
      safeCompetitorUrls.push(u);
    } catch {
      /* skip unsafe/unresolvable competitor URL rather than failing the whole audit */
    }
  }

  onStage?.('crawl');
  const [mainResult, ...competitorResults] = await Promise.allSettled([
    scrapeSite(normalizedTarget, false),
    ...safeCompetitorUrls.map((u) => scrapeSite(u, true)),
  ]);

  if (mainResult.status !== 'fulfilled') {
    throw mainResult.reason instanceof Error
      ? mainResult.reason
      : new Error('Failed to scrape target site');
  }

  onStage?.('competitors');
  const mainAnalysis = mainResult.value;
  const competitors = competitorResults
    .filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof scrapeSite>>> =>
      r.status === 'fulfilled',
    )
    .map((r) => r.value);

  // (B7) Site crawl, AI synthesis, and SERP lookup are independent of each
  // other — run them concurrently instead of chained awaits, since each can
  // take several seconds and Vercel's per-invocation time budget is fixed.
  // SERP uses the title (not the AI-derived keyword) so it doesn't have to
  // wait on synthesis first.
  const origin = new URL(mainAnalysis.url).origin;
  const serpQuery =
    mainAnalysis.onPage.title?.split(/[|\-–—]/)[0]?.trim() || mainAnalysis.domain;

  onStage?.('speed');
  const [siteCrawlResult, synthesis, serp] = await Promise.all([
    crawlSite(origin, mainAnalysis._html, mainAnalysis.url).catch((e) => {
      console.warn('Site crawl skipped:', e instanceof Error ? e.message : e);
      return null;
    }),
    (async () => {
      onStage?.('ai');
      return generateSynthesis({
        url: mainAnalysis.url,
        domain: mainAnalysis.domain,
        title: mainAnalysis.onPage.title,
        titleLength: mainAnalysis.onPage.titleLength,
        metaDescription: mainAnalysis.onPage.metaDescription,
        h1Count: mainAnalysis.onPage.h1Count,
        wordCount: mainAnalysis.onPage.wordCount,
        mobileSpeedScore: mainAnalysis.technical.mobileSpeedScore,
        hasCart: mainAnalysis.cro.hasCartOrCheckout,
        hasReviewsSchema: mainAnalysis.cro.hasReviewsSchema,
        competitors: competitors.map((c) => ({
          domain: c.domain,
          wordCount: c.onPage.wordCount,
          h1Count: c.onPage.h1Count,
          externalCount: c.links.externalCount,
        })),
      });
    })(),
    (async () => {
      onStage?.('serp');
      return fetchSerp(serpQuery);
    })(),
  ]);

  // Strip the internal-only raw HTML before returning the response.
  const { _html: _mainHtml, ...publicMainAnalysis } = mainAnalysis;
  void _mainHtml;
  const publicCompetitors = competitors.map(({ _html: _competitorHtml, ...c }) => {
    void _competitorHtml;
    return c;
  });

  // Composite SEO health score (0-100) — replaces "mobile speed = the score".
  const scoreBreakdown = computeScore({
    technical: publicMainAnalysis.technical,
    onPage: publicMainAnalysis.onPage,
    cro: publicMainAnalysis.cro,
    schema: publicMainAnalysis.schema,
    synthesis: synthesis ? { topCategoryScores: synthesis.topCategoryScores } : null,
  });

  onStage?.('done');

  return {
    data: {
      ...publicMainAnalysis,
      synthesis,
      siteCrawl: siteCrawlResult,
      serp,
      overallScore: scoreBreakdown.overall,
      scoreBreakdown: scoreBreakdown.components,
    },
    competitors: publicCompetitors,
  };
}
