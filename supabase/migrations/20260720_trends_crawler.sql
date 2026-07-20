-- Visibility trends + AI crawler analytics
--
-- NOTE: No prior migration files were found in this repo to mirror exactly
-- (existing tables like seo_audits/seo_watchlist appear to have been created
-- outside of a tracked migrations/ directory — see src/lib/supabase/admin.ts,
-- which documents them as RLS-enabled with zero policies, i.e. service-role
-- only access). These two new tables follow that same pattern: RLS enabled,
-- no policies granted to anon/authenticated, so the only way in is the
-- service-role client in src/lib/supabase/admin.ts, which must filter by
-- user_id/domain itself. Apply this file manually via the Supabase SQL editor
-- or CLI — it is not wired into an automatic migration runner.

-- ============================================================================
-- visibility_snapshots — compact point-in-time visibility snapshots per domain
-- ============================================================================
create table if not exists visibility_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  domain text not null,
  captured_at timestamptz not null default now(),
  visibility_pct numeric not null,
  total_prompts integer not null default 0,
  leaderboard jsonb not null default '[]'::jsonb,
  models jsonb not null default '[]'::jsonb,
  citations jsonb not null default '[]'::jsonb
);

create index if not exists visibility_snapshots_domain_captured_idx
  on visibility_snapshots (domain, captured_at desc);

create index if not exists visibility_snapshots_user_domain_idx
  on visibility_snapshots (user_id, domain, captured_at desc);

alter table visibility_snapshots enable row level security;
-- No policies: service-role only (see src/lib/supabase/admin.ts). The
-- service-role key bypasses RLS, so all filtering by user_id/domain happens
-- in application code (src/lib/trends.ts).

-- ============================================================================
-- crawler_hits — individual AI-bot requests matched from log drain ingestion
-- ============================================================================
create table if not exists crawler_hits (
  id uuid primary key default gen_random_uuid(),
  domain text,
  bot text not null,
  engine text not null,
  path text not null,
  hit_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create index if not exists crawler_hits_domain_hit_at_idx
  on crawler_hits (domain, hit_at desc);

create index if not exists crawler_hits_bot_idx
  on crawler_hits (bot);

alter table crawler_hits enable row level security;
-- No policies: service-role only, same rationale as visibility_snapshots.
-- Ingestion (POST /api/crawler-logs) is gated by the CRAWLER_LOGS_SECRET
-- header rather than a Supabase session, since Vercel Log Drains can't do
-- interactive auth.
