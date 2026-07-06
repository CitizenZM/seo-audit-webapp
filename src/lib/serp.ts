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
  if (!key) return null;
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
