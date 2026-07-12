import { z } from 'zod';
import { zodResponseFormat } from 'openai/helpers/zod';
import { activeProvider, aiText, extractJson, cliAvailable } from '@/lib/ai';

/**
 * Action Plan Proposal — the systematic, consulting-grade companion to the
 * score-oriented Optimization Plan. Where the Optimization Plan answers
 * "which levers move which score", this answers "how do we actually execute":
 *
 *  On-site  (a) concrete technical SEO/GEO setup (with code-level specifics)
 *           (b) a phased workflow roadmap (who does what, when, deliverable)
 *  Off-site (a) backlink acquisition tactics with named target sites
 *           (b) the GEO keywords to own (AI-answer queries, not just SERP)
 *           (c) the funnels & content sites to build presence on
 *
 * Generated ON DEMAND from a completed audit (not inside the 60s audit
 * pipeline) and cached in seo_audits.action_proposal. Its inputs are the
 * audit's REAL findings — especially visibility.citations (the domains AI
 * engines actually cite in this category), which is the ground-truth
 * off-site target list no generic playbook can match.
 */

const TechnicalSetupSchema = z.object({
  area: z.string(),
  rationale: z.string(),
  steps: z.array(z.string()),
  snippet: z.string(), // code/markup example; empty string when not applicable
});

const RoadmapPhaseSchema = z.object({
  phase: z.string(),
  timeframe: z.string(),
  focus: z.string(),
  tasks: z.array(z.string()),
  deliverable: z.string(),
});

const BacklinkTacticSchema = z.object({
  tactic: z.string(),
  description: z.string(),
  targetSites: z.array(z.string()),
  kpi: z.string(),
});

const GeoKeywordSchema = z.object({
  keyword: z.string(),
  intent: z.string(),
  funnelStage: z.string(),
  rationale: z.string(),
});

const ChannelTargetSchema = z.object({
  channel: z.string(),
  type: z.string(), // e.g. "review site", "community", "publisher", "video"
  funnelStage: z.string(),
  action: z.string(),
});

export const ActionProposalSchema = z.object({
  overview: z.string(),
  onSite: z.object({
    technicalSetup: z.array(TechnicalSetupSchema),
    workflowRoadmap: z.array(RoadmapPhaseSchema),
  }),
  offSite: z.object({
    backlinkTactics: z.array(BacklinkTacticSchema),
    geoKeywords: z.array(GeoKeywordSchema),
    channelTargets: z.array(ChannelTargetSchema),
  }),
});

export type ActionProposal = z.infer<typeof ActionProposalSchema>;

export interface ActionProposalInput {
  domain: string;
  category: string;
  overallScore: number | null;
  geoScore: number | null;
  visibilityPct: number | null;
  technicalIssues: string[];
  onPageIssues: string[];
  geoIssues: string[];
  /** Domains AI engines actually cited in this category — ground truth for off-site targets. */
  citedDomains: string[];
  /** Competitor brands from the AI-answer leaderboard. */
  competitors: string[];
  /** Keyword opportunities from synthesis (keyword + intent strings). */
  keywords: { keyword: string; intent: string }[];
}

/**
 * Build the proposal input from a completed audit's stored result payload
 * (seo_audits.result_json.data). Mirrors the issue derivation in runAudit —
 * kept here so the on-demand proposal endpoint doesn't re-run any scraping.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function proposalInputFromAudit(data: any): ActionProposalInput {
  const technicalIssues: string[] = [];
  if (!data.technical?.isHttps) technicalIssues.push('Site is not served over HTTPS');
  if (!data.technical?.hasRobotsTxt) technicalIssues.push('No robots.txt found');
  if (!data.technical?.hasSitemapXml) technicalIssues.push('No sitemap.xml found');
  if (data.technical?.mobileSpeedScore != null && data.technical.mobileSpeedScore < 60) {
    technicalIssues.push(`Mobile PageSpeed score is low (${data.technical.mobileSpeedScore}/100)`);
  }
  if (data.siteCrawl?.pagesMissingMeta > 0) technicalIssues.push(`${data.siteCrawl.pagesMissingMeta} crawled page(s) missing a meta description`);
  if (data.siteCrawl?.thinContentPages > 0) technicalIssues.push(`${data.siteCrawl.thinContentPages} crawled page(s) have thin content`);

  const onPageIssues: string[] = [];
  if (data.onPage?.h1Count === 0) onPageIssues.push('Homepage has zero H1 tags');
  else if (data.onPage?.h1Count > 1) onPageIssues.push(`Homepage has ${data.onPage.h1Count} H1 tags`);
  if (data.onPage?.titleLength > 60) onPageIssues.push(`Title tag is ${data.onPage.titleLength} chars (over 60)`);
  if (data.onPage?.metaDescLength < 120 || data.onPage?.metaDescLength > 160) {
    onPageIssues.push(`Meta description is ${data.onPage?.metaDescLength ?? 0} chars (optimal 120-160)`);
  }
  if (data.schema && !data.schema.hasOrganization && !data.schema.hasProduct) onPageIssues.push('No Organization or Product JSON-LD');
  if (!data.cro?.hasReviewsSchema) onPageIssues.push('No Review/AggregateRating schema');

  const category = ((data.onPage?.title ?? '').split(/[|–—]/)[0] || '').split(' - ')[0]
    .replace(/\b(official site|official store|new|shop|buy|home)\b/gi, ' ')
    .replace(/[®™©]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim() || data.domain;

  return {
    domain: data.domain,
    category,
    overallScore: data.overallScore ?? null,
    geoScore: data.geoScore ?? null,
    visibilityPct: data.visibilityPct ?? null,
    technicalIssues,
    onPageIssues,
    geoIssues: data.geo?.recommendations ?? [],
    citedDomains: (data.visibility?.citations ?? []).map((c: { domain: string }) => c.domain).slice(0, 12),
    competitors: (data.visibility?.leaderboard ?? [])
      .filter((l: { isYou: boolean }) => !l.isYou)
      .map((l: { brand: string }) => l.brand)
      .slice(0, 8),
    keywords: (data.synthesis?.keywordOpportunities ?? [])
      .map((k: { keyword: string; intent: string }) => ({ keyword: k.keyword, intent: k.intent }))
      .slice(0, 8),
  };
}

function buildPrompt(input: ActionProposalInput): string {
  return `You are a senior SEO/GEO consultant writing a systematic action plan proposal for ${input.domain} (category: ${input.category}).

AUDIT FINDINGS (real, verified):
- Overall SEO score: ${input.overallScore ?? 'n/a'}/100 · GEO readiness: ${input.geoScore ?? 'n/a'}/100 · Brand visibility in AI answers: ${input.visibilityPct ?? 'n/a'}%
- Technical issues: ${input.technicalIssues.join('; ') || 'none detected'}
- On-page issues: ${input.onPageIssues.join('; ') || 'none detected'}
- GEO gaps: ${input.geoIssues.join('; ') || 'none detected'}
- Domains AI engines ACTUALLY cite in this category (measured): ${input.citedDomains.join(', ') || 'none captured'}
- Competing brands in AI answers: ${input.competitors.join(', ') || 'none captured'}
- Keyword opportunities: ${input.keywords.map((k) => `${k.keyword} (${k.intent})`).join('; ') || 'none captured'}

Write the proposal. Be CONCISE (every string field short) and SPECIFIC to the findings above — never generic filler. Structure:

1. overview: 2-3 sentences framing the strategy (≤60 words).

2. onSite.technicalSetup: 4-5 areas of concrete technical SEO/GEO setup. Each: area (≤6 words), rationale (one sentence tied to a finding), steps (3-4 imperative steps, ≤15 words each), snippet (a SHORT code/markup example where applicable — e.g. actual JSON-LD, robots.txt lines, llms.txt content, meta tags — or "" if not applicable). At least 2 areas must be GEO-specific (AI-crawler/LLM-facing: llms.txt, schema for AI extraction, Q&A content structure, freshness signals).

3. onSite.workflowRoadmap: exactly 4 phases (e.g. Foundation / Structure / Content / Measure). Each: phase name, timeframe (e.g. "Week 1-2"), focus (one sentence), tasks (3-4, ≤12 words each), deliverable (≤10 words).

4. offSite.backlinkTactics: 4 tactics for earning backlinks. Each: tactic (≤6 words), description (one sentence), targetSites (2-4 REAL site names/domains — prioritize the measured cited domains above where relevant, plus well-known sites in this category), kpi (≤10 words).

5. offSite.geoKeywords: 5-6 GEO keywords to own — phrased the way buyers ask AI assistants (question/comparison style, not just head terms). Each: keyword, intent (informational/commercial/transactional/comparison), funnelStage (Awareness/Consideration/Decision), rationale (one sentence, reference competitors or citations where relevant).

6. offSite.channelTargets: 4-5 funnels/content sites to build presence on. Each: channel (specific site or platform — again prioritize the measured cited domains), type, funnelStage, action (one concrete step, ≤15 words).`;
}

export async function generateActionProposal(input: ActionProposalInput): Promise<ActionProposal | null> {
  const prompt = buildPrompt(input);
  const provider = activeProvider();

  if (provider) {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const response = await provider.client.chat.completions.parse({
          model: provider.model,
          max_tokens: 8000,
          messages: [{ role: 'user', content: prompt }],
          response_format: zodResponseFormat(ActionProposalSchema, 'action_proposal'),
        });
        const parsed = response.choices[0]?.message?.parsed;
        if (parsed) return parsed;
        console.error(`Action proposal returned no parsed output (attempt ${attempt + 1})`);
      } catch (e) {
        console.error(`Action proposal error (attempt ${attempt + 1}):`, e);
        if (cliAvailable()) break;
      }
    }
  }

  if (cliAvailable()) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const raw = await aiText(
        null,
        `${prompt}\n\nRespond with ONLY a JSON object (no prose, no code fences) with exactly these keys: overview (string), onSite ({technicalSetup:[{area,rationale,steps:[string],snippet}], workflowRoadmap:[{phase,timeframe,focus,tasks:[string],deliverable}]}), offSite ({backlinkTactics:[{tactic,description,targetSites:[string],kpi}], geoKeywords:[{keyword,intent,funnelStage,rationale}], channelTargets:[{channel,type,funnelStage,action}]}).`,
        { maxTokens: 8000 },
      );
      if (!raw) continue;
      const parsed = ActionProposalSchema.safeParse(extractJson(raw));
      if (parsed.success) return parsed.data;
      console.error(`CLI action proposal failed schema validation (attempt ${attempt + 1}):`, parsed.error?.issues?.slice(0, 3));
    }
  }

  console.error('No AI provider produced a valid action proposal.');
  return null;
}
