import * as cheerio from 'cheerio';
import { launchBrowser } from '@/lib/browser';
import { generateSynthesis } from '@/lib/synthesis';
import { fetchSerp } from '@/lib/serp';
import { assertSafeUrl } from '@/lib/urlSafety';
import { computeScore } from '@/lib/score';
import { analyzeGeo } from '@/lib/geo';
import { analyzeVisibility } from '@/lib/visibility';
import { generateOptimizationPlan } from '@/lib/optimizationPlan';

export type Stage = 'crawl' | 'competitors' | 'speed' | 'ai' | 'serp' | 'plan' | 'done';
// Returns a Promise — callers MUST await it. An un-awaited progress write can
// race with (and clobber) the final completion write that follows it, since
// both target the same DB row; awaiting guarantees write ordering.
export type OnStage = (stage: Stage) => void | Promise<void>;

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

  // The document <title> from <head>, captured BEFORE we strip inline SVGs.
  // `$('title')` matches every <title> in the DOM — including the <title>
  // elements inside inline <svg> icons used as accessibility labels — and
  // `.text()` concatenates them all. On real Shopify stores that produced a
  // 181-char garbage title like "Tote&Carry® …\nAmazonApple Pay…icon-chevron".
  // Scoping to head > title and collapsing whitespace fixes both the junk and
  // the inflated titleLength. (Found via live audits of the test domains.)
  const title = ($('head > title').first().text() || $('title').first().text())
    .replace(/\s+/g, ' ')
    .trim();
  const metaDesc = ($('meta[name="description"]').attr('content') || '').replace(/\s+/g, ' ').trim();

  // Structured data MUST be read BEFORE the script strip below — JSON-LD
  // lives in <script type="application/ld+json"> tags, and running
  // detectSchemaTypes after .remove() silently reported every site as having
  // zero schema (regression caught by a live us.tcl.com test: the homepage
  // has WebSite + Organization JSON-LD that we reported as []).
  const schemaTypes = detectSchemaTypes($);
  const hasReviewsSchema =
    $('script[type="application/ld+json"]').text().includes('AggregateRating') ||
    schemaTypes.includes('AggregateRating') ||
    schemaTypes.includes('Review');

  // Strip non-content nodes — including inline <svg>, whose icon <title>/label
  // text would otherwise contaminate H1 extraction and pad the word count.
  $('script, style, noscript, svg').remove();

  const h1s = $('h1')
    .map((i, el) => $(el).text().trim())
    .get()
    .filter(Boolean);

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
        )}&strategy=mobile${process.env.PAGESPEED_API_KEY ? `&key=${process.env.PAGESPEED_API_KEY}` : ''}`,
        { signal: AbortSignal.timeout(25000) },
      ),
    ]);

    if (robots.status === 'fulfilled' && robots.value.ok) hasRobots = true;
    if (sitemap.status === 'fulfilled' && sitemap.value.ok) hasSitemap = true;
    // PageSpeed failures were previously invisible — no score, no log line.
    // Surface WHY (rate limit vs timeout) so a null score is diagnosable.
    if (pagespeed.status === 'rejected') {
      console.warn('PageSpeed request failed:', pagespeed.reason instanceof Error ? pagespeed.reason.message : pagespeed.reason);
    } else if (!pagespeed.value.ok) {
      console.warn(`PageSpeed returned HTTP ${pagespeed.value.status} — score will be null. Set PAGESPEED_API_KEY to avoid anonymous rate limits.`);
    }
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
/** URLs that aren't real HTML pages and would pollute the page-health sample. */
function looksLikeHtmlPage(url: string): boolean {
  try {
    const path = new URL(url).pathname.toLowerCase();
    return !/\.(xml|json|txt|md|markdown|csv|ya?ml|rss|atom|jpe?g|png|gif|webp|svg|pdf|css|js|ico|mp4|webm|xml\.gz|gz)$/.test(path);
  } catch {
    return false;
  }
}

/** Fetch a sitemap and return its <loc> entries plus whether it's an index. */
async function readSitemap(url: string): Promise<{ locs: string[]; isIndex: boolean }> {
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) return { locs: [], isIndex: false };
  const xml = await res.text();
  const $x = cheerio.load(xml, { xmlMode: true });
  // A sitemap index wraps child sitemaps in <sitemap>; a normal sitemap uses <url>.
  const isIndex = $x('sitemapindex').length > 0 || $x('sitemap > loc').length > 0;
  const locs: string[] = [];
  $x('loc').each((_, el) => {
    const loc = $x(el).text().trim();
    if (loc) locs.push(loc);
  });
  return { locs, isIndex };
}

async function crawlSite(origin: string, homepageHtml: string, targetUrl: string) {
  const MAX_PAGES = 8;
  const domain = new URL(origin).hostname;
  const urls = new Set<string>();

  // 1. Prefer sitemap.xml — recursing one level into a sitemap index so we
  //    collect actual page URLs, not the child-sitemap .xml files themselves.
  //    (Without this, sites like Shopify whose /sitemap.xml is an index got
  //    their nested sitemap XML files sampled as if they were pages — every
  //    one reads as h1=0/no-meta, badly skewing the "pages missing …" stats.)
  try {
    const root = await readSitemap(`${origin}/sitemap.xml`);
    if (root.isIndex) {
      // Fetch a handful of child sitemaps and gather their page URLs.
      const children = root.locs.filter((l) => looksLikeHtmlPage(l) === false).slice(0, 5);
      const childResults = await Promise.allSettled(children.map((c) => readSitemap(c)));
      for (const r of childResults) {
        if (r.status === 'fulfilled') {
          for (const loc of r.value.locs) {
            if (looksLikeHtmlPage(loc)) urls.add(loc);
            if (urls.size >= MAX_PAGES * 3) break;
          }
        }
      }
    } else {
      for (const loc of root.locs) {
        if (looksLikeHtmlPage(loc)) urls.add(loc);
      }
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
        if (u.hostname === domain && looksLikeHtmlPage(u.href)) urls.add(u.href.split('#')[0]);
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
      // Same head>title + SVG-strip discipline as the main scrape (see above).
      const title = ($('head > title').first().text() || $('title').first().text()).replace(/\s+/g, ' ').trim();
      const metaDesc = ($('meta[name="description"]').attr('content') || '').replace(/\s+/g, ' ').trim();
      const hasJsonLd = $('script[type="application/ld+json"]').length > 0;
      $('script, style, noscript, svg').remove();
      const h1Count = $('h1').length;
      const wordCount = ($('body').text().replace(/\s+/g, ' ').trim().split(' ').filter(Boolean)).length;
      // Question-style headings — the content shape LLMs extract most cleanly.
      const qHeadings = $('h2, h3').filter((_, el) =>
        /^(how|what|why|when|where|which|who|can|does|do|is|are|should|will)\b|\?\s*$/i.test($(el).text().trim()),
      ).length;
      // Per-page AI Optimization score (Gumshoe-style page-by-page audit):
      // machine-readable facts, one clear H1, described in meta, substantive
      // content, and answer-shaped headings.
      const aiScore = Math.round(
        (hasJsonLd ? 30 : 0) +
        (h1Count === 1 ? 20 : 0) +
        (metaDesc.length >= 50 ? 20 : 0) +
        (wordCount >= 300 ? 20 : Math.min(20, (wordCount / 300) * 20)) +
        (qHeadings > 0 ? 10 : 0),
      );
      return { url, title, titleLen: title.length, metaLen: metaDesc.length, h1Count, wordCount, aiScore };
    }),
  );

  const ok = pages
    .filter((p): p is PromiseFulfilledResult<{ url: string; title: string; titleLen: number; metaLen: number; h1Count: number; wordCount: number; aiScore: number }> => p.status === 'fulfilled')
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
    sample: ok.map((p) => ({ url: p.url, title: p.title || '(missing)', words: p.wordCount, h1: p.h1Count, hasMeta: p.metaLen > 0, aiScore: p.aiScore })),
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

  await onStage?.('crawl');
  const [mainResult, ...competitorResults] = await Promise.allSettled([
    scrapeSite(normalizedTarget, false),
    ...safeCompetitorUrls.map((u) => scrapeSite(u, true)),
  ]);

  if (mainResult.status !== 'fulfilled') {
    throw mainResult.reason instanceof Error
      ? mainResult.reason
      : new Error('Failed to scrape target site');
  }

  await onStage?.('competitors');
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

  await onStage?.('speed');
  const [siteCrawlResult, synthesis, serp, geo, visibility] = await Promise.all([
    crawlSite(origin, mainAnalysis._html, mainAnalysis.url).catch((e) => {
      console.warn('Site crawl skipped:', e instanceof Error ? e.message : e);
      return null;
    }),
    (async () => {
      await onStage?.('ai');
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
      await onStage?.('serp');
      return fetchSerp(serpQuery);
    })(),
    // GEO — AI-visibility analysis (crawler access, llms.txt, no-JS content…).
    analyzeGeo({ origin, html: mainAnalysis._html, schemaTypes: mainAnalysis.schema.types }).catch((e) => {
      console.warn('GEO analysis skipped:', e instanceof Error ? e.message : e);
      return null;
    }),
    // Brand Visibility — Gumshoe-style prompt probing (needs ANTHROPIC_API_KEY;
    // null without it). Uses the raw title/domain rather than waiting on the
    // synthesis keywords so it can run concurrently.
    analyzeVisibility({
      domain: mainAnalysis.domain,
      title: mainAnalysis.onPage.title,
      competitorDomains: competitors.map((c) => c.domain),
    }).catch((e) => {
      console.warn('Visibility probing skipped:', e instanceof Error ? e.message : e);
      return null;
    }),
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

  // Optimization Plan: needs the FINAL scores as input, so it can't run in
  // the earlier parallel phase — this is a deliberate extra AI call at the
  // end of the pipeline, not an oversight.
  await onStage?.('plan');
  const technicalIssues: string[] = [];
  if (!publicMainAnalysis.technical.isHttps) technicalIssues.push('Site is not served over HTTPS');
  if (!publicMainAnalysis.technical.hasRobotsTxt) technicalIssues.push('No robots.txt found');
  if (!publicMainAnalysis.technical.hasSitemapXml) technicalIssues.push('No sitemap.xml found');
  if (publicMainAnalysis.technical.mobileSpeedScore != null && publicMainAnalysis.technical.mobileSpeedScore < 60) {
    technicalIssues.push(`Mobile PageSpeed score is low (${publicMainAnalysis.technical.mobileSpeedScore}/100)`);
  }
  if (siteCrawlResult) {
    if (siteCrawlResult.pagesMissingMeta > 0) technicalIssues.push(`${siteCrawlResult.pagesMissingMeta} crawled page(s) missing a meta description`);
    if (siteCrawlResult.thinContentPages > 0) technicalIssues.push(`${siteCrawlResult.thinContentPages} crawled page(s) have thin content (<300 words)`);
  }

  const onPageIssues: string[] = [];
  if (publicMainAnalysis.onPage.h1Count === 0) onPageIssues.push('Homepage has zero H1 tags');
  else if (publicMainAnalysis.onPage.h1Count > 1) onPageIssues.push(`Homepage has ${publicMainAnalysis.onPage.h1Count} H1 tags (should be exactly 1)`);
  if (publicMainAnalysis.onPage.titleLength > 60) onPageIssues.push(`Title tag is ${publicMainAnalysis.onPage.titleLength} chars (over the 60-char SERP limit)`);
  if (publicMainAnalysis.onPage.metaDescLength < 120 || publicMainAnalysis.onPage.metaDescLength > 160) {
    onPageIssues.push(`Meta description is ${publicMainAnalysis.onPage.metaDescLength} chars (optimal range is 120-160)`);
  }
  if (!publicMainAnalysis.schema.hasOrganization && !publicMainAnalysis.schema.hasProduct) onPageIssues.push('No Organization or Product structured data (JSON-LD) found');
  if (!publicMainAnalysis.cro.hasReviewsSchema) onPageIssues.push('No Review/AggregateRating schema found');

  const geoIssues = geo?.recommendations ?? [];

  const optimizationPlan = await generateOptimizationPlan({
    domain: publicMainAnalysis.domain,
    overallScore: scoreBreakdown.overall,
    scoreBreakdown: scoreBreakdown.components,
    geoScore: geo?.score ?? null,
    visibilityPct: visibility?.visibilityPct ?? null,
    technicalIssues,
    onPageIssues,
    geoIssues,
  }).catch((e) => {
    console.warn('Optimization plan skipped:', e instanceof Error ? e.message : e);
    return null;
  });

  await onStage?.('done');

  return {
    data: {
      ...publicMainAnalysis,
      synthesis,
      siteCrawl: siteCrawlResult,
      serp,
      geo,
      visibility,
      optimizationPlan,
      overallScore: scoreBreakdown.overall,
      geoScore: geo?.score ?? null,
      visibilityPct: visibility?.visibilityPct ?? null,
      scoreBreakdown: scoreBreakdown.components,
    },
    competitors: publicCompetitors,
  };
}
