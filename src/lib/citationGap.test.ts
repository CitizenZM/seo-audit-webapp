import { describe, it, expect } from 'vitest';
import { rankCitationGaps } from '@/lib/citationGap';
import type { PromptResult } from '@/lib/visibility';

function mkPrompt(overrides: Partial<PromptResult>): PromptResult {
  return {
    prompt: 'p',
    persona: 'General buyer',
    topic: 'Best in category',
    model: 'test-model',
    mentioned: false,
    brands: [],
    citations: [],
    ...overrides,
  };
}

describe('rankCitationGaps', () => {
  it('excludes the target domain from the gap list', () => {
    const citations: PromptResult[] = [
      mkPrompt({ citations: ['example.com', 'ourbrand.com'], topic: 'Best in category' }),
    ];
    const gaps = rankCitationGaps(citations, 'ourbrand.com');
    expect(gaps.some((g) => g.domain === 'ourbrand.com')).toBe(false);
    expect(gaps.some((g) => g.domain === 'example.com')).toBe(true);
  });

  it('excludes subdomains of the target domain too', () => {
    const citations: PromptResult[] = [mkPrompt({ citations: ['blog.ourbrand.com', 'competitor.com'] })];
    const gaps = rankCitationGaps(citations, 'ourbrand.com');
    expect(gaps.some((g) => g.domain === 'blog.ourbrand.com')).toBe(false);
    expect(gaps.some((g) => g.domain === 'competitor.com')).toBe(true);
  });

  it('parses full URLs down to bare domain and dedupes per prompt', () => {
    const citations: PromptResult[] = [
      mkPrompt({
        citations: ['https://www.reviewsite.com/best-luggage', 'reviewsite.com'],
      }),
    ];
    const gaps = rankCitationGaps(citations, 'ourbrand.com');
    const entry = gaps.find((g) => g.domain === 'reviewsite.com');
    expect(entry).toBeDefined();
    // Same domain cited twice within one prompt result should count once.
    expect(entry?.count).toBe(1);
  });

  it('ranks domains by citation count descending', () => {
    const citations: PromptResult[] = [
      mkPrompt({ citations: ['a.com'] }),
      mkPrompt({ citations: ['a.com'] }),
      mkPrompt({ citations: ['a.com'] }),
      mkPrompt({ citations: ['b.com'] }),
    ];
    const gaps = rankCitationGaps(citations, 'ourbrand.com');
    expect(gaps[0].domain).toBe('a.com');
    expect(gaps[0].count).toBe(3);
    expect(gaps[1].domain).toBe('b.com');
    expect(gaps[1].count).toBe(1);
  });

  it('collects distinct topics a domain was cited under', () => {
    const citations: PromptResult[] = [
      mkPrompt({ citations: ['a.com'], topic: 'Best in category' }),
      mkPrompt({ citations: ['a.com'], topic: 'Comparison' }),
      mkPrompt({ citations: ['a.com'], topic: 'Best in category' }),
    ];
    const gaps = rankCitationGaps(citations, 'ourbrand.com');
    const entry = gaps.find((g) => g.domain === 'a.com');
    expect(entry?.citedForTopics.sort()).toEqual(['Best in category', 'Comparison']);
  });

  it('ignores empty/invalid citation strings', () => {
    const citations: PromptResult[] = [mkPrompt({ citations: ['', 'not-a-domain', 'good.com'] })];
    const gaps = rankCitationGaps(citations, 'ourbrand.com');
    expect(gaps.map((g) => g.domain)).toEqual(['good.com']);
  });

  it('folds SERP organic results into the same domain map without inflating counts alone', () => {
    const citations: PromptResult[] = [mkPrompt({ citations: ['ranked.com'] })];
    const serpResults = [
      {
        query: 'best luggage brands',
        source: 'serper' as const,
        organic: [{ title: 't', url: 'https://ranked.com/page', domain: 'ranked.com' }],
        relatedSearches: [],
        peopleAlsoAsk: [],
      },
    ];
    const gaps = rankCitationGaps(citations, 'ourbrand.com', serpResults);
    const entry = gaps.find((g) => g.domain === 'ranked.com');
    expect(entry).toBeDefined();
    expect(entry?.citedForTopics).toContain('best luggage brands');
  });

  it('returns empty array when there are no citations', () => {
    expect(rankCitationGaps([], 'ourbrand.com')).toEqual([]);
  });
});
