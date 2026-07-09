-- ============================================================
-- Migration: adds community sharing to an existing CampusCrack DB
-- Only run this if you already executed the original schema.sql.
-- If you're setting up a fresh Supabase project, just run schema.sql —
-- it already includes everything below.
-- ============================================================

alter table question_sets add column if not exists course_code text;
alter table question_sets add column if not exists author_university text;
alter table question_sets add column if not exists is_public boolean default false;
alter table question_sets add column if not exists clone_count int default 0;

drop policy if exists "question_sets_public_read" on question_sets;
create policy "question_sets_public_read" on question_sets
  for select using (is_public = true);

drop policy if exists "questions_public_read" on questions;
create policy "questions_public_read" on questions
  for select using (
    exists (
      select 1 from question_sets qs
      where qs.id = questions.question_set_id and qs.is_public = true
    )
  );
