'use client';

import { useState } from 'react';
import { ListChecks, ChevronDown, ChevronRight } from 'lucide-react';
import Explainer from './Explainer';

interface SiteIssue {
  id: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  affectedUrls: string[];
  count: number;
  fix: string;
}

interface SiteIssuesSummary {
  pagesCrawled: number;
  pagesWithIssues: number;
  issueCounts: Record<'critical' | 'high' | 'medium' | 'low', number>;
  crawlHealth: number;
}

interface SiteCrawlWithIssues {
  issues?: SiteIssue[];
  summary?: SiteIssuesSummary;
  rateLimited?: boolean;
  botBlocked?: boolean;
  timedOut?: boolean;
  pagesAnalyzed?: number;
}

const SEVERITY_ORDER: Record<SiteIssue['severity'], number> = { critical: 0, high: 1, medium: 2, low: 3 };

const SEVERITY_TONE: Record<SiteIssue['severity'], string> = {
  critical: 'bg-[var(--red-soft,rgba(220,38,38,0.1))] text-[var(--fail)]',
  high: 'bg-[var(--amber-soft)] text-[var(--warn)]',
  medium: 'bg-[var(--surface-2)] text-[var(--ink-2)]',
  low: 'bg-[var(--surface-2)] text-[var(--ink-3)]',
};

function healthTone(score: number) {
  if (score >= 80) return 'var(--pass)';
  if (score >= 50) return 'var(--warn)';
  return 'var(--fail)';
}

const pageIssuesExplainer = {
  what: 'A full sitemap-driven crawl of your site (up to 150 pages) checking every page for broken links, missing/duplicate metadata, thin content, missing structured data, and other on-page SEO problems.',
  actions: [
    'Fix critical and high-severity issues first — broken pages and missing titles/H1s block indexing and rankings outright.',
    'Expand the affected-URL list on any issue to see exactly which pages need the fix, then re-audit to confirm it cleared.',
  ],
};

function IssueRow({ issue }: { issue: SiteIssue }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-[var(--border)] last:border-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-[var(--surface-2)] transition-colors"
        aria-expanded={open}
      >
        {open ? <ChevronDown size={14} className="text-[var(--ink-3)] shrink-0" /> : <ChevronRight size={14} className="text-[var(--ink-3)] shrink-0" />}
        <span className={`text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded shrink-0 ${SEVERITY_TONE[issue.severity]}`}>
          {issue.severity}
        </span>
        <span className="text-sm font-medium text-[var(--ink)] flex-1 min-w-0 truncate">{issue.title}</span>
        <span className="text-xs font-mono text-[var(--ink-3)] shrink-0">{issue.count} page{issue.count === 1 ? '' : 's'}</span>
      </button>
      {open && (
        <div className="px-4 pb-4 pl-11 flex flex-col gap-3">
          <p className="text-sm text-[var(--ink-2)]">{issue.fix}</p>
          <div className="flex flex-col gap-1">
            {issue.affectedUrls.map((url) => (
              <a
                key={url}
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-[var(--blue)] hover:underline truncate"
              >
                {url.replace(/^https?:\/\/[^/]+/, '') || '/'}
              </a>
            ))}
            {issue.count > issue.affectedUrls.length && (
              <span className="text-xs text-[var(--ink-3)]">
                + {issue.count - issue.affectedUrls.length} more not shown
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Page-level issues from the sitemap-driven site crawl (src/lib/siteCrawler.ts
 * + src/lib/siteIssues.ts). Always renders — shows an empty state when the
 * audit has no crawl data — with summary chips and a severity-sorted,
 * expandable issue table.
 */
export default function PageIssuesCard({ siteCrawl }: { siteCrawl?: SiteCrawlWithIssues | null }) {
  const issues = siteCrawl?.issues ?? [];
  const summary = siteCrawl?.summary;

  const sortedIssues = [...issues].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

  return (
    <div id="page-issues" className="card p-4 sm:p-6 scroll-mt-20">
      <h3 className="text-base font-bold text-[var(--ink)] flex items-center gap-2 mb-1">
        <ListChecks size={18} className="text-[var(--blue)]" /> Page Issues
      </h3>
      <p className="text-sm text-[var(--ink-3)] mb-1">
        Site-wide crawl results — every page checked, every problem found.
      </p>
      <Explainer {...pageIssuesExplainer} />

      {siteCrawl?.botBlocked && (
        <div className="mb-4 rounded-lg border border-[var(--amber)]/30 bg-[var(--amber-soft)] px-3.5 py-2.5 text-[13px] text-[var(--ink-2)]">
          This site&apos;s bot protection (WAF challenge) blocked our crawler, so page-level results are partial. We don&apos;t bypass bot protection — ask the site owner to allowlist the <code className="text-xs">SEOAuditBot</code> user agent for full coverage.
        </div>
      )}
      {!siteCrawl?.botBlocked && (siteCrawl?.rateLimited || siteCrawl?.timedOut) && (
        <div className="mb-4 rounded-lg border border-[var(--amber)]/30 bg-[var(--amber-soft)] px-3.5 py-2.5 text-[13px] text-[var(--ink-2)]">
          {siteCrawl?.rateLimited
            ? 'This site rate-limited our crawler (HTTP 429/503), so we slowed down and may have captured fewer pages. Results are partial — throttling is not counted as a site error.'
            : 'The crawl hit its time budget, so results cover a subset of pages.'}
        </div>
      )}
      {!summary || summary.pagesCrawled === 0 ? (
        <p className="text-sm text-[var(--ink-3)]">
          No page-level crawl data in this audit — run a new audit to populate this.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
            <div className="bg-[var(--surface-2)] border border-[var(--border)] rounded-lg p-3">
              <div className="text-[10px] uppercase tracking-wider text-[var(--ink-3)] font-semibold">Pages Crawled</div>
              <div className="text-xl font-bold mt-0.5 text-[var(--ink)]">{summary.pagesCrawled}</div>
            </div>
            <div className="bg-[var(--surface-2)] border border-[var(--border)] rounded-lg p-3">
              <div className="text-[10px] uppercase tracking-wider text-[var(--ink-3)] font-semibold">With Issues</div>
              <div className={`text-xl font-bold mt-0.5 ${summary.pagesWithIssues > 0 ? 'text-[var(--warn)]' : 'text-[var(--pass)]'}`}>{summary.pagesWithIssues}</div>
            </div>
            <div className="bg-[var(--surface-2)] border border-[var(--border)] rounded-lg p-3">
              <div className="text-[10px] uppercase tracking-wider text-[var(--ink-3)] font-semibold">Critical</div>
              <div className={`text-xl font-bold mt-0.5 ${summary.issueCounts.critical > 0 ? 'text-[var(--fail)]' : 'text-[var(--pass)]'}`}>{summary.issueCounts.critical}</div>
            </div>
            <div className="bg-[var(--surface-2)] border border-[var(--border)] rounded-lg p-3">
              <div className="text-[10px] uppercase tracking-wider text-[var(--ink-3)] font-semibold">High</div>
              <div className={`text-xl font-bold mt-0.5 ${summary.issueCounts.high > 0 ? 'text-[var(--warn)]' : 'text-[var(--pass)]'}`}>{summary.issueCounts.high}</div>
            </div>
            <div className="bg-[var(--surface-2)] border border-[var(--border)] rounded-lg p-3">
              <div className="text-[10px] uppercase tracking-wider text-[var(--ink-3)] font-semibold">Medium / Low</div>
              <div className="text-xl font-bold mt-0.5 text-[var(--ink)]">{summary.issueCounts.medium + summary.issueCounts.low}</div>
            </div>
            <div className="bg-[var(--surface-2)] border border-[var(--border)] rounded-lg p-3">
              <div className="text-[10px] uppercase tracking-wider text-[var(--ink-3)] font-semibold">Crawl Health</div>
              <div className="text-xl font-bold mt-0.5" style={{ color: healthTone(summary.crawlHealth) }}>{summary.crawlHealth}/100</div>
            </div>
          </div>

          {sortedIssues.length === 0 ? (
            <p className="text-sm text-[var(--pass)] font-medium">No page-level issues found across the crawl.</p>
          ) : (
            <div className="rounded-lg border border-[var(--border)] overflow-hidden">
              {sortedIssues.map((issue) => (
                <IssueRow key={issue.id} issue={issue} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
