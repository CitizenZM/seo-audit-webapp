import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import { launchBrowser } from '@/lib/browser';
import { generateSynthesis } from '@/lib/synthesis';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60; // seconds — headless scraping + AI can be slow

async function scrapeSite(targetUrl: string, isCompetitor = false) {
  const urlObj = new URL(targetUrl);
  const domain = urlObj.hostname;

  // 1. Render the page with headless Chromium
  const browser = await launchBrowser();
  let html: string;
  try {
    const page = await browser.newPage();
    await page.goto(targetUrl, { waitUntil: 'networkidle2', timeout: 30000 });
    html = await page.content();
  } finally {
    await browser.close();
  }

  // 2. Parse HTML
  const $ = cheerio.load(html);
  const title = $('title').text();
  const metaDesc = $('meta[name="description"]').attr('content') || '';
  const h1s = $('h1')
    .map((i, el) => $(el).text().trim())
    .get();

  $('script, style, noscript').remove();
  const bodyText = $('body').text().replace(/\s+/g, ' ').trim();
  const wordCount = bodyText ? bodyText.split(' ').length : 0;

  const internalLinks = new Set<string>();
  const externalLinks = new Set<string>();

  $('a').each((i, el) => {
    const href = $(el).attr('href');
    if (!href || href.startsWith('javascript:')) return;
    try {
      const linkObj = new URL(href, targetUrl);
      if (linkObj.hostname === domain) internalLinks.add(linkObj.href);
      else externalLinks.add(linkObj.href);
    } catch {
      /* ignore malformed hrefs */
    }
  });

  const hasCartOrCheckout =
    $('a[href*="cart"], a[href*="checkout"], button:contains("Add to cart")').length > 0;
  const hasReviewsSchema = $('script[type="application/ld+json"]')
    .text()
    .includes('AggregateRating');
  const imageCount = $('img').length;
  const imagesWithAlt = $('img[alt]').length;

  // 3. Aux files + PageSpeed (main site only)
  let hasRobots = false;
  let hasSitemap = false;
  let speedScore = 0;

  if (!isCompetitor) {
    const [robots, sitemap, pagespeed] = await Promise.allSettled([
      fetch(`${urlObj.origin}/robots.txt`),
      fetch(`${urlObj.origin}/sitemap.xml`),
      fetch(
        `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(
          targetUrl,
        )}&strategy=mobile`,
      ),
    ]);

    if (robots.status === 'fulfilled' && robots.value.ok) hasRobots = true;
    if (sitemap.status === 'fulfilled' && sitemap.value.ok) hasSitemap = true;
    if (pagespeed.status === 'fulfilled' && pagespeed.value.ok) {
      try {
        const data = await pagespeed.value.json();
        speedScore = (data?.lighthouseResult?.categories?.performance?.score ?? 0) * 100;
      } catch {
        /* ignore */
      }
    }
  }

  return {
    url: targetUrl,
    domain,
    onPage: {
      title,
      titleLength: title.length,
      metaDescription: metaDesc,
      metaDescLength: metaDesc.length,
      h1Count: h1s.length,
      h1List: h1s,
      wordCount,
      imageAltCoverage: `${imagesWithAlt}/${imageCount} images have alt text`,
    },
    links: {
      internalCount: internalLinks.size,
      externalCount: externalLinks.size,
    },
    technical: {
      hasRobotsTxt: hasRobots,
      hasSitemapXml: hasSitemap,
      isHttps: targetUrl.startsWith('https://'),
      mobileSpeedScore: Math.round(speedScore),
    },
    cro: {
      hasCartOrCheckout,
      hasReviewsSchema,
    },
  };
}

function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  return trimmed.startsWith('http') ? trimmed : `https://${trimmed}`;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const targetUrl = searchParams.get('url');
  const competitorsParam = searchParams.get('competitors');

  if (!targetUrl) {
    return NextResponse.json({ error: 'URL parameter is required' }, { status: 400 });
  }

  // Validate the URL up front so we fail fast with a clear message.
  let normalizedTarget: string;
  try {
    normalizedTarget = normalizeUrl(targetUrl);
    new URL(normalizedTarget);
  } catch {
    return NextResponse.json({ error: 'Invalid URL provided' }, { status: 400 });
  }

  try {
    // Main site + competitors are scraped concurrently.
    const competitorUrls = (competitorsParam ?? '')
      .split(',')
      .map((u) => u.trim())
      .filter(Boolean)
      .map(normalizeUrl);

    const [mainResult, ...competitorResults] = await Promise.allSettled([
      scrapeSite(normalizedTarget, false),
      ...competitorUrls.map((u) => scrapeSite(u, true)),
    ]);

    if (mainResult.status !== 'fulfilled') {
      throw mainResult.reason instanceof Error
        ? mainResult.reason
        : new Error('Failed to scrape target site');
    }

    const mainAnalysis = mainResult.value;
    const competitors = competitorResults
      .filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof scrapeSite>>> =>
        r.status === 'fulfilled',
      )
      .map((r) => r.value);

    // AI synthesis (validated; null on failure so the dashboard still renders raw data).
    const synthesis = await generateSynthesis({
      url: mainAnalysis.url,
      domain: mainAnalysis.domain,
      title: mainAnalysis.onPage.title,
      titleLength: mainAnalysis.onPage.titleLength,
      metaDescription: mainAnalysis.onPage.metaDescription,
      h1Count: mainAnalysis.onPage.h1Count,
      wordCount: mainAnalysis.onPage.wordCount,
      mobileSpeedScore: mainAnalysis.technical.mobileSpeedScore,
      hasCart: mainAnalysis.cro.hasCartOrCheckout,
      hasReviewsSchema: mainAnalysis.cro.hasReviewsSchema,
      competitors: competitors.map((c) => ({
        domain: c.domain,
        wordCount: c.onPage.wordCount,
        h1Count: c.onPage.h1Count,
        externalCount: c.links.externalCount,
      })),
    });

    return NextResponse.json({
      success: true,
      data: { ...mainAnalysis, synthesis },
      competitors,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Scraping Error:', error);
    return NextResponse.json(
      { error: 'Failed to analyze URL', details: message },
      { status: 500 },
    );
  }
}
