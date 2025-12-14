-- Supabase schema for Churn Saver (lean v1)
-- Apply in Supabase SQL editor or via `psql`

-- Enable UUID generation
create extension if not exists "pgcrypto";

-- 1) Webhook events (idempotency + audit)
create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  whop_event_id text not null unique,
  type text not null,
  membership_id text not null,
  company_id text not null,
  payload jsonb not null,
  processed boolean default false,
  error text,
  created_at timestamptz default now()
);
create index if not exists idx_events_whop_event_id on events(whop_event_id);
create index if not exists idx_events_company_processed on events(company_id, processed);

-- 2) Recovery cases (core business object)
create table if not exists recovery_cases (
  id uuid primary key default gen_random_uuid(),
  company_id text not null,
  membership_id text not null,
  user_id text not null,
  first_failure_at timestamptz not null default now(),
  last_nudge_at timestamptz,
  next_reminder_at timestamptz,
  attempts int default 0,
  incentive_days int default 0,
  status text not null default 'open' check (status in ('open', 'recovered', 'closed_no_recovery')),
  failure_reason text,
  recovered_amount_cents int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists idx_cases_company_status on recovery_cases(company_id, status);
create index if not exists idx_cases_next_reminder on recovery_cases(next_reminder_at) where status = 'open';
create index if not exists idx_cases_membership on recovery_cases(membership_id);

-- 3) Creator settings (per company)
create table if not exists creator_settings (
  company_id text primary key,
  enable_push boolean default true,
  enable_dm boolean default true,
  incentive_days int default 3,
  reminder_offsets_days int[] default array[0,2,4],
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- RLS (enable in v2+; keep disabled for v1)
-- alter table events enable row level security;
-- alter table recovery_cases enable row level security;
-- alter table creator_settings enable row level security;









