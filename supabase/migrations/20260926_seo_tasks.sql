-- SEO/GEO task list (agent-generated, closed-loop verified).
--
-- One row per actionable fix derived from an audit (page issues, GEO
-- readiness gaps, per-section solutions, Program Strategy initiatives).
-- dedupe_key is stable across audits, so re-auditing a site updates the
-- same task instead of duplicating it — and when a page-level issue no
-- longer appears in a fresh audit, the task auto-closes as verified
-- (status 'done', verified_at set). RLS on, no policies: service-role only,
-- access goes through operator-gated API routes.

create table if not exists seo_tasks (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references seo_clients(id) on delete set null,
  domain text not null,
  dedupe_key text not null,
  first_audit_id uuid references seo_audits(id) on delete set null,
  last_audit_id uuid references seo_audits(id) on delete set null,
  track text not null check (track in ('seo', 'geo')),
  source text not null check (source in ('page-issue', 'geo-check', 'section', 'strategy')),
  section text,
  title text not null,
  detail text,
  priority text not null check (priority in ('P0', 'P1', 'P2')),
  effort text check (effort in ('low', 'medium', 'high')),
  impact text check (impact in ('low', 'medium', 'high')),
  status text not null default 'todo' check (status in ('todo', 'in_progress', 'done', 'dismissed')),
  auto_verifiable boolean not null default false,
  verify text,
  affected_urls jsonb not null default '[]'::jsonb,
  affected_count integer not null default 0,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (domain, dedupe_key)
);

create index if not exists seo_tasks_domain_status_idx on seo_tasks (domain, status);
create index if not exists seo_tasks_client_idx on seo_tasks (client_id);

alter table seo_tasks enable row level security;
