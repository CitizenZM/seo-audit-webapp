/**
 * Real SERP intelligence (#4).
 *
 * Source order (best-effort, graceful):
 *  1. googlethis  — free scrape, no key (NOTE: v1.8.0's parser is frequently
 *     broken by Google HTML changes and may return 0 results).
 *  2. Serper.dev  — reliable Google Search API; set SERPER_API_KEY to enable.
 *
 * Returns null if no source yields data, so the dashboard simply hides the card.
 */
export interface SerpResult {
  query: string;
  source: 'serper' | 'googlethis';
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

async function viaGoogleThis(query: string): Promise<SerpResult | null> {
  try {
    const g = await import('googlethis');
    const r = await g.search(query, {});
    const organic = (r.results ?? []).slice(0, 10).map((x: { title: string; url: string }) => ({
      title: x.title,
      url: x.url,
      domain: hostOf(x.url),
    }));
    if (!organic.length) return null;
    return {
      query,
      source: 'googlethis',
      organic,
      relatedSearches: (r.people_also_search ?? []).map((x: { title?: string }) => x.title ?? '').filter(Boolean).slice(0, 8),
      peopleAlsoAsk: (r.people_also_ask ?? []).slice(0, 6),
    };
  } catch {
    return null;
  }
}

export async function fetchSerp(query: string): Promise<SerpResult | null> {
  if (!query) return null;
  // googlethis first (honors the no-key default), Serper as reliable fallback.
  return (await viaGoogleThis(query)) ?? (await viaSerper(query));
}
