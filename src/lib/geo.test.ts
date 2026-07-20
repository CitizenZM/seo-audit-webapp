import { describe, it, expect } from 'vitest';
import { analyzeCommerceReadiness } from './geo';

const FULL_PRODUCT_HTML = `
<html><body>
<h1>Widget Pro</h1>
<script type="application/ld+json">
${JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'Product',
  name: 'Widget Pro',
  offers: { '@type': 'Offer', price: '29.99', priceCurrency: 'USD', availability: 'https://schema.org/InStock' },
  aggregateRating: { '@type': 'AggregateRating', ratingValue: '4.7', reviewCount: '88' },
  review: [{ '@type': 'Review', reviewBody: 'Great product' }],
})}
</script>
<p>Buy now, no sign-in required.</p>
</body></html>
`;

const BARE_HTML = `
<html><body>
<noscript><p>This site requires JavaScript.</p></noscript>
<div id="root"></div>
</body></html>
`;

const CAPTCHA_LOGIN_HTML = `
<html><body>
<div class="g-recaptcha" data-sitekey="abc"></div>
<p>Please sign in to continue.</p>
</body></html>
`;

describe('analyzeCommerceReadiness', () => {
  it('scores a fully-marked-up product page highly with all checks passing', () => {
    const result = analyzeCommerceReadiness({
      html: FULL_PRODUCT_HTML,
      schemaTypes: ['Product'],
      robotsTxt: '',
      origin: 'https://example.com',
    });
    expect(result.score).toBeGreaterThanOrEqual(90);
    const byId = Object.fromEntries(result.checks.map((c) => [c.id, c]));
    expect(byId['product-schema'].passed).toBe(true);
    expect(byId['offer-schema'].passed).toBe(true);
    expect(byId['price-visible'].passed).toBe(true);
    expect(byId['availability-markup'].passed).toBe(true);
    expect(byId['aggregate-rating'].passed).toBe(true);
    expect(byId['review-schema'].passed).toBe(true);
    expect(byId['no-captcha-friction'].passed).toBe(true);
    expect(byId['no-noscript-only-content'].passed).toBe(true);
    expect(byId['no-login-wall'].passed).toBe(true);
  });

  it('scores a JS-only shell page with no schema very low', () => {
    const result = analyzeCommerceReadiness({
      html: BARE_HTML,
      schemaTypes: [],
      robotsTxt: '',
      origin: 'https://example.com',
    });
    expect(result.score).toBeLessThan(35);
    const byId = Object.fromEntries(result.checks.map((c) => [c.id, c]));
    expect(byId['product-schema'].passed).toBe(false);
    expect(byId['no-noscript-only-content'].passed).toBe(false);
  });

  it('detects CAPTCHA and login-wall friction signals', () => {
    const result = analyzeCommerceReadiness({
      html: CAPTCHA_LOGIN_HTML,
      schemaTypes: [],
      robotsTxt: '',
      origin: 'https://example.com',
    });
    const byId = Object.fromEntries(result.checks.map((c) => [c.id, c]));
    expect(byId['no-captcha-friction'].passed).toBe(false);
    expect(byId['no-login-wall'].passed).toBe(false);
  });

  it('flags blocked shopping-relevant bots when robotsTxt disallows them', () => {
    const robotsTxt = 'User-agent: Amazonbot\nDisallow: /\n\nUser-agent: *\nAllow: /';
    const result = analyzeCommerceReadiness({
      html: FULL_PRODUCT_HTML,
      schemaTypes: ['Product'],
      robotsTxt,
      origin: 'https://example.com',
    });
    const check = result.checks.find((c) => c.id === 'commerce-bots-allowed');
    expect(check).toBeDefined();
    expect(check!.passed).toBe(false);
    expect(check!.detail).toContain('Amazonbot');
  });

  it('omits the bots-allowed check when robotsTxt is not provided', () => {
    const result = analyzeCommerceReadiness({
      html: FULL_PRODUCT_HTML,
      schemaTypes: ['Product'],
      origin: 'https://example.com',
    });
    expect(result.checks.find((c) => c.id === 'commerce-bots-allowed')).toBeUndefined();
  });

  it('score is always within 0-100 bounds', () => {
    const r1 = analyzeCommerceReadiness({ html: '<html><body></body></html>', schemaTypes: [], origin: 'https://x.com' });
    const r2 = analyzeCommerceReadiness({ html: FULL_PRODUCT_HTML, schemaTypes: ['Product'], robotsTxt: '', origin: 'https://x.com' });
    for (const r of [r1, r2]) {
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(100);
    }
  });
});
