-- ============================================================
-- Migration: adds Courses so materials can be grouped ("all my CYB 201
-- files together"), and lets a study plan be built from ALL materials in
-- a course combined, not just one file at a time. Also enriches each
-- week of a study plan with an actionable study tip instead of just a
-- topic label sitting there doing nothing.
-- Safe to run regardless of which earlier migrations you've applied.
-- ============================================================

create table if not exists courses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade not null,
  title text not null,
  course_code text,
  discipline text,
  created_at timestamptz default now()
);

alter table courses enable row level security;
drop policy if exists "courses_owner_all" on courses;
create policy "courses_owner_all" on courses for all using (auth.uid() = user_id);

alter table materials add column if not exists course_id uuid references courses(id) on delete set null;

alter table study_plans add column if not exists course_id uuid references courses(id) on delete set null;

alter table study_plan_weeks add column if not exists study_tip text;
