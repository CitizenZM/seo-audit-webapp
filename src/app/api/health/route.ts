import { NextResponse } from 'next/server';
import { isSupabaseConfigured } from '@/lib/supabase/admin';
import { resolveCompatEngines } from '@/lib/probeEngines';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Capability report — which integrations are configured. Booleans only,
 * never key values. Lets the operator confirm a newly added API key took
 * effect after a redeploy (e.g. multi-engine probing, PageSpeed, email).
 */
export async function GET() {
  const has = (k: string) => Boolean(process.env[k]?.trim());
  const engines = [
    has('GEMINI_API_KEY') && 'gemini',
    has('OPENAI_API_KEY') && 'openai',
    has('ANTHROPIC_API_KEY') && 'anthropic',
    has('PERPLEXITY_API_KEY') && 'perplexity',
    has('AGNES_API_KEY') && 'agnes',
    ...resolveCompatEngines(process.env).map((e) => e.label),
  ].filter(Boolean);

  return NextResponse.json({
    ok: true,
    capabilities: {
      persistence: isSupabaseConfigured(),
      aiEngines: engines,
      multiEngineProbing: engines.length > 1,
      pageSpeed: has('PAGESPEED_API_KEY'),
      serp: has('SERPER_API_KEY'),
      email: has('RESEND_API_KEY'),
      scheduler: has('CRON_SECRET'),
      operatorGate: has('OPERATOR_EMAILS'),
      crawlerLogs: has('CRAWLER_LOGS_SECRET'),
    },
  });
}
