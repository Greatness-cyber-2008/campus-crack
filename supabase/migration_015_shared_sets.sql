-- ============================================================
-- Migration: shareable CBT links with a free preview + paywall.
--
-- A set owner can generate a public link (/s/<token>). Anyone with the
-- link — logged in or not — can answer the first few questions free.
-- Beyond that, only premium users (and the set's owner) get through.
-- The gating is enforced server-side in /api/share/* (questions past the
-- free sample are never sent to the browser), not just hidden in the UI.
--
-- shared_attempts stores each viewer's answers so they can resume later,
-- including after signing up / upgrading: an anonymous viewer is tracked
-- by a random id kept in their browser, and that attempt is attached to
-- their account the first time they open the link while logged in.
--
-- shared_attempts has RLS enabled with NO policies on purpose: only the
-- server (service role) reads/writes it.
--
-- Safe to run regardless of which earlier migrations you've applied.
-- ============================================================

alter table question_sets add column if not exists share_token text;
alter table question_sets add column if not exists is_shared boolean default false;

create unique index if not exists question_sets_share_token_idx
  on question_sets (share_token) where share_token is not null;

create table if not exists shared_attempts (
  id uuid primary key default gen_random_uuid(),
  question_set_id uuid references question_sets(id) on delete cascade not null,
  user_id uuid references profiles(id) on delete cascade,
  anon_id text,
  answers jsonb not null default '{}'::jsonb, -- { "<question_id>": "B", ... }
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  check (user_id is not null or anon_id is not null)
);

create unique index if not exists shared_attempts_user_idx
  on shared_attempts (question_set_id, user_id) where user_id is not null;

create unique index if not exists shared_attempts_anon_idx
  on shared_attempts (question_set_id, anon_id) where anon_id is not null and user_id is null;

alter table shared_attempts enable row level security;
