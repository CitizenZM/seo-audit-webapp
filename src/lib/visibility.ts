import { activeProvider, aiText, extractJson, cliAvailable } from '@/lib/ai';

/**
 * Brand Visibility engine v2 — Gumshoe/Profound-style AI answer analysis.
 *
 * Pipeline per audit:
 *  1. Generate 3 buyer personas for the site's category (1 AI call).
 *  2. Build a prompt set: per-persona buyer questions + generic category
 *     questions, each tagged with a topic bucket.
 *  3. Probe every prompt against each configured model (OpenAI always;
 *     Claude too when ANTHROPIC_API_KEY is present) exactly as a consumer
 *     would ask — the model is never told which brand we're measuring.
 *  4. Each answer yields: brands mentioned + sources/domains the model would
 *     cite. Aggregations produce: overall visibility %, per-model slice,
 *     per-persona slice, per-topic slice, competitive leaderboard, and a
 *     citation-domain leaderboard (digital-PR targeting).
 *  5. If the brand was mentioned anywhere, one final call summarizes how the
 *     models characterized it (sentiment + descriptors) — brand perception.
 */

export interface PromptResult {
  prompt: string;
  persona: string;
  topic: string;
  model: string;
  mentioned: boolean;
  brands: string[];
  citations: string[];
}

export interface LeaderboardEntry { brand: string; mentions: number; visibilityPct: number; isYou: boolean }
export interface Slice { label: string; visibilityPct: number; prompts: number }
export interface CitationEntry { domain: string; count: number }
export interface Perception {
  sentiment: 'positive' | 'neutral' | 'mixed' | 'negative' | 'not_discussed';
  descriptors: string[];
  summary: string;
}
export interface PersonaDef { name: string; description: string }

export interface VisibilityResult {
  visibilityPct: number;
  totalPrompts: number;
  brandsSeen: number;
  targetBrand: string;
  prompts: PromptResult[];
  leaderboard: LeaderboardEntry[];
  models: Slice[];
  personas: Slice[];
  topics: Slice[];
  personaDefs: PersonaDef[];
  citations: CitationEntry[];
  perception: Perception | null;
}

export interface VisibilityInput {
  domain: string;
  title: string;
  keywords?: string[];
  competitorDomains?: string[];
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');

function targetCandidates(domain: string, title: string): { display: string; keys: string[] } {
  const root = domain.replace(/^www\./, '').split('.')[0];
  const seg = (title.split(/[|\-–—]/)[0] || '')
    .replace(/\b(official site|official store|home|homepage|shop|store)\b/gi, '')
    .trim();
  const keys = [norm(root)];
  if (seg) keys.push(norm(seg));
  return { display: seg || root, keys: [...new Set(keys.filter(Boolean))] };
}

function deriveCategory(title: string, domain: string): string {
  const seg = (title.split(/[|–—]/)[0] || title).split(' - ')[0].trim();
  const cleaned = seg
    .replace(/\b(official site|official store|new|shop|buy|home)\b/gi, ' ')
    .replace(/[®™©]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || domain.split('.')[0];
}

const PROBE_SYSTEM =
  'You are a helpful shopping/search assistant. In 3-4 sentences, answer the user\'s question naturally with specific brand, product, and website recommendations, as you would for any consumer. Keep the answer brief — you MUST leave room to also output the two required final lines below; never let the answer run so long that those lines get cut off. After your (brief) answer, output exactly two final lines:\n' +
  'BRANDS: ["Brand One", "Brand Two"] — a JSON array of every brand, company, or website you mentioned.\n' +
  'SOURCES: ["example.com"] — a JSON array of website domains you would cite or point the user to (may be empty).';

interface ProbeTarget { model: string; ask: (prompt: string) => Promise<string> }

/**
 * Build the list of models to probe: the active OpenAI-compatible provider
 * (Gemini or OpenAI) when keyed; Claude API when keyed; subscription CLI as
 * the local zero-cost fallback when no API key works.
 */
async function buildProbeTargets(): Promise<ProbeTarget[]> {
  const targets: ProbeTarget[] = [];

  const provider = activeProvider();
  if (provider) {
    targets.push({
      model: provider.label,
      ask: async (prompt) => {
        const r = await provider.client.chat.completions.create({
          model: provider.model,
          max_tokens: 1200,
          messages: [{ role: 'system', content: PROBE_SYSTEM }, { role: 'user', content: prompt }],
        });
        return r.choices[0]?.message?.content ?? '';
      },
    });
  }

  if (process.env.ANTHROPIC_API_KEY) {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    targets.push({
      model: 'Claude haiku-4-5',
      ask: async (prompt) => {
        const r = await claude.messages.create({
          model: 'claude-haiku-4-5',
          max_tokens: 1200,
          system: PROBE_SYSTEM,
          messages: [{ role: 'user', content: prompt }],
        });
        return r.content.filter((b) => b.type === 'text').map((b) => (b as { text: string }).text).join('\n');
      },
    });
  }

  // Local subscription CLI — only when no API provider is configured, so a
  // production deployment (which has no CLI) is never silently half-probed.
  if (targets.length === 0 && cliAvailable()) {
    targets.push({
      model: 'Claude Sonnet (CLI)',
      ask: async (prompt) => (await aiText(PROBE_SYSTEM, prompt, { maxTokens: 1200 })) ?? '',
    });
  }

  return targets;
}

function parseList(text: string, tag: 'BRANDS' | 'SOURCES'): string[] {
  const m = text.match(new RegExp(`${tag}:\\s*(\\[[\\s\\S]*?\\])`));
  if (!m) return [];
  try {
    const arr = JSON.parse(m[1]);
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string').slice(0, 25) : [];
  } catch {
    return [];
  }
}

/** Generate buyer personas for the category (Gumshoe-style persona testing). */
async function generatePersonas(category: string): Promise<PersonaDef[]> {
  const raw = await aiText(
    null,
    `Category: "${category}". Invent 3 distinct, realistic buyer personas for this category (like "Weekend Track-Day Enthusiast" or "Budget-Conscious Commuter"). Respond with ONLY JSON, no prose: {"personas":[{"name":"...","description":"one sentence"}]}`,
    { maxTokens: 2500 },
  );
  if (!raw) return [];
  const parsed = extractJson(raw) as { personas?: unknown } | null;
  return Array.isArray(parsed?.personas)
    ? parsed.personas
        .filter((p: unknown): p is PersonaDef => !!p && typeof (p as PersonaDef).name === 'string')
        .slice(0, 3)
    : [];
}

interface PlannedPrompt { prompt: string; persona: string; topic: string }

function buildPromptPlan(category: string, keywords: string[], personas: PersonaDef[]): PlannedPrompt[] {
  const plan: PlannedPrompt[] = [];

  // Generic category prompts (baseline slice).
  plan.push(
    { prompt: `What are the top brands for ${category}?`, persona: 'General buyer', topic: 'Best in category' },
    { prompt: `Which websites are best for buying ${category}?`, persona: 'General buyer', topic: 'Where to buy' },
  );
  for (const kw of keywords.slice(0, 2)) {
    plan.push({ prompt: `What are the best ${kw}? Recommend specific brands.`, persona: 'General buyer', topic: 'Buying guide' });
  }

  // Persona-conditioned prompts (Gumshoe's differentiator).
  for (const p of personas) {
    plan.push(
      {
        prompt: `I'm a ${p.name.toLowerCase()} (${p.description}). What ${category} brands would you recommend for me?`,
        persona: p.name,
        topic: 'Best in category',
      },
      {
        prompt: `As a ${p.name.toLowerCase()}, how should I choose between ${category} brands? Name the strongest options.`,
        persona: p.name,
        topic: 'Comparison',
      },
    );
  }

  // Dedup + cap. 8 prompts × N models keeps latency and cost sane.
  const seen = new Set<string>();
  return plan.filter((p) => !seen.has(p.prompt) && seen.add(p.prompt)).slice(0, 8);
}

/** Summarize how the models characterized the brand (sentiment + descriptors). */
async function analyzePerception(brand: string, mentionedAnswers: string[]): Promise<Perception | null> {
  if (mentionedAnswers.length === 0) {
    return { sentiment: 'not_discussed', descriptors: [], summary: `${brand} was not mentioned in any AI answer, so no brand perception exists yet.` };
  }
  // One retry — a single flaky AI response shouldn't blank out the whole
  // perception panel (observed on a live run: every other visibility field
  // populated while perception came back null with nothing logged).
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await aiText(
      null,
      `These are AI assistant answers that mentioned the brand "${brand}":\n\n${mentionedAnswers.join('\n---\n').slice(0, 6000)}\n\nSummarize how the brand was characterized. Respond with ONLY JSON, no prose: {"sentiment":"positive|neutral|mixed|negative","descriptors":["adjective or phrase", ...max 6],"summary":"one sentence"}`,
      { maxTokens: 1500 },
    );
    const parsed = raw ? (extractJson(raw) as { sentiment?: Perception['sentiment']; descriptors?: unknown; summary?: unknown } | null) : null;
    if (parsed?.sentiment) {
      return {
        sentiment: parsed.sentiment,
        descriptors: Array.isArray(parsed.descriptors) ? (parsed.descriptors as string[]).slice(0, 6) : [],
        summary: typeof parsed.summary === 'string' ? parsed.summary : '',
      };
    }
    console.warn(`Perception analysis attempt ${attempt + 1} failed (${raw ? 'unparseable response' : 'no response'})`);
  }
  return null;
}

function slice(results: PromptResult[], key: (r: PromptResult) => string): Slice[] {
  const map = new Map<string, { total: number; hit: number }>();
  for (const r of results) {
    const k = key(r);
    const e = map.get(k) ?? { total: 0, hit: 0 };
    e.total++;
    if (r.mentioned) e.hit++;
    map.set(k, e);
  }
  return [...map.entries()].map(([label, { total, hit }]) => ({
    label,
    visibilityPct: Math.round((hit / total) * 100),
    prompts: total,
  }));
}

export async function analyzeVisibility(input: VisibilityInput): Promise<VisibilityResult | null> {
  const targets = await buildProbeTargets();
  if (targets.length === 0) return null;

  const category = deriveCategory(input.title, input.domain);
  const personas = await generatePersonas(category);
  const plan = buildPromptPlan(category, input.keywords ?? [], personas);
  if (plan.length === 0) return null;

  const target = targetCandidates(input.domain, input.title);

  const settled = await Promise.allSettled(
    targets.flatMap((t) =>
      plan.map(async (p): Promise<PromptResult & { raw: string }> => {
        const raw = await t.ask(p.prompt);
        return {
          ...p,
          model: t.model,
          mentioned: false,
          brands: parseList(raw, 'BRANDS'),
          citations: parseList(raw, 'SOURCES'),
          raw,
        };
      }),
    ),
  );

  const results: (PromptResult & { raw: string })[] = [];
  const counts = new Map<string, { display: string; count: number; isYou: boolean }>();
  const citationCounts = new Map<string, number>();

  for (const s of settled) {
    if (s.status !== 'fulfilled') continue;
    const r = s.value;
    const seenThisPrompt = new Set<string>();
    for (const b of r.brands) {
      const key = norm(b);
      if (!key || seenThisPrompt.has(key)) continue;
      seenThisPrompt.add(key);
      const isYou = target.keys.some((t) => key === t || key.includes(t) || t.includes(key));
      if (isYou) r.mentioned = true;
      const existing = counts.get(key);
      if (existing) {
        existing.count++;
        if (isYou) existing.isYou = true;
      } else {
        counts.set(key, { display: b, count: 1, isYou });
      }
    }
    // Fallback: the raw answer may name the domain without listing it as a brand.
    if (!r.mentioned && r.raw.toLowerCase().includes(input.domain.replace(/^www\./, '').toLowerCase())) {
      r.mentioned = true;
    }
    for (const c of r.citations) {
      const d = c.toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0];
      if (d && d.includes('.')) citationCounts.set(d, (citationCounts.get(d) ?? 0) + 1);
    }
    results.push(r);
  }

  if (results.length === 0) return null;

  const mentionedAnswers = results.filter((r) => r.mentioned).map((r) => r.raw);
  const perception = await analyzePerception(target.display, mentionedAnswers);

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
  if (!leaderboard.some((l) => l.isYou)) {
    leaderboard.push({
      brand: target.display,
      mentions: mentionedCount,
      visibilityPct: Math.round((mentionedCount / results.length) * 100),
      isYou: true,
    });
  }

  // Strip raw answer text from the public payload (large + unnecessary).
  const publicPrompts: PromptResult[] = results.map(({ raw: _raw, ...rest }) => {
    void _raw;
    return rest;
  });

  return {
    visibilityPct: Math.round((mentionedCount / results.length) * 100),
    totalPrompts: results.length,
    brandsSeen: counts.size,
    targetBrand: target.display,
    prompts: publicPrompts,
    leaderboard,
    models: slice(publicPrompts, (r) => r.model),
    personas: slice(publicPrompts, (r) => r.persona),
    topics: slice(publicPrompts, (r) => r.topic),
    personaDefs: personas,
    citations: [...citationCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([domain, count]) => ({ domain, count })),
    perception,
  };
}
