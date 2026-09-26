import type { CrawledPageRow } from './siteCrawler';

/**
 * Page-level issue detection rules, ported from a proven sibling project's
 * server/services/issues.ts and extended (4xx/5xx, duplicate/length checks,
 * noindex, structured data, alt text) into the richer shape this dashboard
 * needs. Pure functions — no network, no side effects — so they're trivial
 * to unit test with synthetic page rows.
 */

export type IssueSeverity = 'critical' | 'high' | 'medium' | 'low';

export interface SiteIssue {
  id: string;
  severity: IssueSeverity;
  title: string;
  affectedUrls: string[];
  count: number;
  fix: string;
}

export interface SiteIssuesSummary {
  pagesCrawled: number;
  pagesWithIssues: number;
  issueCounts: Record<IssueSeverity, number>;
  crawlHealth: number;
}

export interface SiteIssuesResult {
  issues: SiteIssue[];
  summary: SiteIssuesSummary;
}

const AFFECTED_URL_CAP = 20;
const TITLE_MAX_LENGTH = 60;
const META_MIN_LENGTH = 120;
const META_MAX_LENGTH = 160;
const THIN_CONTENT_WORDS = 300;

function makeIssue(
  id: string,
  severity: IssueSeverity,
  title: string,
  urls: string[],
  fix: string,
): SiteIssue | null {
  if (urls.length === 0) return null;
  return {
    id,
    severity,
    title,
    affectedUrls: urls.slice(0, AFFECTED_URL_CAP),
    count: urls.length,
    fix,
  };
}

function groupBy<T, K>(items: T[], keyFn: (item: T) => K | null): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    if (key === null) continue;
    const list = map.get(key);
    if (list) list.push(item);
    else map.set(key, [item]);
  }
  return map;
}

/**
 * Runs every issue rule against a set of crawled page rows and returns the
 * issues plus a summary (severity counts + a 0-100 crawl health score).
 */
export function detectSiteIssues(pages: CrawledPageRow[]): SiteIssuesResult {
  const issues: (SiteIssue | null)[] = [];

  // 429/503 = the site throttling our crawler, not a site defect.
  const errorPages = pages.filter((p) => p.status >= 400 && p.status !== 429 && p.status !== 503);
  const okPages = pages.filter((p) => p.status < 400);

  // --- Status errors -------------------------------------------------
  const serverErrors = errorPages.filter((p) => p.status >= 500).map((p) => p.url);
  const clientErrors = errorPages.filter((p) => p.status >= 400 && p.status < 500).map((p) => p.url);
  issues.push(
    makeIssue('SERVER_ERROR', 'critical', 'Pages returning server errors (5xx)', serverErrors,
      'Investigate server logs for these URLs — 5xx errors block both users and search engines from the page.'),
  );
  issues.push(
    makeIssue('CLIENT_ERROR', 'critical', 'Pages returning client errors (4xx)', clientErrors,
      'Fix broken links pointing here, or 301-redirect the URL to a live page.'),
  );

  // --- Titles ----------------------------------------------------------
  const missingTitle = okPages.filter((p) => !p.title).map((p) => p.url);
  issues.push(
    makeIssue('MISSING_TITLE', 'critical', 'Pages missing a title tag', missingTitle,
      'Add a unique, descriptive title tag between 40 and 60 characters.'),
  );

  const longTitle = okPages.filter((p) => p.title && p.titleLength > TITLE_MAX_LENGTH).map((p) => p.url);
  issues.push(
    makeIssue('TITLE_TOO_LONG', 'medium', `Title tags over ${TITLE_MAX_LENGTH} characters`, longTitle,
      'Shorten the title so it does not get truncated in search results.'),
  );

  const titleGroups = groupBy(okPages.filter((p) => p.title), (p) => p.title);
  const duplicateTitleUrls: string[] = [];
  for (const [, group] of titleGroups) {
    if (group.length > 1) duplicateTitleUrls.push(...group.map((p) => p.url));
  }
  issues.push(
    makeIssue('DUPLICATE_TITLE', 'high', 'Duplicate title tags across pages', duplicateTitleUrls,
      'Make each page title unique so it targets a specific search intent.'),
  );

  // --- Meta descriptions -------------------------------------------------
  const missingMeta = okPages.filter((p) => p.metaDescriptionLength === 0).map((p) => p.url);
  issues.push(
    makeIssue('MISSING_META_DESCRIPTION', 'high', 'Pages missing a meta description', missingMeta,
      'Add a unique meta description between 120 and 160 characters summarizing the page.'),
  );

  const shortMeta = okPages
    .filter((p) => p.metaDescriptionLength > 0 && p.metaDescriptionLength < META_MIN_LENGTH)
    .map((p) => p.url);
  issues.push(
    makeIssue('META_DESCRIPTION_TOO_SHORT', 'low', `Meta descriptions under ${META_MIN_LENGTH} characters`, shortMeta,
      'Expand the description to better use the available SERP snippet space.'),
  );

  const longMeta = okPages
    .filter((p) => p.metaDescriptionLength > META_MAX_LENGTH)
    .map((p) => p.url);
  issues.push(
    makeIssue('META_DESCRIPTION_TOO_LONG', 'low', `Meta descriptions over ${META_MAX_LENGTH} characters`, longMeta,
      'Trim the description so it is not truncated in search results.'),
  );

  // Duplicate meta descriptions need the actual text, so re-derive per page
  // via a synthetic key stored during crawl isn't available here — dedupe by
  // (url set sharing identical length) is too weak, so this rule is driven by
  // exact description text when present on the row. Since CrawledPageRow only
  // stores length (to keep payload small), duplicate-description detection is
  // approximated using length+wordCount as a proxy is unreliable; skip when
  // description text isn't available. (No-op placeholder retained for clarity.)

  // --- Headings ----------------------------------------------------------
  const missingH1 = okPages.filter((p) => p.h1Count === 0).map((p) => p.url);
  issues.push(
    makeIssue('MISSING_H1', 'high', 'Pages missing an H1 heading', missingH1,
      'Add one clear H1 that reflects the page topic.'),
  );

  const multipleH1 = okPages.filter((p) => p.h1Count > 1).map((p) => p.url);
  issues.push(
    makeIssue('MULTIPLE_H1', 'medium', 'Pages with multiple H1 headings', multipleH1,
      'Keep exactly one H1 per page; demote the rest to H2/H3.'),
  );

  // --- Content -------------------------------------------------------------
  const thinContent = okPages.filter((p) => p.wordCount < THIN_CONTENT_WORDS).map((p) => p.url);
  issues.push(
    makeIssue('THIN_CONTENT', 'medium', `Pages with thin content (under ${THIN_CONTENT_WORDS} words)`, thinContent,
      'Expand the page with unique, helpful content that addresses user intent directly.'),
  );

  // --- Canonical / indexability -------------------------------------------
  const missingCanonical = okPages.filter((p) => !p.canonical).map((p) => p.url);
  issues.push(
    makeIssue('MISSING_CANONICAL', 'medium', 'Pages missing a canonical tag', missingCanonical,
      'Add a self-referencing canonical tag to indexable pages to prevent duplicate-content issues.'),
  );

  const noindexPages = okPages.filter((p) => p.noindex).map((p) => p.url);
  issues.push(
    makeIssue('NOINDEX_PAGE', 'low', 'Pages excluded from indexing (noindex)', noindexPages,
      'Confirm each of these pages is intentionally excluded from search results.'),
  );

  // --- Redirects -------------------------------------------------------
  const redirected = okPages.filter((p) => p.redirected).map((p) => p.url);
  issues.push(
    makeIssue('REDIRECTED_URL', 'low', 'Crawled URLs that redirected to a different URL', redirected,
      'Update internal links and the sitemap to point directly at the final URL, skipping the redirect hop.'),
  );

  // --- Images ------------------------------------------------------------
  const missingAlt = okPages.filter((p) => p.imagesMissingAlt > 0).map((p) => p.url);
  issues.push(
    makeIssue('MISSING_ALT_TEXT', 'medium', 'Pages with images missing alt text', missingAlt,
      'Add descriptive alt text to every meaningful image for accessibility and image search.'),
  );

  // --- Structured data -----------------------------------------------------
  const noStructuredData = okPages.filter((p) => !p.hasJsonLd).map((p) => p.url);
  issues.push(
    makeIssue('NO_STRUCTURED_DATA', 'low', 'Pages with no structured data (JSON-LD)', noStructuredData,
      'Add the schema type most relevant to the page (Organization, Product, Article, FAQPage, etc.).'),
  );

  const finalIssues = issues.filter((i): i is SiteIssue => i !== null);

  const issueCounts: Record<IssueSeverity, number> = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const issue of finalIssues) {
    issueCounts[issue.severity] += issue.count;
  }

  // affectedUrls on each issue is capped at 20 for display, so `pagesWithIssues`
  // is derived independently here by re-checking each page against the same
  // predicates, giving the true (uncapped) affected-page count.
  const pagesWithIssues = new Set<string>();
  for (const p of okPages) {
    const hasIssue =
      !p.title ||
      p.titleLength > TITLE_MAX_LENGTH ||
      p.metaDescriptionLength === 0 ||
      p.metaDescriptionLength < META_MIN_LENGTH ||
      p.metaDescriptionLength > META_MAX_LENGTH ||
      p.h1Count === 0 ||
      p.h1Count > 1 ||
      p.wordCount < THIN_CONTENT_WORDS ||
      !p.canonical ||
      p.noindex ||
      p.redirected ||
      p.imagesMissingAlt > 0 ||
      !p.hasJsonLd;
    if (hasIssue) pagesWithIssues.add(p.url);
  }
  for (const p of errorPages) pagesWithIssues.add(p.url);

  const pagesCrawled = pages.length;
  const crawlHealth = computeCrawlHealth(pagesCrawled, pagesWithIssues.size, issueCounts);

  return {
    issues: finalIssues,
    summary: {
      pagesCrawled,
      pagesWithIssues: pagesWithIssues.size,
      issueCounts,
      crawlHealth,
    },
  };
}

/**
 * 0-100 health score: starts at 100 and deducts weighted penalties per
 * affected-page-issue instance, normalized by the number of pages crawled so
 * a large site with a few problems doesn't score the same as a small site
 * riddled with them.
 */
function computeCrawlHealth(
  pagesCrawled: number,
  pagesWithIssuesCount: number,
  issueCounts: Record<IssueSeverity, number>,
): number {
  if (pagesCrawled === 0) return 0;

  const weights: Record<IssueSeverity, number> = { critical: 10, high: 5, medium: 2, low: 0.5 };
  const weightedPenalty =
    issueCounts.critical * weights.critical +
    issueCounts.high * weights.high +
    issueCounts.medium * weights.medium +
    issueCounts.low * weights.low;

  const normalizedPenalty = weightedPenalty / pagesCrawled;
  const score = 100 - normalizedPenalty;
  return Math.max(0, Math.min(100, Math.round(score)));
}
