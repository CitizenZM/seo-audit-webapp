import { describe, it, expect } from 'vitest';
import {
  normalizeCrawlUrl,
  sameHost,
  looksLikeHtmlPage,
  parseRobotsTxt,
  isAllowedByRobots,
} from './siteCrawler';
import * as cheerio from 'cheerio';

describe('normalizeCrawlUrl', () => {
  it('strips trailing slash except for root', () => {
    expect(normalizeCrawlUrl('https://example.com/about/')).toBe('https://example.com/about');
    expect(normalizeCrawlUrl('https://example.com/')).toBe('https://example.com/');
  });

  it('strips hash fragments', () => {
    expect(normalizeCrawlUrl('https://example.com/page#section')).toBe('https://example.com/page');
  });

  it('adds https protocol when missing', () => {
    expect(normalizeCrawlUrl('example.com')).toBe('https://example.com/');
  });
});

describe('sameHost', () => {
  it('treats www and non-www as the same host', () => {
    expect(sameHost('https://www.example.com/a', 'https://example.com/b')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(sameHost('https://Example.com/a', 'https://example.com/b')).toBe(true);
  });

  it('returns false for different hosts', () => {
    expect(sameHost('https://example.com/a', 'https://other.com/b')).toBe(false);
  });
});

describe('looksLikeHtmlPage', () => {
  it('accepts extensionless paths and .html', () => {
    expect(looksLikeHtmlPage('https://example.com/about')).toBe(true);
    expect(looksLikeHtmlPage('https://example.com/about.html')).toBe(true);
  });

  it('rejects images, pdfs, and xml', () => {
    expect(looksLikeHtmlPage('https://example.com/logo.png')).toBe(false);
    expect(looksLikeHtmlPage('https://example.com/doc.pdf')).toBe(false);
    expect(looksLikeHtmlPage('https://example.com/sitemap.xml')).toBe(false);
    expect(looksLikeHtmlPage('https://example.com/data.json')).toBe(false);
  });
});

describe('parseRobotsTxt + isAllowedByRobots', () => {
  it('disallows paths matched under the wildcard user-agent group', () => {
    const robots = parseRobotsTxt([
      'User-agent: *',
      'Disallow: /admin',
      'Disallow: /private/',
      'Allow: /private/public-page',
    ].join('\n'));

    expect(isAllowedByRobots(robots, 'https://example.com/admin')).toBe(false);
    expect(isAllowedByRobots(robots, 'https://example.com/admin/users')).toBe(false);
    expect(isAllowedByRobots(robots, 'https://example.com/private/secret')).toBe(false);
    expect(isAllowedByRobots(robots, 'https://example.com/private/public-page')).toBe(true);
    expect(isAllowedByRobots(robots, 'https://example.com/blog')).toBe(true);
  });

  it('ignores rules scoped to other user-agents', () => {
    const robots = parseRobotsTxt([
      'User-agent: Googlebot',
      'Disallow: /google-only',
      '',
      'User-agent: *',
      'Disallow: /everyone',
    ].join('\n'));

    expect(isAllowedByRobots(robots, 'https://example.com/google-only')).toBe(true);
    expect(isAllowedByRobots(robots, 'https://example.com/everyone')).toBe(false);
  });

  it('collects Sitemap: lines regardless of user-agent group', () => {
    const robots = parseRobotsTxt([
      'User-agent: *',
      'Disallow: /admin',
      'Sitemap: https://example.com/sitemap.xml',
    ].join('\n'));

    expect(robots.sitemapUrls).toEqual(['https://example.com/sitemap.xml']);
  });

  it('allows everything when there are no matching rules', () => {
    const robots = parseRobotsTxt('');
    expect(isAllowedByRobots(robots, 'https://example.com/anything')).toBe(true);
  });

  it('supports wildcard and end-anchor patterns', () => {
    const robots = parseRobotsTxt([
      'User-agent: *',
      'Disallow: /*.pdf$',
      'Disallow: /search*',
    ].join('\n'));

    expect(isAllowedByRobots(robots, 'https://example.com/file.pdf')).toBe(false);
    expect(isAllowedByRobots(robots, 'https://example.com/file.pdf.html')).toBe(true);
    expect(isAllowedByRobots(robots, 'https://example.com/search?q=x')).toBe(false);
  });
});

describe('sitemap XML parsing via cheerio xmlMode (urlset + sitemapindex)', () => {
  it('parses a urlset sitemap into page locs', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        <url><loc>https://example.com/</loc></url>
        <url><loc>https://example.com/about</loc></url>
        <url><loc>https://example.com/contact</loc></url>
      </urlset>`;
    const $x = cheerio.load(xml, { xmlMode: true });
    expect($x('sitemapindex').length).toBe(0);
    const locs: string[] = [];
    $x('url > loc').each((_, el) => { locs.push($x(el).text().trim()); });
    expect(locs).toEqual([
      'https://example.com/',
      'https://example.com/about',
      'https://example.com/contact',
    ]);
  });

  it('parses a sitemapindex into child sitemap locs', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        <sitemap><loc>https://example.com/sitemap-pages.xml</loc></sitemap>
        <sitemap><loc>https://example.com/sitemap-posts.xml</loc></sitemap>
      </sitemapindex>`;
    const $x = cheerio.load(xml, { xmlMode: true });
    expect($x('sitemapindex').length).toBe(1);
    const locs: string[] = [];
    $x('sitemap > loc').each((_, el) => { locs.push($x(el).text().trim()); });
    expect(locs).toEqual([
      'https://example.com/sitemap-pages.xml',
      'https://example.com/sitemap-posts.xml',
    ]);
  });
});
