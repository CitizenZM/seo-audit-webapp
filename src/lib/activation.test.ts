import { describe, it, expect } from 'vitest';
import { generateLlmsTxt, generateSchemaJsonLd, generateFaqMarkup } from './activation';

describe('generateLlmsTxt', () => {
  it('produces spec-compliant structure: H1, blockquote summary, H2 sections', () => {
    const out = generateLlmsTxt({
      domain: 'example.com',
      title: 'Example Co',
      description: 'We make things.',
      keyPages: [{ title: 'Pricing', url: 'https://example.com/pricing', description: 'Plans and pricing' }],
      categories: [
        { name: 'Docs', links: [{ title: 'Getting Started', url: 'https://example.com/docs/start' }] },
      ],
    });

    const lines = out.split('\n');
    expect(lines[0]).toBe('# Example Co');
    expect(out).toContain('> We make things.');
    expect(out).toContain('## Key Pages');
    expect(out).toContain('- [Pricing](https://example.com/pricing): Plans and pricing');
    expect(out).toContain('## Docs');
    expect(out).toContain('- [Getting Started](https://example.com/docs/start)');
    expect(out.endsWith('\n')).toBe(true);
  });

  it('falls back to domain as heading and a generic description when missing', () => {
    const out = generateLlmsTxt({ domain: 'example.com', title: '', description: '' });
    expect(out.startsWith('# example.com')).toBe(true);
    expect(out).toContain('> Official site for example.com.');
  });

  it('omits optional sections when not provided', () => {
    const out = generateLlmsTxt({ domain: 'example.com', title: 'Example', description: 'Desc.' });
    expect(out).not.toContain('## Key Pages');
  });
});

describe('generateSchemaJsonLd', () => {
  it('builds valid Organization JSON-LD', () => {
    const schema = generateSchemaJsonLd({
      type: 'Organization',
      input: { name: 'Acme', url: 'https://acme.com', logo: 'https://acme.com/logo.png', sameAs: ['https://x.com/acme'] },
    });
    expect(schema['@context']).toBe('https://schema.org');
    expect(schema['@type']).toBe('Organization');
    expect(schema.name).toBe('Acme');
    expect(schema.sameAs).toEqual(['https://x.com/acme']);
    expect(() => JSON.stringify(schema)).not.toThrow();
  });

  it('builds valid Product JSON-LD with nested Offer and AggregateRating', () => {
    const schema = generateSchemaJsonLd({
      type: 'Product',
      input: {
        name: 'Widget',
        price: 19.99,
        priceCurrency: 'USD',
        availability: 'InStock',
        ratingValue: 4.5,
        reviewCount: 120,
      },
    }) as Record<string, unknown>;
    expect(schema['@type']).toBe('Product');
    const offers = schema.offers as Record<string, unknown>;
    expect(offers['@type']).toBe('Offer');
    expect(offers.price).toBe('19.99');
    expect(offers.availability).toBe('https://schema.org/InStock');
    const rating = schema.aggregateRating as Record<string, unknown>;
    expect(rating.ratingValue).toBe('4.5');
    expect(rating.reviewCount).toBe('120');
  });

  it('defaults Product availability to InStock and currency to USD when price given without them', () => {
    const schema = generateSchemaJsonLd({ type: 'Product', input: { name: 'Widget', price: 5 } }) as Record<string, unknown>;
    const offers = schema.offers as Record<string, unknown>;
    expect(offers.availability).toBe('https://schema.org/InStock');
    expect(offers.priceCurrency).toBe('USD');
  });

  it('omits offers entirely when no price given', () => {
    const schema = generateSchemaJsonLd({ type: 'Product', input: { name: 'Widget' } }) as Record<string, unknown>;
    expect(schema.offers).toBeUndefined();
  });

  it('builds valid FAQPage JSON-LD with mainEntity Question/Answer pairs', () => {
    const schema = generateSchemaJsonLd({
      type: 'FAQPage',
      input: { questions: [{ q: 'What is this?', a: 'A widget.' }, { q: 'How much?', a: '$5.' }] },
    }) as Record<string, unknown>;
    expect(schema['@type']).toBe('FAQPage');
    const mainEntity = schema.mainEntity as Record<string, unknown>[];
    expect(mainEntity).toHaveLength(2);
    expect(mainEntity[0]['@type']).toBe('Question');
    expect(mainEntity[0].name).toBe('What is this?');
    expect((mainEntity[0].acceptedAnswer as Record<string, unknown>).text).toBe('A widget.');
  });
});

describe('generateFaqMarkup', () => {
  it('embeds valid FAQPage JSON-LD and escapes HTML in questions/answers', () => {
    const html = generateFaqMarkup([{ q: 'Is <b>this</b> safe?', a: 'Yes & no.' }]);
    expect(html).toContain('application/ld+json');
    expect(html).toContain('&lt;b&gt;this&lt;/b&gt;');
    expect(html).toContain('Yes &amp; no.');

    const match = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
    expect(match).toBeTruthy();
    const parsed = JSON.parse(match![1]);
    expect(parsed['@type']).toBe('FAQPage');
    expect(parsed.mainEntity[0].name).toBe('Is <b>this</b> safe?');
  });

  it('renders one faq-item per question', () => {
    const html = generateFaqMarkup([
      { q: 'Q1', a: 'A1' },
      { q: 'Q2', a: 'A2' },
    ]);
    expect((html.match(/faq-item/g) || []).length).toBe(2);
  });
});
