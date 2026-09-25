/**
 * Real SERP intelligence (#4).
 *
 * Source: Serper.dev (reliable Google Search API; set SERPER_API_KEY to enable).
 *
 * (B8) `googlethis` was tried first here, but its scraper returned 0 results
 * against every test query (Google's HTML has moved on since that package was
 * maintained) and its dependency tree carries several high-severity npm
 * audit findings. It added risk with zero working functionality, so it was
 * removed rather than kept as a "free" fallback that never actually fires.
 *
 * Returns null if no source yields data, so the dashboard simply hides the card.
 */
export interface SerpResult {
  query: string;
  source: 'serper';
  organic: { title: string; url: string; domain: string }[];
  relatedSearches: string[];
  peopleAlsoAsk: string[];
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

async function viaSerper(query: string): Promise<SerpResult | null> {
  const key = process.env.SERPER_API_KEY;
  if (!key) {
    // Silent nulls made this stage undiagnosable in pipeline monitoring —
    // say why the SERP card will be absent.
    console.warn('SERP lookup skipped: SERPER_API_KEY not configured.');
    return null;
  }
  try {
    const res = await fetch('https://google.serper.dev/search', {
      method: 'POST',
      headers: { 'X-API-KEY': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: query, num: 10 }),
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) return null;
    const d = await res.json();
    const organic = (d.organic ?? []).slice(0, 10).map((r: { title?: string; link?: string }) => ({
      title: r.title ?? '',
      url: r.link ?? '',
      domain: hostOf(r.link ?? ''),
    }));
    if (!organic.length) return null;
    return {
      query,
      source: 'serper',
      organic,
      relatedSearches: (d.relatedSearches ?? []).map((r: { query: string }) => r.query).slice(0, 8),
      peopleAlsoAsk: (d.peopleAlsoAsk ?? []).map((r: { question: string }) => r.question).slice(0, 6),
    };
  } catch {
    return null;
  }
}

export async function fetchSerp(query: string): Promise<SerpResult | null> {
  if (!query) return null;
  return viaSerper(query);
}

/** Root domain (www-stripped) — used for loose domain-family matching below. */
function rootDomain(domain: string): string {
  return domain.replace(/^www\./, '').toLowerCase();
}

/**
 * True when a SERP result domain should count as "the target" — handles
 * subdomain variance in both directions (shop.example.com vs example.com).
 */
function domainMatches(resultDomain: string, targetDomain: string): boolean {
  const r = rootDomain(resultDomain);
  const t = rootDomain(targetDomain);
  if (!r || !t) return false;
  return r === t || r.endsWith(`.${t}`) || t.endsWith(`.${r}`);
}

export interface KeywordRanking {
  keyword: string;
  targetPosition: number | null;
  topResults: { title: string; url: string; domain: string }[];
  competitorPositions: Record<string, number | null>;
}

/**
 * Real keyword rankings (#4 upgrade): looks up up to 5 non-brand keywords
 * (from synthesis.keywordOpportunities) against live Google results via
 * Serper, and reports the target's and each competitor's organic position
 * for each — measured data, not an AI estimate. Returns [] gracefully when
 * no API key is configured (dashboard hides the card).
 */
export async function fetchKeywordRankings(
  keywords: string[],
  targetDomain: string,
  competitorDomains: string[],
): Promise<KeywordRanking[]> {
  const key = process.env.SERPER_API_KEY;
  if (!key) {
    console.warn('Keyword ranking lookup skipped: SERPER_API_KEY not configured.');
    return [];
  }
  const queries = keywords.filter(Boolean).slice(0, 5);
  if (!queries.length) return [];

  const results = await Promise.allSettled(queries.map((q) => viaSerper(q)));

  const rankings: KeywordRanking[] = [];
  for (let i = 0; i < queries.length; i++) {
    const r = results[i];
    if (r.status !== 'fulfilled' || !r.value) continue;
    const organic = r.value.organic;

    let targetPosition: number | null = null;
    const competitorPositions: Record<string, number | null> = {};
    for (const domain of competitorDomains) competitorPositions[domain] = null;

    organic.forEach((res, idx) => {
      const position = idx + 1;
      if (targetPosition === null && domainMatches(res.domain, targetDomain)) {
        targetPosition = position;
      }
      for (const domain of competitorDomains) {
        if (competitorPositions[domain] === null && domainMatches(res.domain, domain)) {
          competitorPositions[domain] = position;
        }
      }
    });

    rankings.push({
      keyword: queries[i],
      targetPosition,
      topResults: organic.slice(0, 5),
      competitorPositions,
    });
  }
  return rankings;
}
