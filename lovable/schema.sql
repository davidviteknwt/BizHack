-- SiteStory (BizHack Challenge 02) – database schema for Lovable Cloud / Supabase
-- Lovable creates this from PROMPT.md; the file is here so the data model is documented in the repo.

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  code text unique not null,                 -- e.g. 02_BESS_container
  title text not null,
  company text not null default '',          -- AGRO NWT / ENERGO NWT
  client_name text not null default '',
  consent_name_allowed boolean not null default false,
  notes text not null default '',            -- site manager notes / project facts
  created_at timestamptz not null default now()
);

create table if not exists weekly_entries (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  week text not null,                         -- ISO week, e.g. 2026-W47
  media_url text,                             -- walk-through video in storage
  transcript text,
  customer_report jsonb,                      -- {subject, body}
  project_page_entry jsonb,                   -- {title, body}
  issues jsonb not null default '[]',
  next_steps jsonb not null default '[]',
  fact_check jsonb,                           -- {status, unverified_numbers, consent_ok}
  processing_seconds numeric,
  status text not null default 'processing',  -- processing | done | error
  created_at timestamptz not null default now(),
  unique (project_id, week)
);

create table if not exists photos (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  week text,
  url text not null,
  flagged_reason text,                        -- faces / number plate
  created_at timestamptz not null default now()
);

create table if not exists documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references projects(id) on delete cascade,
  file_name text not null,                    -- contract_signed.pdf, building_office_approval.pdf, ...
  url text,
  created_at timestamptz not null default now()
);

create table if not exists social_drafts (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references weekly_entries(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  text_en text, text_cs text, hashtags jsonb not null default '[]',
  photo_url text,
  fact_check_status text,                     -- ok | needs_review
  decision text not null default 'pending',   -- pending | approved | rejected
  decided_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists management_summaries (
  id uuid primary key default gen_random_uuid(),
  week text not null,
  headline text, summary_markdown text,
  totals jsonb, attention jsonb, highlights jsonb, checklist jsonb,
  created_at timestamptz not null default now()
);
