import { NextResponse } from 'next/server';
import { sendReportEmail } from '@/lib/email';

export const runtime = 'nodejs';

/**
 * Email the current report on demand (#7). The client posts the summary it
 * already has, so we don't re-run the expensive audit just to send a recap.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { to, url, domain, score, previousScore } = body ?? {};

    if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) {
      return NextResponse.json({ error: 'A valid email address is required' }, { status: 400 });
    }
    if (!url || !domain) {
      return NextResponse.json({ error: 'Missing report data' }, { status: 400 });
    }

    const origin = new URL(request.url).origin;
    const reportUrl = `${origin}/dashboard?url=${encodeURIComponent(url)}`;

    const result = await sendReportEmail({
      to,
      url,
      domain,
      score: Number(score) || 0,
      previousScore: previousScore ?? null,
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
