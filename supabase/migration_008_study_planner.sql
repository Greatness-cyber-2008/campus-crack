-- ============================================================
-- Migration: adds the Weekly Study Planner.
-- Safe to run regardless of which earlier migrations you've applied.
-- ============================================================

create table if not exists study_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade not null,
  material_id uuid references materials(id) on delete set null,
  title text not null,
  course_code text,
  discipline text,
  start_date date not null,
  total_weeks int not null,
  created_at timestamptz default now()
);

alter table study_plans enable row level security;
drop policy if exists "study_plans_owner_all" on study_plans;
create policy "study_plans_owner_all" on study_plans for all using (auth.uid() = user_id);

create table if not exists study_plan_weeks (
  id uuid primary key default gen_random_uuid(),
  study_plan_id uuid references study_plans(id) on delete cascade not null,
  week_number int not null,
  topic text not null,
  description text,
  unique (study_plan_id, week_number)
);

alter table study_plan_weeks enable row level security;
drop policy if exists "study_plan_weeks_owner_all" on study_plan_weeks;
create policy "study_plan_weeks_owner_all" on study_plan_weeks for all using (
  exists (
    select 1 from study_plans sp
    where sp.id = study_plan_weeks.study_plan_id and sp.user_id = auth.uid()
  )
);
