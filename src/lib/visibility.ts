import Anthropic from '@anthropic-ai/sdk';

/**
 * Brand Visibility engine — the core Gumshoe/Profound metric.
 *
 * Instead of asking "does Google rank you?", this asks the question AI-era
 * buyers actually trigger: "when a consumer asks an AI assistant for
 * recommendations in your category, does your brand come up — and who does?"
 *
 * How it works (same shape as Gumshoe's Visibility Audit):
 *  1. Generate N consumer-style prompts from the site's category/keywords
 *     ("best aero kits for Subaru", "top luggage brands", …).
 *  2. Run each prompt against a real LLM (Claude) exactly as a consumer would.
 *  3. Extract every brand mentioned in each answer.
 *  4. Visibility % = share of prompts where the target brand appeared.
 *     The aggregated brand counts become the Competitive Leaderboard.
 *
 * Cost: N (default 8) claude-haiku calls per audit — cents. Requires
 * ANTHROPIC_API_KEY; returns null without it so the dashboard shows a
 * "connect a key" state instead of fake numbers.
 */

export interface PromptResult {
  prompt: string;
  mentioned: boolean;
  brands: string[];
}

export interface LeaderboardEntry {
  brand: string;
  mentions: number;
  visibilityPct: number;
  isYou: boolean;
}

export interface VisibilityResult {
  /** 0-100: % of probed prompts whose answer mentioned the target brand. */
  visibilityPct: number;
  totalPrompts: number;
  brandsSeen: number;
  targetBrand: string;
  prompts: PromptResult[];
  leaderboard: LeaderboardEntry[];
}

export interface VisibilityInput {
  domain: string;
  title: string;
  /** AI-synthesis keyword opportunities, when available — best prompt source. */
  keywords?: string[];
  /** Competitor domains the user supplied, to seed leaderboard matching. */
  competitorDomains?: string[];
}

/** Normalize a brand string for fuzzy matching ("Tote&Carry®" → "totecarry"). */
function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** Candidate identifiers for "this is us" matching. */
function targetCandidates(domain: string, title: string): { display: string; keys: string[] } {
  const root = domain.replace(/^www\./, '').split('.')[0];
  // First title segment, minus boilerplate suffixes ("Official Site", "Home").
  const seg = (title.split(/[|\-–—]/)[0] || '')
    .replace(/\b(official site|official store|home|homepage|shop|store)\b/gi, '')
    .trim();
  const keys = [norm(root)];
  if (seg) keys.push(norm(seg));
  return { display: seg || root, keys: [...new Set(keys.filter(Boolean))] };
}

/** Derive the product category from the page title (segment before the brand suffix). */
function deriveCategory(title: string, domain: string): string {
  const seg = (title.split(/[|–—]/)[0] || title).split(' - ')[0].trim();
  const cleaned = seg
    .replace(/\b(official site|official store|new|shop|buy|home)\b/gi, ' ')
    .replace(/[®™©]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || domain.split('.')[0];
}

export function generatePrompts(input: VisibilityInput, max = 8): string[] {
  const prompts: string[] = [];
  const kws = (input.keywords ?? []).filter(Boolean).slice(0, 4);

  // Keyword-driven prompts read most like real buyer questions.
  for (const kw of kws) {
    prompts.push(`What are the best ${kw}? Recommend specific brands.`);
    prompts.push(`I'm shopping for ${kw} — which brands or sites should I consider?`);
  }

  // Category fallbacks from the title.
  const cat = deriveCategory(input.title, input.domain);
  const catPrompts = [
    `What are the top brands for ${cat}?`,
    `Best ${cat} to buy in 2026 — give me specific recommendations.`,
    `Which websites are best for buying ${cat}?`,
    `Recommend some highly rated ${cat} brands and where to buy them.`,
  ];
  for (const p of catPrompts) {
    if (prompts.length >= max) break;
    prompts.push(p);
  }
  return [...new Set(prompts)].slice(0, max);
}

/** Ask Claude one consumer prompt; return its brand list. */
async function probePrompt(client: Anthropic, prompt: string): Promise<string[]> {
  const msg = await client.messages.create({
    model: 'claude-haiku-4-5',
    max_tokens: 700,
    system:
      'You are a helpful shopping/search assistant. Answer the user\'s question naturally with specific brand, product, and website recommendations, as you would for any consumer. After your answer, on the final line output exactly: BRANDS: ["Brand One", "Brand Two", ...] — a JSON array of every brand, company, or website you mentioned.',
    messages: [{ role: 'user', content: prompt }],
  });
  const text = msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n');
  const m = text.match(/BRANDS:\s*(\[[\s\S]*?\])/);
  if (!m) return [];
  try {
    const arr = JSON.parse(m[1]);
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string').slice(0, 25) : [];
  } catch {
    return [];
  }
}

export async function analyzeVisibility(input: VisibilityInput): Promise<VisibilityResult | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const prompts = generatePrompts(input);
  if (prompts.length === 0) return null;

  const target = targetCandidates(input.domain, input.title);

  const settled = await Promise.allSettled(
    prompts.map(async (prompt) => ({ prompt, brands: await probePrompt(client, prompt) })),
  );

  const results: PromptResult[] = [];
  const counts = new Map<string, { display: string; count: number; isYou: boolean }>();

  for (const s of settled) {
    if (s.status !== 'fulfilled') continue;
    const { prompt, brands } = s.value;
    let mentioned = false;
    // Count each brand once per prompt (a brand repeated in one answer is
    // still one "mention" in visibility terms).
    const seenThisPrompt = new Set<string>();
    for (const b of brands) {
      const key = norm(b);
      if (!key || seenThisPrompt.has(key)) continue;
      seenThisPrompt.add(key);
      const isYou = target.keys.some((t) => key === t || key.includes(t) || t.includes(key));
      if (isYou) mentioned = true;
      const existing = counts.get(key);
      if (existing) {
        existing.count++;
        if (isYou) existing.isYou = true;
      } else {
        counts.set(key, { display: b, count: 1, isYou });
      }
    }
    results.push({ prompt, mentioned, brands });
  }

  if (results.length === 0) return null;

  const mentionedCount = results.filter((r) => r.mentioned).length;
  const leaderboard: LeaderboardEntry[] = [...counts.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)
    .map((e) => ({
      brand: e.display,
      mentions: e.count,
      visibilityPct: Math.round((e.count / results.length) * 100),
      isYou: e.isYou,
    }));

  // Ensure the target brand appears on the board even at 0 mentions — the
  // "you're invisible" row is the whole point of the audit.
  if (!leaderboard.some((l) => l.isYou)) {
    leaderboard.push({ brand: target.display, mentions: mentionedCount, visibilityPct: Math.round((mentionedCount / results.length) * 100), isYou: true });
  }

  return {
    visibilityPct: Math.round((mentionedCount / results.length) * 100),
    totalPrompts: results.length,
    brandsSeen: counts.size,
    targetBrand: target.display,
    prompts: results,
    leaderboard,
  };
}
