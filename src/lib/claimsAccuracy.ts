import { aiText, extractJson } from '@/lib/ai';

/**
 * Hallucination / claims accuracy check (#4) — extracts factual claims AI
 * models made about the brand in visibility-probe answers, then classifies
 * each against known site facts as supported / contradicted / unverifiable.
 * Surfaces where AI assistants are actively misinforming users about the
 * brand (a GEO risk distinct from plain low visibility).
 */

export type ClaimVerdict = 'supported' | 'contradicted' | 'unverifiable';

export interface Claim {
  claim: string;
  verdict: ClaimVerdict;
  evidence?: string;
}

export interface ClaimsAccuracyResult {
  claims: Claim[];
}

export interface SiteFacts {
  title: string;
  description?: string;
  wordCountHint?: number;
  categories?: string[];
  siteText?: string;
}

export interface CheckClaimsAccuracyInput {
  probeAnswers: string[];
  brand: string;
  siteFacts: SiteFacts;
}

const VALID_VERDICTS: ClaimVerdict[] = ['supported', 'contradicted', 'unverifiable'];

function isClaim(x: unknown): x is Claim {
  if (!x || typeof x !== 'object') return false;
  const rec = x as Record<string, unknown>;
  return (
    typeof rec.claim === 'string' &&
    typeof rec.verdict === 'string' &&
    VALID_VERDICTS.includes(rec.verdict as ClaimVerdict) &&
    (rec.evidence === undefined || typeof rec.evidence === 'string')
  );
}

/** Zod-lite validation of the model's raw JSON output — pure, exported for unit testing. */
export function parseClaimsResponse(raw: string): Claim[] | null {
  const parsed = extractJson(raw) as { claims?: unknown } | null;
  if (!parsed || !Array.isArray(parsed.claims)) return null;
  const claims = parsed.claims.filter(isClaim).slice(0, 20).map((c) => ({
    claim: c.claim,
    verdict: c.verdict,
    ...(c.evidence ? { evidence: c.evidence } : {}),
  }));
  return claims;
}

function factsBlock(siteFacts: SiteFacts): string {
  const lines = [
    `Title: ${siteFacts.title}`,
    siteFacts.description ? `Description: ${siteFacts.description}` : null,
    siteFacts.categories?.length ? `Categories: ${siteFacts.categories.join(', ')}` : null,
    siteFacts.wordCountHint ? `Approx. site content length: ${siteFacts.wordCountHint} words` : null,
    siteFacts.siteText ? `Site content excerpt:\n${siteFacts.siteText.slice(0, 4000)}` : null,
  ].filter(Boolean);
  return lines.join('\n');
}

/**
 * Extract factual claims AI models made about `brand` in `probeAnswers` and
 * classify each vs `siteFacts`. Returns null when no AI provider is
 * configured or the model output doesn't parse — never throws.
 */
export async function checkClaimsAccuracy(input: CheckClaimsAccuracyInput): Promise<ClaimsAccuracyResult | null> {
  const { probeAnswers, brand, siteFacts } = input;
  const nonEmptyAnswers = probeAnswers.filter((a) => a && a.trim().length > 0);
  if (nonEmptyAnswers.length === 0) return { claims: [] };

  const raw = await aiText(
    null,
    `Brand: "${brand}"\n\nKnown facts about the brand's website:\n${factsBlock(siteFacts)}\n\nThese are AI assistant answers that mentioned the brand:\n\n${nonEmptyAnswers
      .join('\n---\n')
      .slice(0, 6000)}\n\nExtract every distinct factual claim made about the brand (pricing, shipping, product range, guarantees, founding, locations, certifications, etc.) and classify each against the known facts:\n- "supported": the known facts confirm it\n- "contradicted": the known facts directly conflict with it\n- "unverifiable": the known facts don't say either way\n\nRespond with ONLY JSON, no prose: {"claims":[{"claim":"the specific claim, restated concisely","verdict":"supported|contradicted|unverifiable","evidence":"short quote/paraphrase from the facts or answer, optional"}]}`,
    { maxTokens: 3000 },
  );
  if (!raw) return null;

  const claims = parseClaimsResponse(raw);
  if (claims === null) {
    console.warn('Claims accuracy: unparseable AI response');
    return null;
  }
  return { claims };
}
