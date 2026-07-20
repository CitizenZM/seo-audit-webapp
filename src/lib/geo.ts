import * as cheerio from 'cheerio';

/**
 * GEO — Generative Engine Optimization (#GEO).
 *
 * Where classic SEO asks "will Google rank this page?", GEO asks "can ChatGPT,
 * Perplexity, Claude, and Google's AI Overviews actually read, trust, and cite
 * this page?". This module checks the signals those engines depend on, modeled
 * on what AI-visibility tools (Profound, Otterly, etc.) surface:
 *
 *  1. AI crawler access — does robots.txt let the major AI bots in at all?
 *     (The #1 GEO failure: a blanket block of GPTBot/ClaudeBot makes a site
 *     invisible to that engine no matter how good the content is.)
 *  2. llms.txt — the emerging llmstxt.org standard for guiding LLMs.
 *  3. Answerable content — question-style headings / FAQ blocks that LLMs
 *     extract cleanly.
 *  4. AI-friendly structured data — FAQPage / Article / HowTo / Product /
 *     Organization JSON-LD gives engines machine-readable facts.
 *  5. Freshness — a visible/structured "last updated" date; AI answers favor
 *     recent sources.
 *  6. No-JS content — most AI crawlers don't execute JavaScript, so content
 *     that only appears after hydration is invisible to them.
 */

// The AI crawlers worth reporting on, grouped by the engine they feed.
export const AI_BOTS: { name: string; engine: string }[] = [
  { name: 'GPTBot', engine: 'ChatGPT (training)' },
  { name: 'OAI-SearchBot', engine: 'ChatGPT Search' },
  { name: 'ChatGPT-User', engine: 'ChatGPT (browsing)' },
  { name: 'ClaudeBot', engine: 'Claude (training)' },
  { name: 'Claude-Web', engine: 'Claude (browsing)' },
  { name: 'PerplexityBot', engine: 'Perplexity' },
  { name: 'Google-Extended', engine: 'Google Gemini / AI Overviews' },
  { name: 'Applebot-Extended', engine: 'Apple Intelligence' },
  { name: 'CCBot', engine: 'Common Crawl (feeds many LLMs)' },
  { name: 'Bytespider', engine: 'TikTok / Doubao' },
  { name: 'Amazonbot', engine: 'Amazon (Alexa / shopping agents)' },
  { name: 'Google-CloudVertexBot', engine: 'Google Vertex AI agents' },
];

/** Bots that specifically matter for agentic-commerce / AI-shopping-agent access. */
const COMMERCE_BOTS = ['GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'Amazonbot', 'Google-CloudVertexBot', 'PerplexityBot'];

export interface BotAccess {
  name: string;
  engine: string;
  allowed: boolean;
}

export interface GeoResult {
  score: number;
  botAccess: BotAccess[];
  botsAllowed: number;
  botsTotal: number;
  hasLlmsTxt: boolean;
  answerableHeadings: number;
  aiSchemaTypes: string[];
  hasFreshnessSignal: boolean;
  freshnessDate: string | null;
  noJsContentWords: number;
  noJsContentOk: boolean;
  recommendations: string[];
  commerce?: CommerceReadiness;
}

/**
 * Agentic-commerce readiness — can an AI shopping agent (ChatGPT Shopping,
 * Amazon's Rufus/agents, Perplexity Shopping, Gemini agents) actually parse
 * this page as a product and complete/assist a purchase decision?
 */
export interface CommerceCheck {
  id: string;
  label: string;
  passed: boolean;
  detail: string;
  impact: 'high' | 'medium' | 'low';
}

export interface CommerceReadiness {
  score: number;
  checks: CommerceCheck[];
}

export interface CommerceReadinessInput {
  html: string;
  schemaTypes: string[];
  robotsTxt?: string;
  origin: string;
}

/** Does any JSON-LD node of the given @type carry a non-empty value for `key`? */
function schemaHasField($: cheerio.CheerioAPI, types: string[], key: string): boolean {
  let found = false;
  $('script[type="application/ld+json"]').each((_, el) => {
    if (found) return;
    try {
      const raw = JSON.parse($(el).text());
      const nodes = Array.isArray(raw) ? raw : (raw as Record<string, unknown>)['@graph'] ?? [raw];
      for (const node of ([] as unknown[]).concat(nodes as never)) {
        const n = node as Record<string, unknown>;
        const nodeType = n?.['@type'];
        const typeMatches = Array.isArray(nodeType)
          ? nodeType.some((t) => types.includes(String(t)))
          : typeof nodeType === 'string' && types.includes(nodeType);
        if (!typeMatches) continue;
        // Direct field, or nested under offers/aggregateRating/review.
        if (n[key] !== undefined && n[key] !== null && n[key] !== '') { found = true; break; }
        const offers = n['offers'];
        const offerNodes = Array.isArray(offers) ? offers : offers ? [offers] : [];
        for (const o of offerNodes) {
          const ov = (o as Record<string, unknown>)?.[key];
          if (ov !== undefined && ov !== null && ov !== '') { found = true; break; }
        }
      }
    } catch { /* ignore */ }
  });
  return found;
}

/** Pure scoring of agentic-commerce parseability. No network calls — reuses data the caller already has. */
export function analyzeCommerceReadiness({ html, schemaTypes, robotsTxt, origin }: CommerceReadinessInput): CommerceReadiness {
  const $ = cheerio.load(html);

  const hasProductSchema = schemaTypes.includes('Product');
  const hasOfferSchema = schemaTypes.includes('Offer') || schemaHasField($, ['Product'], 'offers');
  const hasAggregateRating = schemaTypes.includes('AggregateRating') || schemaHasField($, ['Product'], 'aggregateRating');
  const hasReview = schemaTypes.includes('Review') || schemaHasField($, ['Product'], 'review');
  const hasPrice = schemaHasField($, ['Product', 'Offer'], 'price');
  const hasAvailability = schemaHasField($, ['Product', 'Offer'], 'availability');

  // Agent-friction signals: things that block a JS-less/no-interaction crawler.
  const bodyHtml = $('body').html() || '';
  const hasCaptchaMarker = /(recaptcha|hcaptcha|cf-turnstile|captcha)/i.test(bodyHtml)
    || $('meta[name="captcha"]').length > 0;
  const noscriptTags = $('noscript');
  let noscriptOnlyContent = false;
  if (noscriptTags.length > 0) {
    const bodyText = $('body').clone().find('script, style, noscript').remove().end().text().replace(/\s+/g, ' ').trim();
    noscriptOnlyContent = bodyText.length < 100; // main body nearly empty outside <noscript>
  }
  const hasLoginWall = /(please log ?in|sign in to (view|continue|see)|members? only|create an account to)/i.test(
    $('body').text(),
  );

  const checks: CommerceCheck[] = [
    {
      id: 'product-schema',
      label: 'Product schema present',
      passed: hasProductSchema,
      detail: hasProductSchema ? 'Product JSON-LD found.' : 'No Product @type in structured data — agents cannot identify this as a product page.',
      impact: 'high',
    },
    {
      id: 'offer-schema',
      label: 'Offer schema present',
      passed: hasOfferSchema,
      detail: hasOfferSchema ? 'Offer data found.' : 'No Offer schema — price/availability not machine-readable.',
      impact: 'high',
    },
    {
      id: 'price-visible',
      label: 'Price in structured data',
      passed: hasPrice,
      detail: hasPrice ? 'Price present in schema.' : 'No price field found in Product/Offer schema.',
      impact: 'high',
    },
    {
      id: 'availability-markup',
      label: 'Availability markup present',
      passed: hasAvailability,
      detail: hasAvailability ? 'Availability field present.' : 'No availability (InStock/OutOfStock) markup — agents cannot confirm purchasability.',
      impact: 'medium',
    },
    {
      id: 'aggregate-rating',
      label: 'AggregateRating schema present',
      passed: hasAggregateRating,
      detail: hasAggregateRating ? 'AggregateRating found.' : 'No AggregateRating schema — agents cannot cite a trust signal.',
      impact: 'medium',
    },
    {
      id: 'review-schema',
      label: 'Review schema present',
      passed: hasReview,
      detail: hasReview ? 'Review data found.' : 'No Review schema present.',
      impact: 'low',
    },
    {
      id: 'no-captcha-friction',
      label: 'No CAPTCHA/bot-wall markers detected',
      passed: !hasCaptchaMarker,
      detail: hasCaptchaMarker ? 'CAPTCHA/bot-check markers detected — likely to block agent crawling.' : 'No CAPTCHA markers detected in page HTML.',
      impact: 'high',
    },
    {
      id: 'no-noscript-only-content',
      label: 'Content available without JavaScript',
      passed: !noscriptOnlyContent,
      detail: noscriptOnlyContent ? 'Page body is nearly empty outside <noscript> — most shopping agents do not execute JS.' : 'Core content is present without requiring JS execution.',
      impact: 'high',
    },
    {
      id: 'no-login-wall',
      label: 'No login-wall pattern detected',
      passed: !hasLoginWall,
      detail: hasLoginWall ? 'Login/sign-in-required language detected — may block anonymous agent access.' : 'No login-wall language detected.',
      impact: 'medium',
    },
  ];

  if (robotsTxt !== undefined) {
    const blockedCommerceBots = COMMERCE_BOTS.filter((b) => !isBotAllowed(robotsTxt, b));
    checks.push({
      id: 'commerce-bots-allowed',
      label: 'Shopping-relevant AI bots allowed in robots.txt',
      passed: blockedCommerceBots.length === 0,
      detail: blockedCommerceBots.length
        ? `Blocking shopping-relevant bots: ${blockedCommerceBots.join(', ')}.`
        : 'All shopping-relevant AI bots (GPTBot, Amazonbot, Google-CloudVertexBot, etc.) are allowed.',
      impact: 'high',
    });
  }

  void origin; // reserved for future origin-relative checks (e.g. checkout URL shape)

  const weight = (impact: CommerceCheck['impact']) => (impact === 'high' ? 3 : impact === 'medium' ? 2 : 1);
  const totalWeight = checks.reduce((s, c) => s + weight(c.impact), 0);
  const earnedWeight = checks.reduce((s, c) => s + (c.passed ? weight(c.impact) : 0), 0);
  const score = totalWeight > 0 ? Math.round((earnedWeight / totalWeight) * 100) : 0;

  return { score, checks };
}

/**
 * Decide whether a given bot is allowed to crawl "/" per a robots.txt body.
 * Implements the standard longest-match rule: the most specific matching
 * User-agent group wins (an exact bot name beats "*"), and within that group
 * the longest matching path directive wins, ties going to Allow.
 */
function isBotAllowed(robotsTxt: string, botName: string): boolean {
  if (!robotsTxt) return true; // no robots.txt = nothing disallowed

  const lines = robotsTxt.split(/\r?\n/).map((l) => l.replace(/#.*$/, '').trim());
  // Collect directive groups keyed by the user-agents they apply to.
  const groups: { agents: string[]; rules: { allow: boolean; path: string }[] }[] = [];
  let current: { agents: string[]; rules: { allow: boolean; path: string }[] } | null = null;
  let lastWasAgent = false;

  for (const line of lines) {
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    const field = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();

    if (field === 'user-agent') {
      if (!lastWasAgent || !current) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
    } else if ((field === 'allow' || field === 'disallow') && current) {
      current.rules.push({ allow: field === 'allow', path: value });
      lastWasAgent = false;
    } else {
      lastWasAgent = false;
    }
  }

  const bot = botName.toLowerCase();
  // Prefer an exact-name group; fall back to the wildcard group.
  const specific = groups.find((g) => g.agents.includes(bot));
  const wildcard = groups.find((g) => g.agents.includes('*'));
  const group = specific ?? wildcard;
  if (!group) return true;

  // Longest-match wins; Allow wins ties (Google's robots semantics). We check
  // access to the site root "/". A directive matches "/" only if its pattern,
  // read as a proper robots wildcard pattern (`*` = any run of chars, trailing
  // `$` = end-anchor), matches the root — NOT via naive prefix stripping, which
  // wrongly made query-string rules like `Disallow: /*?*ls=*` match "/".
  const ROOT = '/';
  let decision = true;
  let matchLen = -1;
  for (const rule of group.rules) {
    const p = rule.path;
    if (p === '') {
      // "Disallow:" with an empty value explicitly allows everything.
      if (!rule.allow) { if (0 > matchLen) { matchLen = 0; decision = true; } }
      continue;
    }
    if (robotsPatternMatchesRoot(p) && (p.length > matchLen || (p.length === matchLen && rule.allow))) {
      matchLen = p.length;
      decision = rule.allow;
    }
  }
  void ROOT;
  return decision;
}

/** Does a robots.txt path pattern match the site root "/"? */
function robotsPatternMatchesRoot(pattern: string): boolean {
  // Convert the robots pattern to a regex: escape regex metachars, turn `*`
  // into `.*`, and honor a trailing `$` as an end-anchor. Robots patterns are
  // prefix matches unless `$`-anchored.
  const endAnchored = pattern.endsWith('$');
  const body = endAnchored ? pattern.slice(0, -1) : pattern;
  const regexStr = '^' + body
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&') // escape regex specials (keep `*`)
    .replace(/\*/g, '.*') + (endAnchored ? '$' : '');
  try {
    return new RegExp(regexStr).test('/');
  } catch {
    return false;
  }
}

/** Count headings that read like questions an LLM could answer/cite. */
function countAnswerableHeadings($: cheerio.CheerioAPI): number {
  const QUESTION_RE = /^(how|what|why|when|where|which|who|can|does|do|is|are|should|will)\b|\?\s*$/i;
  let count = 0;
  $('h2, h3, summary, [itemprop="name"]').each((_, el) => {
    const t = $(el).text().trim();
    if (t.length > 8 && t.length < 160 && QUESTION_RE.test(t)) count++;
  });
  return count;
}

/** Find a "last updated"-style date from meta tags, <time>, or JSON-LD. */
function detectFreshness($: cheerio.CheerioAPI): string | null {
  const metaDate =
    $('meta[property="article:modified_time"]').attr('content') ||
    $('meta[property="article:published_time"]').attr('content') ||
    $('meta[itemprop="dateModified"]').attr('content');
  if (metaDate) return metaDate;

  const timeEl = $('time[datetime]').first().attr('datetime');
  if (timeEl) return timeEl;

  let jsonLdDate: string | null = null;
  $('script[type="application/ld+json"]').each((_, el) => {
    if (jsonLdDate) return;
    try {
      const raw = JSON.parse($(el).text());
      const nodes = Array.isArray(raw) ? raw : raw['@graph'] ?? [raw];
      for (const node of [].concat(nodes as never)) {
        const dm = (node as Record<string, unknown>)?.['dateModified'] ?? (node as Record<string, unknown>)?.['datePublished'];
        if (typeof dm === 'string') { jsonLdDate = dm; break; }
      }
    } catch { /* ignore */ }
  });
  return jsonLdDate;
}

export interface GeoInput {
  origin: string;
  /** The (JS-rendered if available) HTML used for the main scrape. */
  html: string;
  /** schema.org @types already detected by the main scrape. */
  schemaTypes: string[];
}

export async function analyzeGeo({ origin, html, schemaTypes }: GeoInput): Promise<GeoResult> {
  const $ = cheerio.load(html);

  // Fetch robots.txt, llms.txt, and a no-JS copy of the homepage in parallel.
  const [robotsRes, llmsRes, noJsRes] = await Promise.allSettled([
    fetch(`${origin}/robots.txt`, { signal: AbortSignal.timeout(8000) }),
    fetch(`${origin}/llms.txt`, { signal: AbortSignal.timeout(8000) }),
    fetch(origin, { headers: { 'User-Agent': 'GPTBot/1.0' }, signal: AbortSignal.timeout(12000) }),
  ]);

  let robotsTxt = '';
  if (robotsRes.status === 'fulfilled' && robotsRes.value.ok) {
    robotsTxt = await robotsRes.value.text();
  }

  const botAccess: BotAccess[] = AI_BOTS.map((b) => ({
    name: b.name,
    engine: b.engine,
    allowed: isBotAllowed(robotsTxt, b.name),
  }));
  const botsAllowed = botAccess.filter((b) => b.allowed).length;

  // llms.txt must be a real 200 markdown file, not a soft-404 HTML page that a
  // platform (e.g. Shopify) serves for unknown paths.
  let hasLlmsTxt = false;
  if (llmsRes.status === 'fulfilled' && llmsRes.value.ok) {
    const ct = llmsRes.value.headers.get('content-type') || '';
    if (!ct.includes('text/html')) {
      const body = await llmsRes.value.text();
      hasLlmsTxt = body.trim().length > 0 && !/<html/i.test(body.slice(0, 500));
    }
  }

  // No-JS content check: how much text does a JS-free crawler actually see?
  let noJsContentWords = 0;
  if (noJsRes.status === 'fulfilled' && noJsRes.value.ok) {
    const $nojs = cheerio.load(await noJsRes.value.text());
    $nojs('script, style, noscript, svg').remove();
    noJsContentWords = $nojs('body').text().replace(/\s+/g, ' ').trim().split(' ').filter(Boolean).length;
  }
  const noJsContentOk = noJsContentWords >= 250;

  const AI_SCHEMA = ['FAQPage', 'Article', 'BlogPosting', 'HowTo', 'Product', 'Organization', 'QAPage', 'WebSite'];
  const aiSchemaTypes = schemaTypes.filter((t) => AI_SCHEMA.includes(t));

  const answerableHeadings = countAnswerableHeadings($);
  const freshnessDate = detectFreshness($);
  const hasFreshnessSignal = !!freshnessDate;

  // Weighted GEO score (0-100).
  const botScore = (botsAllowed / AI_BOTS.length) * 100;
  const parts: { value: number; weight: number }[] = [
    { value: botScore, weight: 35 },                              // crawler access is the gate
    { value: noJsContentOk ? 100 : Math.min(100, (noJsContentWords / 250) * 100), weight: 20 },
    { value: aiSchemaTypes.length ? Math.min(100, aiSchemaTypes.length * 34) : 0, weight: 20 },
    { value: Math.min(100, answerableHeadings * 20), weight: 12 },
    { value: hasFreshnessSignal ? 100 : 0, weight: 8 },
    { value: hasLlmsTxt ? 100 : 0, weight: 5 },
  ];
  const score = Math.round(parts.reduce((s, p) => s + p.value * p.weight, 0) / parts.reduce((s, p) => s + p.weight, 0));

  // Prioritized, concrete recommendations.
  const recommendations: string[] = [];
  const blocked = botAccess.filter((b) => !b.allowed);
  if (blocked.length) {
    recommendations.push(
      `Unblock AI crawlers in robots.txt — currently blocking ${blocked.map((b) => b.name).join(', ')}, making the site invisible to ${[...new Set(blocked.map((b) => b.engine))].join(', ')}.`,
    );
  }
  if (!noJsContentOk) {
    recommendations.push(
      `Serve core content without JavaScript — a JS-free crawl saw only ${noJsContentWords} words. Most AI crawlers don't run JS, so server-render or pre-render key copy.`,
    );
  }
  if (!aiSchemaTypes.length) {
    recommendations.push('Add JSON-LD structured data (Organization + Product/Article, and FAQPage where relevant) so engines can extract machine-readable facts.');
  }
  if (answerableHeadings < 3) {
    recommendations.push('Add a FAQ / Q&A section with question-style H2/H3 headings — LLMs preferentially quote clean question→answer blocks.');
  }
  if (!hasFreshnessSignal) {
    recommendations.push('Expose a "last updated" date (visible + dateModified in schema) — AI answers favor sources they can date.');
  }
  if (!hasLlmsTxt) {
    recommendations.push('Publish an /llms.txt (llmstxt.org) pointing engines to your most important pages.');
  }

  // Reuse the robots.txt body already fetched above — no extra network call.
  const commerce = analyzeCommerceReadiness({ html, schemaTypes, robotsTxt, origin });

  return {
    score,
    botAccess,
    botsAllowed,
    botsTotal: AI_BOTS.length,
    hasLlmsTxt,
    answerableHeadings,
    aiSchemaTypes,
    hasFreshnessSignal,
    freshnessDate,
    noJsContentWords,
    noJsContentOk,
    recommendations,
    commerce,
  };
}
