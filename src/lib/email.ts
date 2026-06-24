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
  score: number;
  previousScore?: number | null;
  reportUrl: string;
}

const FROM = process.env.RESEND_FROM || 'SEO Audit <onboarding@resend.dev>';

export async function sendReportEmail(input: ReportEmailInput): Promise<{ ok: boolean; error?: string }> {
  if (!process.env.RESEND_API_KEY) {
    return { ok: false, error: 'RESEND_API_KEY not configured' };
  }
  const resend = new Resend(process.env.RESEND_API_KEY);

  const delta =
    input.previousScore != null ? input.score - input.previousScore : null;
  const trend =
    delta == null ? '' :
    delta > 0 ? `<span style="color:#16a34a">▲ +${delta}</span> since last audit` :
    delta < 0 ? `<span style="color:#ef4444">▼ ${delta}</span> since last audit` :
    'No change since last audit';

  try {
    const { error } = await resend.emails.send({
      from: FROM,
      to: input.to,
      subject: `SEO Report for ${input.domain} — score ${input.score}/100`,
      html: `
        <div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;color:#14151a">
          <h2 style="color:#16a34a;margin-bottom:4px">SEO Audit Report</h2>
          <p style="color:#5b6170;margin-top:0">${input.url}</p>
          <div style="background:#f5f6f8;border-radius:12px;padding:24px;text-align:center;margin:16px 0">
            <div style="font-size:13px;text-transform:uppercase;letter-spacing:1px;color:#8a90a0">Mobile Performance</div>
            <div style="font-size:42px;font-weight:800;color:#14151a">${input.score}/100</div>
            <div style="font-size:13px;color:#5b6170">${trend}</div>
          </div>
          <a href="${input.reportUrl}" style="display:inline-block;background:#16a34a;color:#fff;text-decoration:none;padding:12px 24px;border-radius:10px;font-weight:600">View Full Report →</a>
          <p style="color:#8a90a0;font-size:12px;margin-top:24px">You're receiving this because you subscribed to monitoring for ${input.domain}.</p>
        </div>`,
    });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'send failed' };
  }
}
