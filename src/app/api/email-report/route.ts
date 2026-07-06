import { NextResponse } from 'next/server';
import { sendReportEmail } from '@/lib/email';
import { rateLimit, clientIp } from '@/lib/rateLimit';

export const runtime = 'nodejs';

/**
 * Email the current report on demand (#7). The client posts the summary it
 * already has, so we don't re-run the expensive audit just to send a recap.
 */
export async function POST(request: Request) {
  // (S2) Previously unauthenticated + unlimited — anyone could use this as a
  // free mail relay to any address. Rate-limit per client IP.
  const limit = rateLimit(`email:${clientIp(request)}`, 5, 10 * 60 * 1000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Too many email requests. Please try again later.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
    );
  }

  try {
    const body = await request.json();
    const { to, url, domain, score, previousScore } = body ?? {};

    if (!to || typeof to !== 'string' || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
      return NextResponse.json({ error: 'A valid email address is required' }, { status: 400 });
    }
    if (!url || typeof url !== 'string' || !domain || typeof domain !== 'string') {
      return NextResponse.json({ error: 'Missing report data' }, { status: 400 });
    }
    // Bound string inputs so a malicious payload can't blow up the email HTML.
    if (url.length > 2048 || domain.length > 255) {
      return NextResponse.json({ error: 'Report data too large' }, { status: 400 });
    }

    const origin = new URL(request.url).origin;
    const reportUrl = `${origin}/dashboard?url=${encodeURIComponent(url)}`;

    // (B5) score may legitimately be null (PageSpeed unavailable) — don't
    // coerce it to 0, which would misrepresent an unmeasured site as failing.
    const parsedScore = typeof score === 'number' && Number.isFinite(score) ? score : null;
    const parsedPrevScore = typeof previousScore === 'number' && Number.isFinite(previousScore) ? previousScore : null;

    const result = await sendReportEmail({
      to,
      url,
      domain,
      score: parsedScore,
      previousScore: parsedPrevScore,
      reportUrl,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 502 });
    }
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}
