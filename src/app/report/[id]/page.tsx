'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Loader2, XCircle, Search, Sparkles, Gauge, Link2, FileText } from 'lucide-react';
import ReportHeader from './ReportHeader';
import StatCard from '../../dashboard/StatCard';
import OptimizationPlanCard from '../../dashboard/OptimizationPlanCard';
import VisibilityCard from '../../dashboard/VisibilityCard';
import GeoCard from '../../dashboard/GeoCard';
import CitationsCard from '../../dashboard/CitationsCard';
import RadarChart from '../../dashboard/RadarChart';
import ActionPlanBoard from '../../dashboard/ActionPlanBoard';
import ContentBriefs from '../../dashboard/ContentBriefs';
import ContentCalendar from '../../dashboard/ContentCalendar';
import TitleTagsOptimizer from '../../dashboard/TitleTagsOptimizer';
import KeywordIntentChart from '../../dashboard/KeywordIntentChart';
import KeywordTable from '../../dashboard/KeywordTable';
import CompetitorGapTable from '../../dashboard/CompetitorGapTable';
import ActionProposalCard from './ActionProposalCard';
import { sanitizeBranding, BRANDING_LOCALSTORAGE_KEY, type Branding } from '@/lib/branding';

function readLocalBranding(): Branding {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(BRANDING_LOCALSTORAGE_KEY);
    return raw ? sanitizeBranding(JSON.parse(raw)) : {};
  } catch {
    return {};
  }
}

/**
 * The standalone, exportable Audit Report (distinct from the live /dashboard
 * polling view). Reads a completed audit once by id — no re-running, no
 * sidebar navigation — and lays out every section top-to-bottom for a clean
 * single-document read or PDF export. This is the page /reports links to.
 */
export default function ReportPage() {
  const params = useParams();
  const id = params?.id as string;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [data, setData] = useState<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [competitors, setCompetitors] = useState<any[]>([]);
  const [meta, setMeta] = useState<{ url: string; domain: string; createdAt: string } | null>(null);
  const [status, setStatus] = useState<'loading' | 'pending' | 'error' | 'ready'>('loading');
  const [error, setError] = useState('');
  const [branding, setBranding] = useState<Branding>({});

  useEffect(() => {
    setBranding(readLocalBranding());
    const onUpdate = (e: Event) => setBranding((e as CustomEvent<Branding>).detail ?? readLocalBranding());
    window.addEventListener('agency-branding-updated', onUpdate);
    return () => window.removeEventListener('agency-branding-updated', onUpdate);
  }, []);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    fetch(`/api/audits/${id}`)
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        if (json.error) throw new Error(json.error);
        setMeta({ url: json.url, domain: json.domain, createdAt: json.createdAt });
        if (json.status === 'done' && json.result) {
          setData({ ...json.result.data, actionProposal: json.actionProposal ?? null });
          setCompetitors(json.result.competitors || []);
          setStatus('ready');
        } else if (json.status === 'error') {
          setError(json.error || 'This audit failed.');
          setStatus('error');
        } else {
          // Report pages are meant for completed audits (linked from /reports
          // or after the live dashboard finishes) — still-running jobs get a
          // simple "not ready yet" state rather than a full polling UI.
          setStatus('pending');
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load report');
          setStatus('error');
        }
      });

    return () => { cancelled = true; };
  }, [id]);

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg)]">
        <Loader2 size={24} className="animate-spin text-[var(--brand)]" />
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--bg)] p-6">
        <div className="card p-6 sm:p-8 max-w-md w-full text-center">
          <XCircle size={28} className="text-[var(--fail)] mx-auto mb-3" />
          <h2 className="text-lg font-bold text-[var(--ink)] mb-1">Report unavailable</h2>
          <p className="text-sm text-[var(--ink-3)]">{error}</p>
        </div>
      </div>
    );
  }

  if (status === 'pending') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[var(--bg)] p-6">
        <div className="card p-6 sm:p-8 max-w-md w-full text-center">
          <Loader2 size={24} className="animate-spin text-[var(--brand)] mx-auto mb-3" />
          <h2 className="text-lg font-bold text-[var(--ink)] mb-1">This audit is still running</h2>
          <p className="text-sm text-[var(--ink-3)]">Check back once it finishes, or watch it live from the dashboard.</p>
        </div>
      </div>
    );
  }

  const totalLinks = (data.links?.internalCount ?? 0) + (data.links?.externalCount ?? 0);

  return (
    <div
      className="min-h-screen bg-[var(--bg)]"
      style={branding.accentColor ? ({ '--brand': branding.accentColor, '--brand-ink': branding.accentColor } as React.CSSProperties) : undefined}
    >
      <ReportHeader domain={meta?.domain ?? data.domain} url={meta?.url ?? data.url} generatedAt={meta?.createdAt ?? new Date().toISOString()} />

      <main className="max-w-[1000px] mx-auto p-4 sm:p-6 flex flex-col gap-4 sm:gap-5">
        {/* Print-only cover header */}
        <div className="print-header">
          {branding.logoUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={branding.logoUrl} alt={branding.agencyName || 'Agency logo'} className="print-logo" />
          )}
          <div className="print-brand">{branding.agencyName ? `${branding.agencyName} — SEO & GEO Audit Report` : 'SEO & GEO Audit Report'}</div>
          <div className="print-url">{data.url}</div>
          <div className="print-meta">
            Overall SEO {data.overallScore}/100 · AI Visibility (GEO) {data.geoScore ?? 'N/A'}/100 · Generated {meta?.createdAt ? new Date(meta.createdAt).toLocaleDateString() : ''}
          </div>
          {branding.contactEmail && <div className="print-meta">Contact: {branding.contactEmail}</div>}
        </div>

        {/* KPI row */}
        <section className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-5">
          <StatCard hero label="Overall SEO Score" value={typeof data.overallScore === 'number' ? `${data.overallScore}/100` : 'N/A'} icon={Search}
            tone={data.overallScore == null ? 'amber' : data.overallScore > 80 ? 'brand' : data.overallScore > 50 ? 'amber' : 'red'} />
          <StatCard hero label="Brand Visibility" value={typeof data.visibilityPct === 'number' ? `${data.visibilityPct}%` : 'N/A'} icon={Sparkles}
            tone={data.visibilityPct == null ? 'amber' : data.visibilityPct >= 40 ? 'blue' : data.visibilityPct >= 10 ? 'amber' : 'red'} />
          <StatCard label="GEO Readiness" value={typeof data.geoScore === 'number' ? `${data.geoScore}/100` : 'N/A'} icon={Sparkles}
            tone={data.geoScore == null ? 'amber' : data.geoScore > 80 ? 'brand' : data.geoScore > 50 ? 'amber' : 'red'} />
          <StatCard label="Mobile Speed" value={data.technical?.mobileSpeedScore != null ? `${data.technical.mobileSpeedScore}/100` : 'N/A'} icon={Gauge}
            tone={data.technical?.mobileSpeedScore == null ? 'amber' : data.technical.mobileSpeedScore > 80 ? 'brand' : data.technical.mobileSpeedScore > 50 ? 'amber' : 'red'} />
          <StatCard label="On-Page Links" value={totalLinks} icon={Link2} tone="blue" />
          <StatCard label="Words of Content" value={(data.onPage?.wordCount ?? 0).toLocaleString()} icon={FileText} tone="brand" />
        </section>

        {/* Headline: Optimization Plan — the deliverable this page exists for */}
        <OptimizationPlanCard plan={data.optimizationPlan ?? null} />
        <ActionProposalCard auditId={id} initialProposal={data.actionProposal ?? null} />

        {/* Executive summary + health radar */}
        {data.synthesis && (
          <section className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-5">
            <div className="card p-4 sm:p-6 lg:col-span-2">
              <h2 className="text-base font-bold text-[var(--ink)] mb-3">Executive Summary</h2>
              <p className="text-[var(--ink-2)] text-[0.95rem] leading-relaxed">{data.synthesis.executiveSummary}</p>
              <div className="mt-5 rounded-xl bg-[var(--red-soft)] border border-[var(--red)]/15 p-4">
                <div className="text-[10px] text-[var(--red)] uppercase tracking-wider font-bold mb-1">Top Priority Action</div>
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

        <VisibilityCard visibility={data.visibility ?? null} domain={data.domain} />
        {data.visibility?.citations?.length > 0 && <CitationsCard citations={data.visibility.citations} domain={data.domain} />}
        {data.geo && <GeoCard geo={data.geo} />}

        {data.synthesis?.keywordOpportunities && (
          <section className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
            <div className="md:col-span-1"><KeywordIntentChart keywords={data.synthesis.keywordOpportunities} /></div>
            <div className="md:col-span-2"><KeywordTable keywords={data.synthesis.keywordOpportunities} /></div>
          </section>
        )}

        {competitors.length > 0 && <CompetitorGapTable targetDomain={data.domain} targetData={data} competitors={competitors} />}
        {data.synthesis?.titleTags && <TitleTagsOptimizer titleTags={data.synthesis.titleTags} />}
        {data.synthesis?.contentBriefs && <ContentBriefs briefs={data.synthesis.contentBriefs} />}
        {data.synthesis?.contentCalendar && <ContentCalendar calendar={data.synthesis.contentCalendar} />}
        <ActionPlanBoard data={data} />

        <p className="no-print text-center text-xs text-[var(--ink-3)] py-6">End of report · <a href={`/dashboard?url=${encodeURIComponent(data.url)}`} className="text-[var(--brand-ink)] hover:underline">Re-run this audit</a></p>
        {!branding.hidePoweredBy && (
          <p className="text-center text-[10px] text-[var(--ink-3)] pb-6 -mt-3">Powered by SEO &amp; GEO Audit</p>
        )}
      </main>
    </div>
  );
}
