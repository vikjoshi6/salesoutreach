create extension if not exists pgcrypto;

create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  segment text not null check (segment in ('roofing', 'hvac_plumbing', 'landscaping')),
  business_name text not null,
  website text,
  contact_email text,
  phone text,
  metro text not null,
  state text not null default 'discovered',
  normalized_key text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists lead_sources (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  source text not null,
  external_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists lead_scores (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  score integer not null check (score between 0 and 100),
  reasons text[] not null default '{}',
  qualified boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index if not exists lead_scores_lead_created_key
  on lead_scores (lead_id, created_at);

create table if not exists audits (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  observations text[] not null,
  recommendations text[] not null,
  created_at timestamptz not null default now()
);

create unique index if not exists audits_lead_created_key
  on audits (lead_id, created_at);

create table if not exists mockups (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  url text not null,
  local_path text,
  created_at timestamptz not null default now()
);

create unique index if not exists mockups_lead_created_key
  on mockups (lead_id, created_at);

create table if not exists outreach_drafts (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  subject text not null,
  body text not null,
  draft_path text,
  status text not null default 'draft_ready',
  created_at timestamptz not null default now()
);

create unique index if not exists outreach_drafts_lead_created_key
  on outreach_drafts (lead_id, created_at);

create table if not exists approvals (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  approval text not null default 'pending',
  notes text,
  created_at timestamptz not null default now()
);

create unique index if not exists approvals_lead_created_key
  on approvals (lead_id, created_at);

create table if not exists interactions (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references leads(id) on delete cascade,
  type text not null,
  notes text,
  occurred_at timestamptz not null default now()
);

create table if not exists suppression_list (
  id uuid primary key default gen_random_uuid(),
  email text,
  domain text,
  reason text not null,
  created_at timestamptz not null default now(),
  constraint suppression_target_present check (email is not null or domain is not null)
);

create unique index if not exists suppression_email_key
  on suppression_list (email)
  where email is not null;

create unique index if not exists suppression_domain_key
  on suppression_list (domain)
  where domain is not null;

create table if not exists workflow_runs (
  id uuid primary key default gen_random_uuid(),
  run_type text not null,
  status text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  summary jsonb not null default '{}'::jsonb,
  errors jsonb not null default '[]'::jsonb
);
