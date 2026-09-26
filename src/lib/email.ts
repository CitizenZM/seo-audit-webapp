import { Resend } from 'resend';

/**
 * Email delivery via Resend (#7). Requires RESEND_API_KEY. Returns a result
 * object instead of throwing so callers can degrade gracefully when email
 * isn't configured (e.g. local dev without a key).
 */
export interface ReportEmailInput {
  to: string;
  url: string;
  domain: string;
  /** null when PageSpeed didn't return a score (B5) — rendered as "N/A", never a fake 0. */
  score: number | null;
  previousScore?: number | null;
  reportUrl: string;
}

const FROM = process.env.RESEND_FROM || 'SEO Audit <onboarding@resend.dev>';

/** Escape values before interpolating into the email HTML (S3 — HTML injection). */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function sendReportEmail(input: ReportEmailInput): Promise<{ ok: boolean; error?: string }> {
  if (!process.env.RESEND_API_KEY) {
    return { ok: false, error: 'RESEND_API_KEY not configured' };
  }
  const resend = new Resend(process.env.RESEND_API_KEY);

  const delta =
    input.score != null && input.previousScore != null ? input.score - input.previousScore : null;
  const trend =
    delta == null ? '' :
    delta > 0 ? `<span style="color:#16a34a">▲ +${delta}</span> since last audit` :
    delta < 0 ? `<span style="color:#ef4444">▼ ${delta}</span> since last audit` :
    'No change since last audit';

  const safeUrl = escapeHtml(input.url);
  const safeDomain = escapeHtml(input.domain);
  const safeReportUrl = escapeHtml(input.reportUrl);
  const scoreLabel = input.score != null ? `${input.score}/100` : 'N/A';

  try {
    const { error } = await resend.emails.send({
      from: FROM,
      to: input.to,
      subject: `SEO Report for ${safeDomain} — score ${scoreLabel}`,
      html: `
        <div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;color:#14151a">
          <h2 style="color:#16a34a;margin-bottom:4px">SEO Audit Report</h2>
          <p style="color:#5b6170;margin-top:0">${safeUrl}</p>
          <div style="background:#f5f6f8;border-radius:12px;padding:24px;text-align:center;margin:16px 0">
            <div style="font-size:13px;text-transform:uppercase;letter-spacing:1px;color:#8a90a0">Mobile Performance</div>
            <div style="font-size:42px;font-weight:800;color:#14151a">${scoreLabel}</div>
            <div style="font-size:13px;color:#5b6170">${trend}</div>
          </div>
          <a href="${safeReportUrl}" style="display:inline-block;background:#16a34a;color:#fff;text-decoration:none;padding:12px 24px;border-radius:10px;font-weight:600">View Full Report →</a>
          <p style="color:#8a90a0;font-size:12px;margin-top:24px">You're receiving this because you subscribed to monitoring for ${safeDomain}.</p>
        </div>`,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'send failed' };
  }
}

export interface DigestEmailInput {
  to: string[];
  rows: {
    domain: string;
    latest: { overall: number | null; geo: number | null; visibility: number | null; at: string } | null;
    delta: { overall: number | null; geo: number | null; visibility: number | null };
    alert: string | null;
  }[];
  clientsUrl: string;
}

/** Weekly all-clients digest (operator-facing). Same graceful contract as sendReportEmail. */
export async function sendDigestEmail(input: DigestEmailInput): Promise<{ ok: boolean; error?: string }> {
  if (!process.env.RESEND_API_KEY) return { ok: false, error: 'RESEND_API_KEY not configured' };
  const resend = new Resend(process.env.RESEND_API_KEY);

  const fmt = (v: number | null, suffix = '') => (v == null ? '—' : `${v}${suffix}`);
  const d = (v: number | null) =>
    v == null ? '' : v > 0 ? ` <span style="color:#16a34a">▲${v}</span>` : v < 0 ? ` <span style="color:#ef4444">▼${Math.abs(v)}</span>` : ' <span style="color:#8a90a0">±0</span>';
  const alerts = input.rows.filter((r) => r.alert).length;

  const rowsHtml = input.rows
    .map(
      (r) => `<tr>
        <td style="padding:8px;border-bottom:1px solid #eceef2;font-weight:600">${escapeHtml(r.domain)}</td>
        <td style="padding:8px;border-bottom:1px solid #eceef2">${fmt(r.latest?.overall ?? null)}${d(r.delta.overall)}</td>
        <td style="padding:8px;border-bottom:1px solid #eceef2">${fmt(r.latest?.geo ?? null)}${d(r.delta.geo)}</td>
        <td style="padding:8px;border-bottom:1px solid #eceef2">${fmt(r.latest?.visibility ?? null, '%')}${d(r.delta.visibility)}</td>
        <td style="padding:8px;border-bottom:1px solid #eceef2;color:#ef4444">${r.alert ? escapeHtml(r.alert) : ''}</td>
      </tr>`,
    )
    .join('');

  try {
    const { error } = await resend.emails.send({
      from: FROM,
      to: input.to,
      subject: `Weekly SEO/GEO digest — ${input.rows.length} clients${alerts ? `, ${alerts} alert${alerts > 1 ? 's' : ''}` : ''}`,
      html: `<div style="font-family:system-ui,sans-serif;max-width:720px;margin:0 auto;color:#14151a">
        <h2 style="color:#16a34a;margin-bottom:4px">Weekly SEO / GEO digest</h2>
        <p style="color:#5b6170;margin-top:0">Week-over-week change per client (SEO score / GEO readiness / AI visibility).</p>
        <table style="width:100%;border-collapse:collapse;font-size:14px">
          <tr style="text-align:left;color:#8a90a0;font-size:12px;text-transform:uppercase">
            <th style="padding:8px">Client</th><th style="padding:8px">SEO</th><th style="padding:8px">GEO</th><th style="padding:8px">AI vis.</th><th style="padding:8px">Alert</th>
          </tr>${rowsHtml}
        </table>
        <p style="margin-top:20px"><a href="${escapeHtml(input.clientsUrl)}" style="color:#16a34a;font-weight:600">Open client workspaces →</a></p>
      </div>`,
    });
    return error ? { ok: false, error: error.message } : { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'send failed' };
  }
}
