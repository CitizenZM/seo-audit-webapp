'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { AlertCircle, CheckCircle2, XCircle, Zap, Target, Link2, FileText, Gauge, Search, Sparkles } from 'lucide-react';
import Explainer from './Explainer';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import StatCard from './StatCard';
import GeoCard from './GeoCard';
import VisibilityCard from './VisibilityCard';
import OptimizationPlanCard from './OptimizationPlanCard';
import CitationsCard from './CitationsCard';
import TrendsCard from './TrendsCard';
import { saveAudit, previousScore } from '@/lib/history';
import EmailReport from './EmailReport';
import WatchlistCard from './WatchlistCard';
import ActionPlanBoard from './ActionPlanBoard';
import RadarChart from './RadarChart';
import TitleTagsOptimizer from './TitleTagsOptimizer';
import ContentBriefs from './ContentBriefs';
import ContentCalendar from './ContentCalendar';
import KeywordIntentChart from './KeywordIntentChart';
import KeywordTable from './KeywordTable';
import CompetitorGapTable from './CompetitorGapTable';
import PersonaHeatmap from './PersonaHeatmap';
import CitationGapCard from './CitationGapCard';
import ClaimsAccuracyCard from './ClaimsAccuracyCard';
import SentimentDriversCard from './SentimentDriversCard';
import CommerceReadinessCard from './CommerceReadinessCard';
import VisibilityTrendCard from './VisibilityTrendCard';
import CrawlerAnalyticsCard from './CrawlerAnalyticsCard';
import ActivationCard from './ActivationCard';

/** (B6) new URL() throws on a malformed value — never let a bad ?url= crash the page. */
function safeHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function DashboardContent() {
  const searchParams = useSearchParams();
  const targetUrl = searchParams.get('url');
  const competitorsParam = searchParams.get('competitors');
  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [data, setData] = useState<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [competitors, setCompetitors] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // Real backend stage (#2) — no more simulated timer. 'queued' until the
  // first poll response comes back.
  const [stage, setStage] = useState<string>('queued');
  const [priorScore, setPriorScore] = useState<number | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (!targetUrl) return;
    let cancelled = false;
    let pollTimer: ReturnType<typeof setTimeout> | undefined;

    function finish(resultData: unknown, resultCompetitors: unknown[], jobId?: string) {
      if (cancelled) return;
      setData(resultData);
      setCompetitors(resultCompetitors || []);
      // Persist to local history for trend comparison (#1). Read the prior
      // score BEFORE overwriting it (B3) so the delta shown later is real.
      // Uses the composite overallScore (always a number, unlike the raw
      // PageSpeed mobileSpeedScore which can be null — B5), so history/email
      // trends are never skipped just because PageSpeed had an off day.
      // The job id (when Supabase persisted it) links to /report/[id] — the
      // exportable report page — from the Reports dashboard.
      const d = resultData as { url: string; domain: string; overallScore?: number };
      const measuredScore: number = d.overallScore ?? 0;
      try {
        setPriorScore(previousScore(d.url));
        saveAudit({
          url: d.url,
          domain: d.domain,
          score: measuredScore,
          competitors: (resultCompetitors || []).length,
          timestamp: Date.now(),
          id: jobId,
        });
      } catch { /* non-fatal */ }
      setLoading(false);
    }

    async function poll(jobId: string) {
      if (cancelled) return;
      try {
        const res = await fetch(`/api/audits/${jobId}`);
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Failed to check audit status');

        setStage(json.stage ?? 'queued');
        if (json.status === 'done' && json.result) {
          finish(json.result.data, json.result.competitors, jobId);
          return;
        }
        if (json.status === 'error') {
          throw new Error(json.error || 'Audit failed');
        }
        pollTimer = setTimeout(() => poll(jobId), 2000);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to check audit status');
          setLoading(false);
        }
      }
    }

    async function start() {
      try {
        const res = await fetch('/api/audits', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: targetUrl, competitors: competitorsParam }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Failed to start audit');

        // No Supabase configured — the server ran synchronously and returned
        // the full result inline (job id is null, nothing to poll).
        if (json.id === null) {
          finish(json.data, json.competitors);
          return;
        }
        setStage(json.stage ?? 'queued');
        pollTimer = setTimeout(() => poll(json.id), 1500);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to start audit');
          setLoading(false);
        }
      }
    }

    start();
    return () => {
      cancelled = true;
      if (pollTimer) clearTimeout(pollTimer);
    };
  }, [targetUrl, competitorsParam]);

  if (!targetUrl) {
    return <div className="p-10 text-center text-red-400">No URL provided</div>;
  }

  if (loading) {
    return (
      <div className="flex min-h-screen bg-[var(--bg)]">
        <Sidebar active="overview" domain={safeHostname(targetUrl)} open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <div className="flex-1 min-w-0">
          <TopBar url={targetUrl} onMenuClick={() => setSidebarOpen(true)} />
          <main className="p-4 sm:p-6 max-w-[1200px] mx-auto">
            <div className="mb-4">
              <div className="text-sm text-[var(--ink-2)] flex items-center gap-2 mb-3">
                <span className="w-2 h-2 rounded-full bg-[var(--brand)] animate-pulse shrink-0" />
                <span className="truncate">Running analysis engine — {safeHostname(targetUrl)}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {[
                  { key: 'crawl', label: 'Crawl site & sitemap' },
                  { key: 'competitors', label: 'Analyze competitors' },
                  { key: 'speed', label: 'Check speed & UX' },
                  { key: 'ai', label: 'AI synthesis' },
                  { key: 'serp', label: 'Live SERP lookup' },
                  { key: 'plan', label: 'Build optimization plan' },
                ].map(({ key, label }, i, arr) => {
                  const stageIdx = arr.findIndex((s) => s.key === stage);
                  const isDone = stageIdx > i || stage === 'done';
                  const isCurrent = stageIdx === i;
                  return (
                    <span
                      key={key}
                      className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                        isDone ? 'bg-[var(--brand-soft)] text-[var(--brand-ink)] border-transparent'
                        : isCurrent ? 'bg-[var(--surface)] text-[var(--ink)] border-[var(--brand)]'
                        : 'bg-[var(--surface)] text-[var(--ink-3)] border-[var(--border)]'
                      }`}
                    >
                      {isDone ? '✓ ' : isCurrent ? '● ' : ''}{label}
                    </span>
                  );
                })}
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3 sm:gap-5 mt-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="card p-4 sm:p-5">
                  <div className="skeleton h-9 w-9 mb-4" />
                  <div className="skeleton h-7 w-24 mb-3" />
                  <div className="skeleton h-4 w-32" />
                </div>
              ))}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5 mt-4 sm:mt-5">
              <div className="card p-4 sm:p-6"><div className="skeleton h-5 w-48 mb-5" />{[0,1,2,3].map(i=> <div key={i} className="skeleton h-4 w-full mb-3" />)}</div>
              <div className="card p-4 sm:p-6"><div className="skeleton h-5 w-48 mb-5" />{[0,1,2].map(i=> <div key={i} className="skeleton h-4 w-full mb-3" />)}</div>
            </div>
          </main>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-4 sm:p-6 bg-[var(--bg)]">
        <div className="card bg-[var(--red-soft)] text-[var(--red)] border-[var(--red)]/20 p-5 sm:p-6 flex items-start sm:items-center gap-3 sm:gap-4 max-w-lg">
          <XCircle size={28} className="shrink-0" />
          <div>
            <h3 className="font-bold text-base sm:text-lg">Analysis Failed</h3>
            <p className="text-sm opacity-80">{error || 'Unknown error occurred'}</p>
          </div>
        </div>
      </div>
    );
  }

  const totalLinks = data.links.internalCount + data.links.externalCount;

  return (
    <div className="flex min-h-screen bg-[var(--bg)]">
      <Sidebar active="overview" domain={data.domain} open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex-1 min-w-0">
        <TopBar url={data.url} onMenuClick={() => setSidebarOpen(true)} />

        <main className="p-4 sm:p-6 max-w-[1200px] mx-auto flex flex-col gap-4 sm:gap-5">
          {/* Print-only report cover header. Hidden on screen (the TopBar covers
              that); shown when exporting to PDF, where the TopBar is stripped. */}
          <div className="print-header">
            <div className="print-brand">SEO &amp; GEO Audit Report</div>
            <div className="print-url">{data.url}</div>
            <div className="print-meta">
              Overall SEO {typeof data.overallScore === 'number' ? `${data.overallScore}/100` : 'N/A'}
              {'  ·  '}AI Visibility (GEO) {typeof data.geoScore === 'number' ? `${data.geoScore}/100` : 'N/A'}
              {'  ·  '}Generated {new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
            </div>
          </div>

          {/* KPI Row */}
          <section id="overview" className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-5 scroll-mt-20">
            <StatCard hero label="Overall SEO Score" value={typeof data.overallScore === 'number' ? `${data.overallScore}/100` : 'N/A'} icon={Search}
              tone={data.overallScore == null ? 'amber' : data.overallScore > 80 ? 'brand' : data.overallScore > 50 ? 'amber' : 'red'} />
            <StatCard hero label="Brand Visibility" value={typeof data.visibilityPct === 'number' ? `${data.visibilityPct}%` : 'N/A'} icon={Sparkles}
              tone={data.visibilityPct == null ? 'amber' : data.visibilityPct >= 40 ? 'blue' : data.visibilityPct >= 10 ? 'amber' : 'red'} />
            <StatCard label="GEO Readiness" value={typeof data.geoScore === 'number' ? `${data.geoScore}/100` : 'N/A'} icon={Sparkles}
              tone={data.geoScore == null ? 'amber' : data.geoScore > 80 ? 'brand' : data.geoScore > 50 ? 'amber' : 'red'} />
            <StatCard label="Mobile Speed" value={data.technical.mobileSpeedScore != null ? `${data.technical.mobileSpeedScore}/100` : 'N/A'} icon={Gauge}
              tone={data.technical.mobileSpeedScore == null ? 'amber' : data.technical.mobileSpeedScore > 80 ? 'brand' : data.technical.mobileSpeedScore > 50 ? 'amber' : 'red'} />
            <StatCard label="On-Page Links" value={totalLinks} icon={Link2} tone="blue" />
            <StatCard label="Words of Content" value={data.onPage.wordCount.toLocaleString()} icon={FileText} tone="brand" />
          </section>

          {/* Brand Visibility — Gumshoe-style visibility audit (headline section) */}
          <VisibilityCard visibility={data.visibility ?? null} domain={data.domain} solution={data.sectionSolutions?.visibility ?? null} />

          {/* Persona x Topic heatmap + persona detail (role/pain points/purchase criteria) */}
          <PersonaHeatmap heatmap={data.visibilityExtras?.heatmap ?? null} personaDefs={data.visibility?.personaDefs ?? null} solution={data.sectionSolutions?.['persona-heatmap'] ?? null} />

          {/* Perception drivers — sentiment-tagged attributes with evidence */}
          <SentimentDriversCard drivers={data.visibility?.perception?.drivers ?? null} solution={data.sectionSolutions?.['sentiment-drivers'] ?? null} />

          {/* Claims accuracy — fact-check of what AI models say about the brand */}
          <ClaimsAccuracyCard claims={data.visibilityExtras?.claims ?? null} solution={data.sectionSolutions?.['claims-accuracy'] ?? null} />

          {/* Citation audit — which domains AI models cite in this category */}
          {data.visibility?.citations?.length > 0 && (
            <CitationsCard citations={data.visibility.citations} domain={data.domain} solution={data.sectionSolutions?.citations ?? null} />
          )}

          {/* Citation gap — domains AI engines cite where the brand is absent (outreach targets) */}
          <CitationGapCard citationGap={data.visibilityExtras?.citationGap ?? null} solution={data.sectionSolutions?.['citation-gap'] ?? null} />

          {/* Trends — score history for this URL */}
          <TrendsCard url={data.url} />

          {/* AI-answer visibility % trend + competitor movers */}
          <VisibilityTrendCard domain={data.domain} />

          {/* GEO — AI crawler access & readiness */}
          {data.geo && <GeoCard geo={data.geo} solution={data.sectionSolutions?.geo ?? null} />}

          {/* Commerce readiness — AI shopping-agent checklist */}
          <CommerceReadinessCard commerce={data.geo?.commerce ?? null} solution={data.sectionSolutions?.['commerce-readiness'] ?? null} />

          {/* Crawler analytics — real AI/search bot hits via Vercel Log Drain */}
          <CrawlerAnalyticsCard />

          {/* Executive Summary from AI Synthesis */}
          {data.synthesis && (
            <section className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-5">
              <div className="card p-4 sm:p-6 lg:col-span-2">
                <h2 className="text-base font-bold text-[var(--ink)] mb-3 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--brand)]" /> Executive Summary
                </h2>
                <p className="text-[var(--ink-2)] text-[0.95rem] leading-relaxed">{data.synthesis.executiveSummary}</p>

                <div className="mt-5 rounded-xl bg-[var(--red-soft)] border border-[var(--red)]/15 p-4">
                  <div className="text-[10px] text-[var(--red)] uppercase tracking-wider font-bold mb-1 flex items-center gap-2"><Target size={13} /> Top Priority Action</div>
                  <p className="text-[var(--ink)] font-semibold">{data.synthesis.topPriority}</p>
                </div>
              </div>

              {data.synthesis.topCategoryScores && (
                <div className="card p-4 sm:p-6">
                  <h3 className="text-base font-bold text-center text-[var(--ink)] mb-2">SEO Health by Category</h3>
                  <RadarChart scores={data.synthesis.topCategoryScores} domain={data.domain} />
                </div>
              )}
            </section>
          )}

          {/* Content Gap + Briefs */}
          {data.synthesis && (
            <section id="content" className="flex flex-col gap-5 scroll-mt-20">
              <Explainer
                what="Content plan generated from this audit's detected gaps: suggested posts with outlines, targeting topics where competitors or AI-cited sources out-cover you."
                actions={[
                  'Publish the suggested post first — it targets your single largest detected gap.',
                  'Keep each brief one topic deep; AI engines cite focused pages over broad ones.',
                ]}
              />
              {data.synthesis.contentGapBrief && (
                <div className="card p-4 sm:p-6">
                  <span className="bg-[var(--blue-soft)] text-[var(--blue)] text-xs px-3 py-1 rounded-full uppercase font-bold tracking-wide">Suggested Post</span>
                  <h4 className="text-lg font-bold text-[var(--ink)] mt-3">{data.synthesis.contentGapBrief.title}</h4>
                  <p className="text-[var(--ink-3)] text-sm italic mt-1">{data.synthesis.contentGapBrief.rationale}</p>
                  <div className="mt-4 bg-[var(--surface-2)] border-l-2 border-[var(--brand)] p-4 rounded-r-lg">
                    <h6 className="text-xs uppercase text-[var(--brand-ink)] font-bold mb-2">Suggested Outline</h6>
                    <ul className="list-none space-y-2">
                      {data.synthesis.contentGapBrief.outline?.map((h2: string, idx: number) => (
                        <li key={idx} className="text-sm text-[var(--ink-2)] flex items-center gap-2">
                          <span className="text-[var(--brand)] text-lg leading-none">→</span> {h2}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
              <ContentBriefs briefs={data.synthesis.contentBriefs} />
            </section>
          )}

          {/* Fallback anchors so sidebar nav always has a target, even when a
              section is conditionally hidden (no synthesis/keywords/competitors data). */}
          {!data.geo && <span id="geo" className="scroll-mt-20" />}
          {!data.visibility && <span id="leaderboard" className="scroll-mt-20" />}
          {!(data.visibility?.citations?.length > 0) && <span id="citations" className="scroll-mt-20" />}
          {!data.synthesis && <span id="content" className="scroll-mt-20" />}
          {!data.synthesis?.contentBriefs?.length && <span id="content-generation" className="scroll-mt-20" />}
          {!data.synthesis?.keywordOpportunities && <span id="keywords" className="scroll-mt-20" />}
          {competitors.length === 0 && <span id="competitors" className="scroll-mt-20" />}

          {/* Technical + CRO Grid */}
          <section className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">

          {/* Technical Health */}
          <div id="technical" className="card p-4 sm:p-6 scroll-mt-20">
            <h3 className="text-base font-bold text-[var(--ink)] mb-4 flex items-center gap-2">
              <Zap size={18} className="text-[var(--blue)]" /> Technical &amp; Performance
            </h3>
            <Explainer
              what="Core technical health: page speed, HTTPS, robots.txt, sitemap, and crawl hygiene. These are ranking prerequisites — weakness here caps everything else."
              actions={[
                'Mobile speed under 60? Compress images and cut third-party scripts first — it is usually 80% of the problem.',
                'Missing robots.txt or sitemap.xml are 10-minute fixes with outsized crawl benefits.',
              ]}
            />
            <div className="flex flex-col">
              <div className="flex justify-between items-center py-2.5 border-b border-[var(--border)]">
                <span className="text-sm text-[var(--ink-2)]">Lighthouse Mobile Speed</span>
                {data.technical.mobileSpeedScore == null ? (
                  <span className="text-sm font-bold text-[var(--ink-3)]">N/A</span>
                ) : (
                  <span className={`text-sm font-bold ${data.technical.mobileSpeedScore > 80 ? 'text-[var(--pass)]' : data.technical.mobileSpeedScore > 50 ? 'text-[var(--warn)]' : 'text-[var(--fail)]'}`}>
                     {data.technical.mobileSpeedScore} / 100
                  </span>
                )}
              </div>
              <div className="flex justify-between items-center py-2.5 border-b border-[var(--border)]">
                <span className="text-sm text-[var(--ink-2)]">HTTPS Secure</span>
                {data.technical.isHttps ? <CheckCircle2 size={18} className="text-[var(--pass)]" /> : <XCircle size={18} className="text-[var(--fail)]" />}
              </div>
              <div className="flex justify-between items-center py-2.5 border-b border-[var(--border)]">
                <span className="text-sm text-[var(--ink-2)]">Robots.txt Present</span>
                {data.technical.hasRobotsTxt ? <CheckCircle2 size={18} className="text-[var(--pass)]" /> : <AlertCircle size={18} className="text-[var(--warn)]" />}
              </div>
              <div className="flex justify-between items-center py-2.5">
                <span className="text-sm text-[var(--ink-2)]">Sitemap.xml Found</span>
                {data.technical.hasSitemapXml ? <CheckCircle2 size={18} className="text-[var(--pass)]" /> : <AlertCircle size={18} className="text-[var(--warn)]" />}
              </div>
            </div>
          </div>

          {/* CRO Signals */}
          <div className="card p-4 sm:p-6">
            <h3 className="text-base font-bold text-[var(--ink)] mb-4 flex items-center gap-2">
              <Target size={18} className="text-[var(--brand)]" /> CRO / UX Signals
            </h3>
            <div className="flex flex-col">
              <div className="flex justify-between items-center py-2.5 border-b border-[var(--border)]">
                <span className="text-sm text-[var(--ink-2)]">Cart / Checkout Detected</span>
                {data.cro.hasCartOrCheckout ? <CheckCircle2 size={18} className="text-[var(--pass)]" /> : <span className="text-xs text-[var(--ink-3)] px-2 py-1 bg-[var(--surface-2)] rounded">Not Found</span>}
              </div>
              <div className="flex justify-between items-center py-2.5 border-b border-[var(--border)]">
                <span className="text-sm text-[var(--ink-2)]">Review / Rating Schema</span>
                {data.cro.hasReviewsSchema ? <CheckCircle2 size={18} className="text-[var(--pass)]" /> : <XCircle size={18} className="text-[var(--fail)]" />}
              </div>
              <div className="flex justify-between items-center py-2.5">
                <span className="text-sm text-[var(--ink-2)]">Image Alt Tag Coverage</span>
                <span className="text-sm font-mono font-semibold text-[var(--brand-ink)]">{data.onPage.imageAltCoverage}</span>
              </div>
            </div>
          </div>

          {/* Core Web Vitals (#5) */}
          {data.technical.cwv && (data.technical.cwv.lcp || data.technical.cwv.cls) && (
            <div className="card p-4 sm:p-6">
              <h3 className="text-base font-bold text-[var(--ink)] mb-4 flex items-center gap-2">
                <Gauge size={18} className="text-[var(--blue)]" /> Core Web Vitals <span className="text-xs font-normal text-[var(--ink-3)]">(Mobile)</span>
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {[
                  { k: 'LCP', v: data.technical.cwv.lcp, hint: 'Largest Contentful Paint' },
                  { k: 'INP/TBT', v: data.technical.cwv.tbt, hint: 'Total Blocking Time' },
                  { k: 'CLS', v: data.technical.cwv.cls, hint: 'Cumulative Layout Shift' },
                  { k: 'FCP', v: data.technical.cwv.fcp, hint: 'First Contentful Paint' },
                  { k: 'TTFB', v: data.technical.cwv.ttfb, hint: 'Server Response Time' },
                ].filter((m) => m.v).map((m) => (
                  <div key={m.k} className="bg-[var(--surface-2)] border border-[var(--border)] rounded-lg p-3">
                    <div className="text-[10px] uppercase tracking-wider text-[var(--ink-3)] font-semibold" title={m.hint}>{m.k}</div>
                    <div className="text-lg font-bold text-[var(--ink)] mt-0.5">{m.v}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Structured Data / Schema (#8) */}
          {data.schema && (
            <div className="card p-4 sm:p-6">
              <h3 className="text-base font-bold text-[var(--ink)] mb-4 flex items-center gap-2">
                <FileText size={18} className="text-[var(--brand)]" /> Structured Data (Schema.org)
              </h3>
              <div className="flex flex-col">
                {[
                  { label: 'Organization / LocalBusiness', ok: data.schema.hasOrganization },
                  { label: 'BreadcrumbList', ok: data.schema.hasBreadcrumb },
                  { label: 'Product', ok: data.schema.hasProduct },
                  { label: 'FAQPage', ok: data.schema.hasFAQ },
                  { label: 'Review / AggregateRating', ok: data.schema.hasReview },
                ].map((s) => (
                  <div key={s.label} className="flex justify-between items-center py-2 border-b border-[var(--border)] last:border-0">
                    <span className="text-sm text-[var(--ink-2)]">{s.label}</span>
                    {s.ok
                      ? <CheckCircle2 size={18} className="text-[var(--pass)]" />
                      : <span className="text-xs text-[var(--ink-3)] px-2 py-0.5 bg-[var(--surface-2)] rounded">Missing</span>}
                  </div>
                ))}
              </div>
              {data.schema.types?.length > 0 && (
                <p className="text-xs text-[var(--ink-3)] mt-3">Detected: {data.schema.types.join(', ')}</p>
              )}
            </div>
          )}

          {/* Site-level Crawl (#3) */}
          {data.siteCrawl && data.siteCrawl.pagesAnalyzed > 0 && (
            <div className="md:col-span-2 card p-4 sm:p-6">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <h3 className="text-base font-bold text-[var(--ink)] flex items-center gap-2">
                  <Link2 size={18} className="text-[var(--blue)]" /> Site-Level Crawl
                </h3>
                <span className="text-xs text-[var(--ink-3)]">
                  {data.siteCrawl.pagesAnalyzed} pages analyzed · {data.siteCrawl.discovered} discovered
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
                {[
                  { label: 'Avg Words', value: data.siteCrawl.avgWordCount, tone: 'ink' },
                  { label: 'Missing Title', value: data.siteCrawl.pagesMissingTitle, tone: data.siteCrawl.pagesMissingTitle ? 'red' : 'pass' },
                  { label: 'Missing Meta', value: data.siteCrawl.pagesMissingMeta, tone: data.siteCrawl.pagesMissingMeta ? 'amber' : 'pass' },
                  { label: 'Missing H1', value: data.siteCrawl.pagesMissingH1, tone: data.siteCrawl.pagesMissingH1 ? 'red' : 'pass' },
                  { label: 'Multiple H1', value: data.siteCrawl.pagesMultipleH1, tone: data.siteCrawl.pagesMultipleH1 ? 'amber' : 'pass' },
                  { label: 'Thin Content', value: data.siteCrawl.thinContentPages, tone: data.siteCrawl.thinContentPages ? 'amber' : 'pass' },
                ].map((m) => (
                  <div key={m.label} className="bg-[var(--surface-2)] border border-[var(--border)] rounded-lg p-3">
                    <div className="text-[10px] uppercase tracking-wider text-[var(--ink-3)] font-semibold">{m.label}</div>
                    <div className={`text-xl font-bold mt-0.5 ${m.tone === 'red' ? 'text-[var(--fail)]' : m.tone === 'amber' ? 'text-[var(--warn)]' : m.tone === 'pass' ? 'text-[var(--pass)]' : 'text-[var(--ink)]'}`}>{m.value}</div>
                  </div>
                ))}
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-[var(--surface-2)] text-[var(--ink-3)] uppercase tracking-wider text-xs">
                    <tr>
                      <th className="px-4 py-3 rounded-l-lg">Page</th>
                      <th className="px-4 py-3">Title</th>
                      <th className="px-4 py-3">Words</th>
                      <th className="px-4 py-3">H1</th>
                      <th className="px-4 py-3">Meta</th>
                      <th className="px-4 py-3 rounded-r-lg">AI Score</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.siteCrawl.sample.map((p: { url: string; title: string; words: number; h1: number; hasMeta: boolean; aiScore?: number }, i: number) => (
                      <tr key={i} className="border-b border-[var(--border)] hover:bg-[var(--surface-2)] transition-colors">
                        <td className="px-4 py-3 text-[var(--blue)] max-w-[200px] truncate">{p.url.replace(/^https?:\/\/[^/]+/, '') || '/'}</td>
                        <td className="px-4 py-3 text-[var(--ink-2)] max-w-[260px] truncate">{p.title}</td>
                        <td className="px-4 py-3 text-[var(--ink-2)] font-mono">{p.words}</td>
                        <td className="px-4 py-3"><span className={p.h1 === 1 ? 'text-[var(--pass)]' : 'text-[var(--fail)]'}>{p.h1}</span></td>
                        <td className="px-4 py-3">{p.hasMeta ? <CheckCircle2 size={16} className="text-[var(--pass)]" /> : <XCircle size={16} className="text-[var(--fail)]" />}</td>
                        <td className="px-4 py-3">
                          {typeof p.aiScore === 'number'
                            ? <span className={`font-semibold ${p.aiScore >= 70 ? 'text-[var(--pass)]' : p.aiScore >= 40 ? 'text-[var(--warn)]' : 'text-[var(--fail)]'}`}>{p.aiScore}</span>
                            : <span className="text-[var(--ink-3)]">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Live SERP Intelligence (#4) */}
          {data.serp && data.serp.organic?.length > 0 && (
            <div className="md:col-span-2 card p-4 sm:p-6">
              <div className="flex items-center justify-between mb-1 flex-wrap gap-2">
                <h3 className="text-base font-bold text-[var(--ink)] flex items-center gap-2">
                  <Search size={18} className="text-[var(--brand)]" /> Live SERP — who ranks for &ldquo;{data.serp.query}&rdquo;
                </h3>
                <span className="text-[10px] uppercase tracking-wider text-[var(--ink-3)] bg-[var(--surface-2)] px-2 py-0.5 rounded">via {data.serp.source}</span>
              </div>
              <p className="text-sm text-[var(--ink-3)] mb-4">Real Google results — these are the pages you compete with for your primary keyword.</p>
              <ol className="flex flex-col gap-2 mb-5">
                {data.serp.organic.slice(0, 10).map((r: { title: string; url: string; domain: string }, i: number) => {
                  const isYou = r.domain && data.domain.replace(/^www\./, '').includes(r.domain);
                  return (
                    <li key={i} className={`flex items-start gap-3 p-3 rounded-lg border ${isYou ? 'border-[var(--brand)] bg-[var(--brand-soft)]' : 'border-[var(--border)] bg-[var(--surface-2)]'}`}>
                      <span className="text-sm font-bold text-[var(--ink-3)] w-5 shrink-0">{i + 1}</span>
                      <div className="min-w-0">
                        <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-[var(--blue)] hover:underline truncate block">{r.title || r.url}</a>
                        <span className="text-xs text-[var(--ink-3)]">{r.domain}{isYou ? ' · You' : ''}</span>
                      </div>
                    </li>
                  );
                })}
              </ol>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {data.serp.peopleAlsoAsk?.length > 0 && (
                  <div>
                    <div className="text-xs uppercase tracking-wider font-semibold text-[var(--ink-3)] mb-2">People Also Ask</div>
                    <ul className="flex flex-col gap-1.5">
                      {data.serp.peopleAlsoAsk.map((q: string, i: number) => (
                        <li key={i} className="text-sm text-[var(--ink-2)] flex gap-2"><span className="text-[var(--brand)]">?</span>{q}</li>
                      ))}
                    </ul>
                  </div>
                )}
                {data.serp.relatedSearches?.length > 0 && (
                  <div>
                    <div className="text-xs uppercase tracking-wider font-semibold text-[var(--ink-3)] mb-2">Related Searches</div>
                    <div className="flex flex-wrap gap-2">
                      {data.serp.relatedSearches.map((q: string, i: number) => (
                        <span key={i} className="text-xs px-2.5 py-1 rounded-full bg-[var(--surface-2)] border border-[var(--border)] text-[var(--ink-2)]">{q}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Keyword Opportunities */}
          {data.synthesis?.keywordOpportunities && (
            <div id="keywords" className="md:col-span-2 mt-4 scroll-mt-20">
              <Explainer
                what="Keyword opportunities ranked by intent (volume/difficulty are AI estimates until SERP data grounds them). Transactional intent converts; informational intent builds the topical authority AI engines cite."
                actions={[
                  'Build pages for transactional keywords you can win now; assign informational ones to the Content plan.',
                  'Cross-check against the Persona heatmap — keywords serving a low-visibility persona compound both wins.',
                ]}
              />
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
              <div className="md:col-span-1">
                 <KeywordIntentChart keywords={data.synthesis.keywordOpportunities} />
              </div>
              <div className="md:col-span-2">
                 <KeywordTable keywords={data.synthesis.keywordOpportunities} />
              </div>
              </div>
            </div>
          )}

          {/* Competitor Gap Analysis */}
          {competitors.length > 0 && (
            <div id="competitors" className="md:col-span-2 scroll-mt-20">
              <Explainer
                what="Side-by-side comparison against the competitors crawled in this audit: content depth, structure, links, and schema. Gaps here explain ranking and AI-recommendation differences."
                actions={[
                  'Close the largest content gap first — thin pages rarely get cited by AI engines or ranked by Google.',
                  'Match competitor schema types (reviews, products, FAQ) before trying to out-write them.',
                ]}
              />
              <CompetitorGapTable targetDomain={data.domain} targetData={data} competitors={competitors} />
            </div>
          )}

          {/* On-Page Snapshot */}
          <div className="md:col-span-2 card p-4 sm:p-6">
            <h3 className="text-base font-bold text-[var(--ink)] mb-5">Current Title Tag Snapshot</h3>

            <div className="bg-[var(--surface-2)] border border-[var(--border)] rounded-lg p-5 mb-4">
              <div className="text-[10px] text-[var(--ink-3)] uppercase tracking-wider font-bold mb-2">Current Title Tag</div>
              <div className="text-md text-[var(--blue)] font-semibold mb-1">{data.onPage.title || 'Missing Title'}</div>
              <div className={`text-xs ${data.onPage.titleLength > 60 ? 'text-[var(--warn)]' : 'text-[var(--pass)]'}`}>
                {data.onPage.titleLength} characters {data.onPage.titleLength > 60 ? '(Too Long)' : '(Optimal)'}
              </div>
            </div>

            <div className="bg-[var(--surface-2)] border border-[var(--border)] rounded-lg p-5">
              <div className="text-[10px] text-[var(--ink-3)] uppercase tracking-wider font-bold mb-2">Current Meta Description</div>
              <div className="text-sm text-[var(--ink-2)] italic mb-1">{data.onPage.metaDescription || 'No Meta Description Found'}</div>
              <div className={`text-xs ${data.onPage.metaDescLength < 120 || data.onPage.metaDescLength > 160 ? 'text-[var(--warn)]' : 'text-[var(--pass)]'}`}>
                {data.onPage.metaDescLength} chars (Recommended: 120-160)
              </div>
            </div>
          </div>

          {data.synthesis?.titleTags && (
            <div className="md:col-span-2">
              <TitleTagsOptimizer titleTags={data.synthesis.titleTags} />
            </div>
          )}

          </section>

          {/* Action Plan Board & Content Calendar */}
          <section id="reports" className="flex flex-col gap-5 scroll-mt-20">
            <Explainer
              what="Everything actionable from this audit in one place: the prioritized optimization plan, deployable AI-ready artifacts, and the content calendar."
              actions={[
                'Work top-down: quick wins → high-impact plan items → calendar content.',
                'Export the branded PDF report from the Reports page to share with stakeholders or clients.',
              ]}
              defaultOpen
            />
            <OptimizationPlanCard plan={data.optimizationPlan ?? null} />
            <ActivationCard auditPayload={data} />
            {data.synthesis?.contentCalendar && <ContentCalendar calendar={data.synthesis.contentCalendar} />}
            <ActionPlanBoard data={data} />
            <EmailReport url={data.url} domain={data.domain} score={data.overallScore} previousScore={priorScore} />
            <WatchlistCard url={data.url} domain={data.domain} />
          </section>
        </main>
      </div>
    </div>
  );
}

export default function Dashboard() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-[var(--ink-3)]">Loading…</div>}>
      <DashboardContent />
    </Suspense>
  );
}
