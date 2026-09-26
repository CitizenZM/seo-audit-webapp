import * as cheerio from 'cheerio';

/**
 * Sitemap-driven site crawler. Replaces the shallow homepage-link sample in
 * runAudit.ts's old crawlSite (MAX_PAGES = 8) with real sitemap discovery
 * (incl. sitemap-index recursion), robots.txt compliance, bounded-concurrency
 * fetching, and richer per-page signal capture.
 *
 * Ported from a proven sibling project's server/services/crawl.ts, adapted to
 * avoid adding fast-xml-parser / robots-parser as dependencies: sitemap XML is
 * parsed with cheerio in xmlMode (already used elsewhere in this repo, see
 * runAudit.ts readSitemap), and robots.txt is matched with a small
 * hand-written Disallow/Allow matcher below.
 */

const USER_AGENT = 'Mozilla/5.0 (compatible; SEOAuditBot/1.0)';
const DEFAULT_MAX_PAGES = 150;
const DEFAULT_CONCURRENCY = 4;
/** Pause between batches — politeness toward client sites (avoids 429s/WAF bans). */
const BATCH_DELAY_MS = 150;
/** Give up after this many throttle responses — the site is telling us to stop. */
const MAX_THROTTLE_HITS = 6;
const MAX_BACKOFF_MS = 15000;
const DEFAULT_PAGE_TIMEOUT_MS = 8000;
const DEFAULT_BUDGET_MS = 70000;
const MAX_SITEMAP_DEPTH = 5;

export interface CrawledPageRow {
  url: string;
  status: number;
  title: string | null;
  titleLength: number;
  metaDescriptionLength: number;
  h1Count: number;
  wordCount: number;
  canonical: string | null;
  noindex: boolean;
  hasJsonLd: boolean;
  schemaTypes: string[];
  imageCount: number;
  imagesMissingAlt: number;
  internalLinkCount: number;
  externalLinkCount: number;
  responseTimeMs: number;
  redirected: boolean;
}

export interface SiteCrawlOptions {
  maxPages?: number;
  concurrency?: number;
  pageTimeoutMs?: number;
  budgetMs?: number;
}

export interface SiteCrawlOutcome {
  pages: CrawledPageRow[];
  discoveredCount: number;
  robotsUrl: string;
  sitemapUrl: string | null;
  warnings: string[];
  timedOut: boolean;
  /** The site answered 429/503 at least once; crawl slowed down (or stopped) to respect it. */
  rateLimited: boolean;
  /** A WAF bot challenge (e.g. Cloudflare cf-mitigated) blocked the crawler; we stop rather than evade it. */
  botBlocked: boolean;
}

/**
 * WAF bot-challenge responses (Cloudflare managed challenge, etc.). These
 * mean "prove you're a browser" — we never try to get around them; the crawl
 * stops and the client is told to allowlist the crawler instead.
 */
export function isBotChallenge(res: Response): boolean {
  if (res.status !== 403 && res.status !== 503) return false;
  if (res.headers.get('cf-mitigated')?.toLowerCase() === 'challenge') return true;
  return Boolean(res.headers.get('x-datadome') || res.headers.get('x-px-blocked'));
}

/** Retry-After header → milliseconds (seconds or HTTP-date form), null if absent/invalid. */
export function parseRetryAfter(value: string | null): number | null {
  if (!value) return null;
  const secs = Number(value.trim());
  if (Number.isFinite(secs) && secs >= 0) return secs * 1000;
  const at = Date.parse(value);
  return Number.isNaN(at) ? null : Math.max(0, at - Date.now());
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------------------ */
/* URL helpers                                                         */
/* ------------------------------------------------------------------ */

function ensureProtocol(input: string) {
  return /^https?:\/\//i.test(input) ? input : `https://${input}`;
}

export function normalizeCrawlUrl(input: string): string {
  const url = new URL(ensureProtocol(input.trim()));
  url.hash = '';
  if (url.pathname.length > 1 && url.pathname.endsWith('/')) {
    url.pathname = url.pathname.slice(0, -1);
  }
  return url.toString();
}

export function sameHost(a: string, b: string): boolean {
  try {
    return new URL(a).hostname.replace(/^www\./, '').toLowerCase() ===
      new URL(b).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return false;
  }
}

/** URLs that aren't real HTML pages and would pollute the crawl. */
export function looksLikeHtmlPage(url: string): boolean {
  try {
    const path = new URL(url).pathname.toLowerCase();
    return !/\.(xml|json|txt|md|markdown|csv|ya?ml|rss|atom|jpe?g|jpg|png|gif|webp|svg|ico|bmp|tiff?|pdf|css|js|mjs|mp4|webm|mov|avi|mp3|wav|zip|rar|7z|gz|doc|docx|xls|xlsx|ppt|pptx|woff2?|ttf|eot)$/.test(path);
  } catch {
    return false;
  }
}

function safeAbsolute(base: string, candidate: string): string | null {
  try {
    const abs = new URL(candidate, base);
    if (abs.protocol !== 'http:' && abs.protocol !== 'https:') return null;
    return normalizeCrawlUrl(abs.toString());
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* robots.txt — hand-written Disallow/Allow matcher (no robots-parser) */
/* ------------------------------------------------------------------ */

interface RobotsRule {
  path: string;
  allow: boolean;
}

export interface RobotsInfo {
  rules: RobotsRule[];
  sitemapUrls: string[];
}

/**
 * Minimal robots.txt parser: collects rules that apply to `*` (we don't send
 * a distinctive crawler token the target would list specifically) under any
 * User-agent block containing `*`, plus any Sitemap: lines (which apply
 * regardless of user-agent group).
 */
export function parseRobotsTxt(text: string): RobotsInfo {
  const rules: RobotsRule[] = [];
  const sitemapUrls: string[] = [];
  let inWildcardGroup = false;
  let sawAnyUserAgent = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();

    if (key === 'sitemap') {
      if (value) sitemapUrls.push(value);
      continue;
    }

    if (key === 'user-agent') {
      // A new user-agent line starts a new group unless directly chained
      // after another user-agent line (multiple agents sharing one group).
      if (!sawAnyUserAgent || inWildcardGroup === undefined) {
        // no-op, handled below
      }
      sawAnyUserAgent = true;
      inWildcardGroup = value === '*' || inWildcardGroup === true && false;
      // Track wildcard membership per-group; re-evaluate cleanly:
      inWildcardGroup = value.trim() === '*';
      continue;
    }

    if ((key === 'disallow' || key === 'allow') && inWildcardGroup) {
      if (value === '') {
        // Empty Disallow means "allow everything" per spec.
        if (key === 'disallow') continue;
      }
      rules.push({ path: value, allow: key === 'allow' });
    }
  }

  return { rules, sitemapUrls };
}

/** robots.txt path patterns support a trailing `*` wildcard and `$` end-anchor. */
function pathMatches(pattern: string, pathname: string): boolean {
  if (!pattern) return false;
  const endAnchored = pattern.endsWith('$');
  const base = endAnchored ? pattern.slice(0, -1) : pattern;
  const escaped = base
    .split('*')
    .map((chunk) => chunk.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
    .join('.*');
  const re = new RegExp(`^${escaped}${endAnchored ? '$' : ''}`);
  return re.test(pathname);
}

export function isAllowedByRobots(robots: RobotsInfo, url: string): boolean {
  let path: string;
  try {
    const u = new URL(url);
    path = u.pathname + u.search;
  } catch {
    return true;
  }

  // Most specific (longest) matching rule wins; ties prefer Allow.
  let winner: RobotsRule | null = null;
  for (const rule of robots.rules) {
    if (!pathMatches(rule.path, path)) continue;
    if (!winner || rule.path.length > winner.path.length || (rule.path.length === winner.path.length && rule.allow && !winner.allow)) {
      winner = rule;
    }
  }
  return winner ? winner.allow : true;
}

async function fetchRobots(origin: string): Promise<{ robotsUrl: string; info: RobotsInfo }> {
  const robotsUrl = `${origin}/robots.txt`;
  try {
    const res = await fetch(robotsUrl, {
      redirect: 'follow',
      headers: { 'user-agent': USER_AGENT },
      signal: AbortSignal.timeout(DEFAULT_PAGE_TIMEOUT_MS),
    });
    if (!res.ok) return { robotsUrl, info: { rules: [], sitemapUrls: [] } };
    const text = await res.text();
    return { robotsUrl, info: parseRobotsTxt(text) };
  } catch {
    return { robotsUrl, info: { rules: [], sitemapUrls: [] } };
  }
}

/* ------------------------------------------------------------------ */
/* Sitemap discovery — XML parsed with cheerio xmlMode                */
/* ------------------------------------------------------------------ */

async function readSitemapDocument(url: string): Promise<{ pageUrls: string[]; childSitemaps: string[] }> {
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: { 'user-agent': USER_AGENT },
      signal: AbortSignal.timeout(DEFAULT_PAGE_TIMEOUT_MS),
    });
    if (!res.ok) return { pageUrls: [], childSitemaps: [] };
    const xml = await res.text();
    const $x = cheerio.load(xml, { xmlMode: true });
    const isIndex = $x('sitemapindex').length > 0;

    if (isIndex) {
      const childSitemaps: string[] = [];
      $x('sitemap > loc').each((_, el) => {
        const loc = $x(el).text().trim();
        if (loc) childSitemaps.push(loc);
      });
      return { pageUrls: [], childSitemaps };
    }

    const pageUrls: string[] = [];
    $x('url > loc').each((_, el) => {
      const loc = $x(el).text().trim();
      if (loc) pageUrls.push(loc);
    });
    // Fall back to any <loc> if the urlset/url wrapper wasn't matched exactly.
    if (pageUrls.length === 0) {
      $x('loc').each((_, el) => {
        const loc = $x(el).text().trim();
        if (loc) pageUrls.push(loc);
      });
    }
    return { pageUrls, childSitemaps: [] };
  } catch {
    return { pageUrls: [], childSitemaps: [] };
  }
}

async function discoverSitemapUrls(
  origin: string,
  robotsSitemaps: string[],
): Promise<{ urls: string[]; primarySitemapUrl: string | null }> {
  const candidates = [
    ...robotsSitemaps,
    `${origin}/sitemap.xml`,
    `${origin}/sitemap_index.xml`,
  ];

  const visited = new Set<string>();
  const discovered = new Set<string>();
  let primarySitemapUrl: string | null = null;

  async function visit(sitemapUrl: string, depth: number): Promise<void> {
    let normalized: string;
    try {
      normalized = normalizeCrawlUrl(sitemapUrl);
    } catch {
      return;
    }
    if (visited.has(normalized) || depth > MAX_SITEMAP_DEPTH) return;
    visited.add(normalized);

    const { pageUrls, childSitemaps } = await readSitemapDocument(normalized);
    if (pageUrls.length > 0 || childSitemaps.length > 0) {
      primarySitemapUrl = primarySitemapUrl ?? normalized;
    }
    for (const u of pageUrls) discovered.add(u);
    if (childSitemaps.length > 0) {
      // Cap fan-out so a huge sitemap index can't blow the time budget.
      await Promise.all(childSitemaps.slice(0, 25).map((child) => visit(child, depth + 1)));
    }
  }

  await Promise.all(candidates.map((c) => visit(c, 0)));
  return { urls: [...discovered], primarySitemapUrl };
}

/* ------------------------------------------------------------------ */
/* Bounded-concurrency pool                                            */
/* ------------------------------------------------------------------ */

async function runPool<T>(tasks: Array<() => Promise<T>>, concurrency: number): Promise<void> {
  const executing = new Set<Promise<void>>();
  for (const task of tasks) {
    const p = task().then(() => undefined).finally(() => executing.delete(p));
    executing.add(p);
    if (executing.size >= concurrency) {
      await Promise.race(executing);
    }
  }
  await Promise.all(executing);
}

/* ------------------------------------------------------------------ */
/* Page fetch + capture                                                */
/* ------------------------------------------------------------------ */

function collectSchemaTypes($: cheerio.CheerioAPI): string[] {
  const types = new Set<string>();
  $('script[type="application/ld+json"]').each((_, node) => {
    const raw = $(node).text().trim();
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      const values = Array.isArray(parsed) ? parsed : [parsed];
      for (const entry of values) {
        const t = (entry as Record<string, unknown>)?.['@type'];
        if (typeof t === 'string') types.add(t);
        else if (Array.isArray(t)) t.forEach((x) => typeof x === 'string' && types.add(x));
      }
    } catch {
      /* ignore malformed JSON-LD */
    }
  });
  return [...types];
}

async function fetchAndCapture(
  url: string,
  targetHost: string,
  pageTimeoutMs: number,
): Promise<{ row: CrawledPageRow; internalLinks: string[] } | { error: string } | { throttled: true; retryAfterMs: number | null } | { blocked: true }> {
  const started = Date.now();
  let res: Response;
  try {
    res = await fetch(url, {
      redirect: 'follow',
      headers: { 'user-agent': USER_AGENT },
      signal: AbortSignal.timeout(pageTimeoutMs),
    });
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'fetch failed' };
  }

  const responseTimeMs = Date.now() - started;
  const finalUrl = normalizeCrawlUrl(res.url || url);
  const redirected = finalUrl !== normalizeCrawlUrl(url);
  const contentType = res.headers.get('content-type') ?? '';

  if (isBotChallenge(res)) return { blocked: true };

  // 429 / 503 = the site is throttling US. That's not a site defect — never
  // record it as a page row (it used to surface as a false CLIENT_ERROR).
  if (res.status === 429 || res.status === 503) {
    return { throttled: true, retryAfterMs: parseRetryAfter(res.headers.get('retry-after')) };
  }

  if (!res.ok) {
    return {
      row: {
        url: finalUrl,
        status: res.status,
        title: null,
        titleLength: 0,
        metaDescriptionLength: 0,
        h1Count: 0,
        wordCount: 0,
        canonical: null,
        noindex: false,
        hasJsonLd: false,
        schemaTypes: [],
        imageCount: 0,
        imagesMissingAlt: 0,
        internalLinkCount: 0,
        externalLinkCount: 0,
        responseTimeMs,
        redirected,
      },
      internalLinks: [],
    };
  }

  if (!contentType.includes('text/html')) {
    return { error: 'non-html content-type' };
  }

  const html = await res.text();
  const $ = cheerio.load(html);

  const title = ($('head > title').first().text() || $('title').first().text()).replace(/\s+/g, ' ').trim();
  const metaDescription = ($('meta[name="description"]').attr('content') || '').replace(/\s+/g, ' ').trim();
  const canonical = $('link[rel="canonical"]').attr('href')?.trim() || null;
  const robotsMeta = $('meta[name="robots"]').attr('content')?.toLowerCase() || '';
  const noindex = robotsMeta.includes('noindex');
  const hasJsonLd = $('script[type="application/ld+json"]').length > 0;
  const schemaTypes = collectSchemaTypes($);

  const images = $('img');
  const imageCount = images.length;
  const imagesMissingAlt = images.filter((_, el) => !$(el).attr('alt')?.trim()).length;

  const anchors = $('a[href]')
    .map((_, el) => $(el).attr('href'))
    .get()
    .map((href) => safeAbsolute(finalUrl, href ?? ''))
    .filter((href): href is string => Boolean(href));

  const internalLinks = anchors.filter((href) => sameHost(href, targetHost));
  const externalLinks = anchors.filter((href) => !sameHost(href, targetHost));

  $('script, style, noscript').remove();
  const h1Count = $('h1').length;
  const wordCount = $('body').text().replace(/\s+/g, ' ').trim().split(' ').filter(Boolean).length;

  return {
    row: {
      url: finalUrl,
      status: res.status,
      title: title || null,
      titleLength: title.length,
      metaDescriptionLength: metaDescription.length,
      h1Count,
      wordCount,
      canonical,
      noindex,
      hasJsonLd,
      schemaTypes,
      imageCount,
      imagesMissingAlt,
      internalLinkCount: internalLinks.length,
      externalLinkCount: externalLinks.length,
      responseTimeMs,
      redirected,
    },
    internalLinks: [...new Set(internalLinks)],
  };
}

/* ------------------------------------------------------------------ */
/* Public entry point                                                  */
/* ------------------------------------------------------------------ */

/**
 * Crawls a site starting from its sitemap (falling back to link discovery
 * from crawled pages), respecting robots.txt, staying on the same host, and
 * bounded by page count, concurrency, per-page timeout, and overall wall
 * clock. Never throws — always returns whatever was gathered.
 */
export async function crawlSite(targetUrl: string, options: SiteCrawlOptions = {}): Promise<SiteCrawlOutcome> {
  const maxPages = options.maxPages ?? DEFAULT_MAX_PAGES;
  let concurrency = options.concurrency ?? DEFAULT_CONCURRENCY;
  const pageTimeoutMs = options.pageTimeoutMs ?? DEFAULT_PAGE_TIMEOUT_MS;
  const budgetMs = options.budgetMs ?? DEFAULT_BUDGET_MS;
  const deadline = Date.now() + budgetMs;

  const warnings: string[] = [];
  const normalizedTarget = normalizeCrawlUrl(targetUrl);
  const origin = new URL(normalizedTarget).origin;

  const { robotsUrl, info: robots } = await fetchRobots(origin);
  const { urls: sitemapUrls, primarySitemapUrl } = await discoverSitemapUrls(origin, robots.sitemapUrls).catch(() => ({
    urls: [] as string[],
    primarySitemapUrl: null as string | null,
  }));

  const visited = new Set<string>();
  const discovered = new Set<string>();
  const pages: CrawledPageRow[] = [];

  const queue: string[] = [normalizedTarget];
  for (const u of sitemapUrls) {
    if (sameHost(u, normalizedTarget) && looksLikeHtmlPage(u)) {
      const n = safeAbsolute(normalizedTarget, u);
      if (n) queue.push(n);
    }
  }

  let timedOut = false;
  let rateLimited = false;
  let botBlocked = false;
  let throttleHits = 0;
  let pauseMs = 0;
  const retried = new Set<string>();

  while (queue.length > 0 && pages.length < maxPages) {
    if (Date.now() >= deadline) {
      timedOut = true;
      warnings.push(`Crawl stopped after budget (${budgetMs}ms) with ${pages.length} page(s) captured.`);
      break;
    }

    if (botBlocked) break;
    if (throttleHits >= MAX_THROTTLE_HITS) {
      warnings.push(`Crawl stopped: site kept rate-limiting (HTTP 429/503) after ${throttleHits} attempts — ${pages.length} page(s) captured.`);
      break;
    }
    if (pauseMs > 0) {
      if (Date.now() + pauseMs >= deadline) {
        timedOut = true;
        warnings.push(`Crawl stopped: rate-limit backoff would exceed the time budget — ${pages.length} page(s) captured.`);
        break;
      }
      await sleep(pauseMs);
      pauseMs = 0;
    } else if (pages.length > 0) {
      await sleep(BATCH_DELAY_MS);
    }

    const remaining = maxPages - pages.length;
    const batch = queue.splice(0, Math.min(concurrency, remaining));
    const uniqueBatch = batch.filter((url) => {
      if (visited.has(url)) return false;
      visited.add(url);
      return true;
    });
    if (uniqueBatch.length === 0) continue;

    const tasks = uniqueBatch.map((current) => async () => {
      if (!looksLikeHtmlPage(current)) return;
      if (!isAllowedByRobots(robots, current)) {
        warnings.push(`Skipped ${current} due to robots.txt restrictions.`);
        return;
      }

      const remainingBudget = deadline - Date.now();
      if (remainingBudget <= 0) return;

      const result = await fetchAndCapture(current, normalizedTarget, Math.min(pageTimeoutMs, Math.max(remainingBudget, 1000)));
      if ('blocked' in result) {
        botBlocked = true;
        return;
      }
      if ('throttled' in result) {
        rateLimited = true;
        throttleHits++;
        // Exponential backoff honoring Retry-After; halve concurrency; retry
        // each throttled URL once.
        const backoff = Math.min(MAX_BACKOFF_MS, Math.max(result.retryAfterMs ?? 0, 1000 * 2 ** (throttleHits - 1)));
        pauseMs = Math.max(pauseMs, result.retryAfterMs === 0 ? 0 : backoff);
        concurrency = Math.max(1, Math.floor(concurrency / 2));
        if (!retried.has(current)) {
          retried.add(current);
          visited.delete(current);
          queue.unshift(current);
        }
        return;
      }
      if ('error' in result) {
        warnings.push(`Failed to fetch ${current}: ${result.error}`);
        return;
      }

      discovered.add(result.row.url);
      pages.push(result.row);

      for (const link of result.internalLinks) {
        discovered.add(link);
        if (!visited.has(link) && looksLikeHtmlPage(link) && queue.length + pages.length < maxPages * 3) {
          queue.push(link);
        }
      }
    });

    await runPool(tasks, concurrency);
  }

  if (pages.length >= maxPages) {
    warnings.push(`Crawl capped at ${maxPages} pages.`);
  }

  if (botBlocked) {
    warnings.push(`Crawl stopped: the site's bot protection (WAF challenge) blocked the crawler after ${pages.length} page(s). Ask the site owner to allowlist the SEOAuditBot user agent.`);
  }

  return {
    pages,
    discoveredCount: discovered.size,
    robotsUrl,
    sitemapUrl: primarySitemapUrl,
    warnings: rateLimited && !warnings.some((w) => /rate-limit/i.test(w))
      ? [...warnings, 'Site rate-limited the crawler (HTTP 429/503); crawl slowed down to respect it.']
      : warnings,
    timedOut,
    rateLimited,
    botBlocked,
  };
}
