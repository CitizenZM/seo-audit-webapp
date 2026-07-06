/**
 * Composite SEO health score (0-100), replacing "mobile speed = the score"
 * (which was misleading — a fast site with no title tags scored great, and
 * a correct site with a slow but working PageSpeed call scored 0/null).
 *
 * Weights are a judgment call, not a standard: Technical 30, On-Page 25,
 * Schema 15, CRO 10, AI category average 20. Any component whose input is
 * unavailable (e.g. PageSpeed failed, or AI synthesis didn't run) is
 * excluded and the remaining weights are rescaled to still sum to 100 —
 * so a missing signal never silently drags the score toward 0.
 */
export interface ScoreInput {
  technical: {
    mobileSpeedScore: number | null;
    isHttps: boolean;
    hasRobotsTxt: boolean;
    hasSitemapXml: boolean;
  };
  onPage: {
    titleLength: number;
    metaDescLength: number;
    h1Count: number;
    wordCount: number;
    imageAltCoverage?: string; // "12/15 images have alt text"
  };
  cro: {
    hasReviewsSchema: boolean;
  };
  schema?: {
    hasOrganization: boolean;
    hasBreadcrumb: boolean;
    hasProduct: boolean;
    hasFAQ: boolean;
    hasReview: boolean;
  } | null;
  synthesis?: {
    topCategoryScores?: Record<string, number>;
  } | null;
}

export interface ScoreBreakdown {
  overall: number;
  components: { key: string; label: string; score: number; weight: number }[];
}

function clamp(n: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, n));
}

function altCoverageRatio(coverage?: string): number | null {
  if (!coverage) return null;
  const m = coverage.match(/(\d+)\/(\d+)/);
  if (!m) return null;
  const [, have, total] = m;
  const t = Number(total);
  if (t === 0) return 100; // no images at all — nothing to fail
  return clamp((Number(have) / t) * 100);
}

export function computeScore(input: ScoreInput): ScoreBreakdown {
  const parts: { key: string; label: string; score: number | null; weight: number }[] = [];

  // Technical (30): performance half, hygiene (https/robots/sitemap) half.
  const hygiene = (input.technical.isHttps ? 40 : 0) + (input.technical.hasRobotsTxt ? 30 : 0) + (input.technical.hasSitemapXml ? 30 : 0);
  const perf = input.technical.mobileSpeedScore;
  const technicalScore = perf != null ? (perf + hygiene) / 2 : hygiene;
  parts.push({ key: 'technical', label: 'Technical & Performance', score: clamp(technicalScore), weight: 30 });

  // On-Page (25): title length, meta length, single H1, word count adequacy.
  const titleOk = input.onPage.titleLength > 0 && input.onPage.titleLength <= 60 ? 100 : input.onPage.titleLength > 0 ? 50 : 0;
  const metaOk = input.onPage.metaDescLength >= 120 && input.onPage.metaDescLength <= 160 ? 100 : input.onPage.metaDescLength > 0 ? 50 : 0;
  const h1Ok = input.onPage.h1Count === 1 ? 100 : input.onPage.h1Count > 1 ? 60 : 0;
  const wordsOk = clamp((input.onPage.wordCount / 600) * 100); // 600+ words = full credit
  const onPageScore = (titleOk + metaOk + h1Ok + wordsOk) / 4;
  parts.push({ key: 'onPage', label: 'On-Page SEO', score: clamp(onPageScore), weight: 25 });

  // Schema.org structured data (15): fraction of common types present.
  if (input.schema) {
    const flags = [input.schema.hasOrganization, input.schema.hasBreadcrumb, input.schema.hasProduct, input.schema.hasFAQ, input.schema.hasReview];
    const schemaScore = (flags.filter(Boolean).length / flags.length) * 100;
    parts.push({ key: 'schema', label: 'Structured Data', score: clamp(schemaScore), weight: 15 });
  } else {
    parts.push({ key: 'schema', label: 'Structured Data', score: null, weight: 15 });
  }

  // CRO signals (10): reviews schema + image alt-text coverage.
  const altRatio = altCoverageRatio(input.onPage.imageAltCoverage);
  const croParts = [input.cro.hasReviewsSchema ? 100 : 0, altRatio ?? 50];
  const croScore = croParts.reduce((a, b) => a + b, 0) / croParts.length;
  parts.push({ key: 'cro', label: 'CRO / UX Signals', score: clamp(croScore), weight: 10 });

  // AI category average (20): only when synthesis ran.
  const cats = input.synthesis?.topCategoryScores;
  if (cats && Object.keys(cats).length > 0) {
    const avg = Object.values(cats).reduce((a, b) => a + b, 0) / Object.values(cats).length;
    parts.push({ key: 'ai', label: 'AI Category Average', score: clamp(avg), weight: 20 });
  } else {
    parts.push({ key: 'ai', label: 'AI Category Average', score: null, weight: 20 });
  }

  // Rescale weights of available components so they still sum to 100.
  const available = parts.filter((p) => p.score != null) as { key: string; label: string; score: number; weight: number }[];
  const availableWeight = available.reduce((sum, p) => sum + p.weight, 0);
  const scale = availableWeight > 0 ? 100 / availableWeight : 0;

  const overall = availableWeight > 0
    ? Math.round(available.reduce((sum, p) => sum + p.score * p.weight, 0) / availableWeight)
    : 0;
  const components = available.map((p) => ({ ...p, score: Math.round(p.score), weight: Math.round(p.weight * scale) }));

  return { overall, components };
}
