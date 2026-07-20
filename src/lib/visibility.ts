import OpenAI from 'openai';
import { activeProvider, aiText, extractJson, cliAvailable, OPENAI_MODEL } from '@/lib/ai';

/**
 * Brand Visibility engine v2 — Gumshoe/Profound-style AI answer analysis.
 *
 * Pipeline per audit:
 *  1. Generate 3 buyer personas for the site's category (1 AI call).
 *  2. Build a prompt set: per-persona buyer questions + generic category
 *     questions, each tagged with a topic bucket.
 *  3. Probe every prompt against one of the configured engines (Gemini/OpenAI,
 *     OpenAI explicitly, Anthropic Claude, Perplexity Sonar — whichever keys
 *     are present), each exactly as a consumer would ask — the model is never
 *     told which brand we're measuring. Prompts are distributed round-robin
 *     across engines rather than fanned out to every engine, so total probe
 *     count stays bounded regardless of how many keys are configured.
 *  4. Each answer yields: brands mentioned + sources/domains (and full URLs,
 *     when the model emits them) the model would cite. Aggregations produce:
 *     overall visibility %, per-model slice, per-persona slice, per-topic
 *     slice, competitive leaderboard, and a citation-domain leaderboard
 *     (digital-PR targeting).
 *  5. If the brand was mentioned anywhere, one final call summarizes how the
 *     models characterized it (sentiment + descriptors + attribute-level
 *     sentiment drivers) — brand perception.
 */

export interface PromptResult {
  prompt: string;
  persona: string;
  topic: string;
  model: string;
  mentioned: boolean;
  brands: string[];
  citations: string[];
  /** Full URLs parsed out of SOURCES, when the model emitted them (subset of citations). */
  citationUrls?: string[];
}

export interface LeaderboardEntry { brand: string; mentions: number; visibilityPct: number; isYou: boolean }
export interface Slice { label: string; visibilityPct: number; prompts: number }
export interface CitationEntry { domain: string; count: number }
export interface Perception {
  sentiment: 'positive' | 'neutral' | 'mixed' | 'negative' | 'not_discussed';
  descriptors: string[];
  summary: string;
  /** Attribute-level sentiment breakdown (price, quality, shipping, etc.), when the AI call surfaces it. */
  drivers?: { attribute: string; sentiment: 'positive' | 'neutral' | 'negative'; evidence: string }[];
}
export interface PersonaDef {
  name: string;
  description: string;
  role?: string;
  painPoints?: string[];
  purchaseCriteria?: string[];
}

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
  /**
   * Raw answer texts (capped) from probes that mentioned the brand — consumed
   * by the claims-accuracy stage in runAudit; stripped before persistence by
   * callers that don't need it.
   */
  mentionedAnswers?: string[];
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
  const strip = (s: string) =>
    s
      .replace(/\b(official site|official store|new|shop|buy|home)\b/gi, ' ')
      .replace(/[®™©]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

  // Drop title segments that are just the brand name (they otherwise leak
  // into every visibility prompt: "top brands for Tote&Carry?"), keeping the
  // descriptive category segments ("New Luggage Sets, Suitcases, Travel Bags").
  const root = norm(domain.replace(/^www\./, '').split('.')[0]);
  const segments = title
    .split(/[|–—-]/)
    .flatMap((s) => s.split(' - '))
    .map((s) => s.trim())
    .filter(Boolean);
  // Compare on boilerplate-stripped text, and treat "&" as "n"/"and" so
  // "Tote&Carry" matches the domain root "totencarry".
  const nonBrand = segments.filter((s) => {
    const base = strip(s);
    const variants = [base, base.replace(/&/g, 'n'), base.replace(/&/g, 'and')].map(norm).filter(Boolean);
    return base && !(root && variants.some((n) => n.includes(root) || root.includes(n)));
  });
  const joined = strip(nonBrand.join(' '));
  if (joined) return joined;

  // Fallback: previous behavior — cleaned first segment, then domain root.
  const seg = (title.split(/[|–—]/)[0] || title).split(' - ')[0].trim();
  return strip(seg) || domain.split('.')[0];
}

const PROBE_SYSTEM =
  'You are a helpful shopping/search assistant. In 3-4 sentences, answer the user\'s question naturally with specific brand, product, and website recommendations, as you would for any consumer. Keep the answer brief — you MUST leave room to also output the two required final lines below; never let the answer run so long that those lines get cut off. After your (brief) answer, output exactly two final lines:\n' +
  'BRANDS: ["Brand One", "Brand Two"] — a JSON array of every brand, company, or website you mentioned.\n' +
  'SOURCES: ["example.com"] — a JSON array of website domains or full URLs you would cite or point the user to (may be empty).';

interface ProbeTarget { model: string; ask: (prompt: string) => Promise<string> }

/**
 * Build the list of engines to probe. Multi-engine when keys are available:
 *  - Gemini or OpenAI, whichever `activeProvider()` resolves to (mutually
 *    exclusive by design in ai.ts — Gemini wins if both keys are set).
 *  - OpenAI explicitly, when OPENAI_API_KEY is set AND it wasn't already
 *    picked as the active provider above (so both engines get probed
 *    independently rather than collapsing into a single slot).
 *  - Anthropic Claude, when ANTHROPIC_API_KEY is set.
 *  - Perplexity Sonar (OpenAI-compatible endpoint), when PERPLEXITY_API_KEY
 *    is set — genuinely search-grounded, a distinct and valuable GEO signal.
 * Falls back to the local subscription CLI only when zero API keys resolved
 * any target, so a production deployment with exactly one key still behaves
 * exactly as before.
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

  // OpenAI as an independent engine when it wasn't already chosen as the
  // active provider above (i.e. Gemini took that slot instead).
  if (process.env.OPENAI_API_KEY && provider?.label !== `OpenAI ${OPENAI_MODEL}`) {
    const openaiClient = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    targets.push({
      model: `OpenAI ${OPENAI_MODEL}`,
      ask: async (prompt) => {
        const r = await openaiClient.chat.completions.create({
          model: OPENAI_MODEL,
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

  if (process.env.PERPLEXITY_API_KEY) {
    const perplexity = new OpenAI({ apiKey: process.env.PERPLEXITY_API_KEY, baseURL: 'https://api.perplexity.ai' });
    targets.push({
      model: 'Perplexity sonar',
      ask: async (prompt) => {
        const r = await perplexity.chat.completions.create({
          model: 'sonar',
          max_tokens: 1200,
          messages: [{ role: 'system', content: PROBE_SYSTEM }, { role: 'user', content: prompt }],
        });
        return r.choices[0]?.message?.content ?? '';
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

/**
 * Distribute prompts across engines round-robin rather than probing every
 * prompt against every engine — bounds total probe count at ~`plan.length`
 * regardless of how many engines are configured, while still giving each
 * engine a proportional, deterministic slice and asking every prompt exactly
 * once. Pure/exported so the distribution logic is unit-testable without
 * touching any AI provider.
 */
export function distributeAcrossTargets<P, T>(plan: P[], targets: T[]): { target: T; prompt: P }[] {
  if (targets.length === 0) return [];
  return plan.map((prompt, i) => ({ target: targets[i % targets.length], prompt }));
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
    `Category: "${category}". Invent 3 distinct, realistic buyer personas for this category (like "Weekend Track-Day Enthusiast" or "Budget-Conscious Commuter"). Respond with ONLY JSON, no prose: {"personas":[{"name":"...","description":"one sentence","role":"short job/life role label","painPoints":["pain point", ...max 4],"purchaseCriteria":["what they weigh when buying", ...max 4]}]}`,
    { maxTokens: 2500 },
  );
  if (!raw) return [];
  const parsed = extractJson(raw) as { personas?: unknown } | null;
  return Array.isArray(parsed?.personas)
    ? parsed.personas
        .filter((p: unknown): p is PersonaDef => !!p && typeof (p as PersonaDef).name === 'string')
        .slice(0, 3)
        .map((p) => ({
          name: p.name,
          description: p.description,
          role: typeof p.role === 'string' ? p.role : undefined,
          painPoints: Array.isArray(p.painPoints)
            ? (p.painPoints as unknown[]).filter((x): x is string => typeof x === 'string').slice(0, 4)
            : undefined,
          purchaseCriteria: Array.isArray(p.purchaseCriteria)
            ? (p.purchaseCriteria as unknown[]).filter((x): x is string => typeof x === 'string').slice(0, 4)
            : undefined,
        }))
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
    // Persona names often arrive as "The Savvy Jetsetter" — drop the leading
    // article so "I'm a the savvy jetsetter" doesn't reach the probe models.
    const personaRef = p.name.replace(/^the\s+/i, '').toLowerCase();
    plan.push(
      {
        prompt: `I'm a ${personaRef} (${p.description}). What ${category} brands would you recommend for me?`,
        persona: p.name,
        topic: 'Best in category',
      },
      {
        prompt: `As a ${personaRef}, how should I choose between ${category} brands? Name the strongest options.`,
        persona: p.name,
        topic: 'Comparison',
      },
    );
  }

  // Dedup + cap. 8 prompts split round-robin across engines keeps latency and cost sane.
  const seen = new Set<string>();
  return plan.filter((p) => !seen.has(p.prompt) && seen.add(p.prompt)).slice(0, 8);
}

/** Summarize how the models characterized the brand (sentiment + descriptors + drivers). */
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
      `These are AI assistant answers that mentioned the brand "${brand}":\n\n${mentionedAnswers.join('\n---\n').slice(0, 6000)}\n\nSummarize how the brand was characterized. Respond with ONLY JSON, no prose: {"sentiment":"positive|neutral|mixed|negative","descriptors":["adjective or phrase", ...max 6],"summary":"one sentence","drivers":[{"attribute":"e.g. price, quality, shipping","sentiment":"positive|neutral|negative","evidence":"short quote or paraphrase"}, ...max 6]}`,
      { maxTokens: 3000 },
    );
    const parsed = raw
      ? (extractJson(raw) as { sentiment?: Perception['sentiment']; descriptors?: unknown; summary?: unknown; drivers?: unknown } | null)
      : null;
    if (parsed?.sentiment) {
      const drivers = Array.isArray(parsed.drivers)
        ? (parsed.drivers as unknown[])
            .filter(
              (d): d is { attribute: string; sentiment: 'positive' | 'neutral' | 'negative'; evidence: string } =>
                !!d &&
                typeof (d as Record<string, unknown>).attribute === 'string' &&
                typeof (d as Record<string, unknown>).sentiment === 'string' &&
                typeof (d as Record<string, unknown>).evidence === 'string',
            )
            .slice(0, 6)
        : undefined;
      return {
        sentiment: parsed.sentiment,
        descriptors: Array.isArray(parsed.descriptors) ? (parsed.descriptors as string[]).slice(0, 6) : [],
        summary: typeof parsed.summary === 'string' ? parsed.summary : '',
        ...(drivers && drivers.length > 0 ? { drivers } : {}),
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

export interface PersonaTopicCell { persona: string; topic: string; visibilityPct: number; prompts: number }
export interface PersonaTopicHeatmap { personas: string[]; topics: string[]; cells: PersonaTopicCell[] }

/**
 * Cross-tab of persona x topic visibility from raw PromptResult data — pure
 * function so it's independently testable without hitting any AI provider.
 * Order of `personas`/`topics` follows first-seen order in `result.prompts`.
 */
export function personaTopicHeatmap(result: { prompts: PromptResult[] }): PersonaTopicHeatmap {
  const personaOrder: string[] = [];
  const topicOrder: string[] = [];
  // Keyed on the pair itself (JSON-encoded) so persona/topic labels that
  // might contain any delimiter character never collide or mis-split.
  const cellMap = new Map<string, { persona: string; topic: string; total: number; hit: number }>();

  for (const r of result.prompts) {
    if (!personaOrder.includes(r.persona)) personaOrder.push(r.persona);
    if (!topicOrder.includes(r.topic)) topicOrder.push(r.topic);
    const key = JSON.stringify([r.persona, r.topic]);
    const e = cellMap.get(key) ?? { persona: r.persona, topic: r.topic, total: 0, hit: 0 };
    e.total++;
    if (r.mentioned) e.hit++;
    cellMap.set(key, e);
  }

  const cells: PersonaTopicCell[] = [...cellMap.values()].map(({ persona, topic, total, hit }) => ({
    persona,
    topic,
    visibilityPct: Math.round((hit / total) * 100),
    prompts: total,
  }));

  return { personas: personaOrder, topics: topicOrder, cells };
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
    distributeAcrossTargets(plan, targets).map(async ({ target: t, prompt: p }): Promise<PromptResult & { raw: string }> => {
      const raw = await t.ask(p.prompt);
      const rawSources = parseList(raw, 'SOURCES');
      return {
        ...p,
        model: t.model,
        mentioned: false,
        brands: parseList(raw, 'BRANDS'),
        citations: rawSources,
        citationUrls: rawSources.filter((s) => /^https?:\/\//i.test(s)),
        raw,
      };
    }),
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
    mentionedAnswers: mentionedAnswers.slice(0, 12).map((a) => a.slice(0, 1500)),
  };
}
