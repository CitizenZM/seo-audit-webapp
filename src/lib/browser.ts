import type { Browser } from 'puppeteer-core';

/**
 * Launch a Chromium browser that works both locally and on serverless (Vercel).
 *
 * - On Vercel/AWS Lambda the bundled full `puppeteer` Chromium exceeds the
 *   function size limit, so we use `puppeteer-core` + `@sparticuz/chromium`
 *   (a Lambda-optimized headless build).
 * - Locally we fall back to the full `puppeteer` package which ships its own
 *   Chromium, so there is nothing to install for development.
 */
export async function launchBrowser(): Promise<Browser> {
  const isServerless = !!process.env.VERCEL || !!process.env.AWS_LAMBDA_FUNCTION_NAME;

  if (isServerless) {
    // `@sparticuz/chromium`'s exported type has shifted across versions; cast to
    // a minimal shape so we depend on runtime behavior, not the package's types.
    const chromium = (await import('@sparticuz/chromium')).default as unknown as {
      args: string[];
      defaultViewport?: { width: number; height: number } | null;
      executablePath: () => Promise<string>;
    };
    const puppeteer = await import('puppeteer-core');
    return (await puppeteer.launch({
      args: chromium.args,
      defaultViewport: chromium.defaultViewport ?? { width: 1280, height: 800 },
      executablePath: await chromium.executablePath(),
      headless: true,
    })) as unknown as Browser;
  }

  // Local development: use the full puppeteer package (bundled Chromium).
  const puppeteer = await import('puppeteer');
  return (await puppeteer.launch({ headless: true })) as unknown as Browser;
}
