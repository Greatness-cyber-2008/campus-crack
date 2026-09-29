-- ============================================================
-- Migration: Phase 1 of the AI/Coding Implementation Specification —
-- "Standardize IDs, topic mapping and analytics events."
-- Renumbered from 012 to 013 to avoid colliding with
-- migration_012_chat_retry_idempotency.sql.
--
-- Safe to run from the top again even if it partially ran before —
-- every statement uses if-not-exists / on-conflict-do-nothing.
-- ============================================================

create table if not exists topics (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade not null,
  course_id uuid references courses(id) on delete set null,
  parent_id uuid references topics(id) on delete set null,
  name text not null,
  created_at timestamptz default now(),
  unique (user_id, course_id, name)
);

alter table topics enable row level security;
drop policy if exists "topics_owner_all" on topics;
create policy "topics_owner_all" on topics for all using (auth.uid() = user_id);

alter table questions add column if not exists topic_id uuid references topics(id) on delete set null;
alter table flashcards add column if not exists topic_id uuid references topics(id) on delete set null;

create index if not exists questions_topic_id_idx on questions(topic_id);
create index if not exists flashcards_topic_id_idx on flashcards(topic_id);

insert into topics (user_id, course_id, name)
select distinct qs.user_id, m.course_id, q.topic
from questions q
join question_sets qs on qs.id = q.question_set_id
left join materials m on m.id = qs.material_id
where q.topic is not null and q.topic_id is null
on conflict (user_id, course_id, name) do nothing;

-- Fixed: the target table "q" can only be referenced in WHERE, never inside
-- a JOIN ... ON clause in the FROM list — Postgres rejects that. "topics t"
-- is now an unconditional (cross) join, with every real condition moved to WHERE.
update questions q
set topic_id = t.id
from question_sets qs
left join materials m on m.id = qs.material_id
cross join topics t
where qs.id = q.question_set_id
  and q.topic is not null
  and q.topic_id is null
  and t.user_id = qs.user_id
  and t.name = q.topic
  and t.course_id is not distinct from m.course_id;

insert into topics (user_id, course_id, name)
select distinct fs.user_id, m.course_id, f.topic
from flashcards f
join flashcard_sets fs on fs.id = f.flashcard_set_id
left join materials m on m.id = fs.material_id
where f.topic is not null and f.topic_id is null
on conflict (user_id, course_id, name) do nothing;

update flashcards f
set topic_id = t.id
from flashcard_sets fs
left join materials m on m.id = fs.material_id
cross join topics t
where fs.id = f.flashcard_set_id
  and f.topic is not null
  and f.topic_id is null
  and t.user_id = fs.user_id
  and t.name = f.topic
  and t.course_id is not distinct from m.course_id;

create table if not exists analytics_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade not null,
  event_name text not null,
  properties jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

alter table analytics_events enable row level security;
drop policy if exists "analytics_events_owner_insert" on analytics_events;
create policy "analytics_events_owner_insert" on analytics_events for insert with check (auth.uid() = user_id);
drop policy if exists "analytics_events_owner_select" on analytics_events;
create policy "analytics_events_owner_select" on analytics_events for select using (auth.uid() = user_id);

create index if not exists analytics_events_user_event_idx on analytics_events(user_id, event_name, created_at);
