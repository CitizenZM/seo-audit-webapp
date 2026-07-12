import { NextResponse } from 'next/server';
import { openaiClient, OPENAI_MODEL } from '@/lib/ai';
import { rateLimit, clientIp } from '@/lib/rateLimit';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * Content generation (Gumshoe "Act → Content generation"): turn an audit's
 * content brief into a publish-ready draft. The client posts the brief it
 * already has, so no re-audit is needed.
 */
export async function POST(request: Request) {
  // Each call is a full article generation — keep a tight per-IP budget.
  const limit = rateLimit(`gen:${clientIp(request)}`, 4, 10 * 60 * 1000);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'Too many generation requests. Please try again later.' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
    );
  }

  const client = openaiClient();
  if (!client) {
    return NextResponse.json({ error: 'AI is not configured (OPENAI_API_KEY missing)' }, { status: 502 });
  }

  try {
    const body = await request.json();
    const { title, targetKeyword, outline, goal, domain } = body ?? {};
    if (typeof title !== 'string' || !title || typeof targetKeyword !== 'string') {
      return NextResponse.json({ error: 'title and targetKeyword are required' }, { status: 400 });
    }
    if (title.length > 300 || targetKeyword.length > 200) {
      return NextResponse.json({ error: 'Brief fields too large' }, { status: 400 });
    }

    const outlineList = Array.isArray(outline) ? outline.filter((o: unknown) => typeof o === 'string').slice(0, 12) : [];

    const r = await client.chat.completions.create({
      model: OPENAI_MODEL,
      max_tokens: 2500,
      messages: [
        {
          role: 'user',
          content: `Write a publish-ready blog article draft in Markdown for the website ${typeof domain === 'string' ? domain : ''}.

Title: ${title}
Target keyword: ${targetKeyword}
Goal: ${typeof goal === 'string' ? goal : 'rank for the target keyword and earn AI-answer citations'}
${outlineList.length ? `Required outline (use as H2 sections):\n${outlineList.map((o: string) => `- ${o}`).join('\n')}` : ''}

Requirements (SEO + GEO optimized):
- 800-1100 words, natural keyword usage (no stuffing)
- Question-style H2/H3 headings where sensible (LLMs quote clean Q→A blocks)
- Include a short FAQ section (3 questions) at the end
- Concrete, specific, skimmable; no fluff or filler phrases
- Start with the H1 title line`,
        },
      ],
    });

    const draft = r.choices[0]?.message?.content ?? '';
    if (!draft) return NextResponse.json({ error: 'Generation returned no content' }, { status: 502 });
    return NextResponse.json({ draft });
  } catch {
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 });
  }
}
