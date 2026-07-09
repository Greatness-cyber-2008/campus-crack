-- ============================================================
-- Migration: adds flashcards (daily spaced repetition) to an existing
-- CampusCrack DB, and refactors streak logic into a shared function
-- so flashcard reviews also count toward the daily streak.
-- Safe to run regardless of which earlier migrations you've applied.
-- ============================================================

create table if not exists flashcard_sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade not null,
  material_id uuid references materials(id) on delete set null,
  title text not null,
  discipline text,
  course_code text,
  card_count int not null,
  created_at timestamptz default now()
);

alter table flashcard_sets enable row level security;
drop policy if exists "flashcard_sets_owner_all" on flashcard_sets;
create policy "flashcard_sets_owner_all" on flashcard_sets for all using (auth.uid() = user_id);

create table if not exists flashcards (
  id uuid primary key default gen_random_uuid(),
  flashcard_set_id uuid references flashcard_sets(id) on delete cascade not null,
  order_index int not null,
  front text not null,
  back text not null,
  topic text
);

alter table flashcards enable row level security;
drop policy if exists "flashcards_owner_all" on flashcards;
create policy "flashcards_owner_all" on flashcards for all using (
  exists (
    select 1 from flashcard_sets fs
    where fs.id = flashcards.flashcard_set_id and fs.user_id = auth.uid()
  )
);

create table if not exists flashcard_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade not null,
  flashcard_id uuid references flashcards(id) on delete cascade not null,
  next_review_date date not null default current_date,
  interval_days numeric not null default 1,
  last_rating text check (last_rating in ('again','hard','good','easy')),
  last_reviewed_at timestamptz,
  review_count int not null default 0,
  unique (user_id, flashcard_id)
);

alter table flashcard_progress enable row level security;
drop policy if exists "flashcard_progress_owner_all" on flashcard_progress;
create policy "flashcard_progress_owner_all" on flashcard_progress for all using (auth.uid() = user_id);

-- Refactor streak logic into a shared function (idempotent to re-run)
create or replace function public.bump_streak(target_user_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  last_date date;
  today date := current_date;
begin
  select last_active_date into last_date from profiles where id = target_user_id;

  if last_date = today then
    null;
  elsif last_date = today - interval '1 day' then
    update profiles
    set current_streak = current_streak + 1,
        longest_streak = greatest(longest_streak, current_streak + 1),
        last_active_date = today
    where id = target_user_id;
  else
    update profiles
    set current_streak = 1,
        longest_streak = greatest(longest_streak, 1),
        last_active_date = today
    where id = target_user_id;
  end if;
end;
$$;

create or replace function public.update_streak_on_attempt_submit()
returns trigger as $$
begin
  if new.status = 'submitted' and (old.status is distinct from 'submitted') then
    perform public.bump_streak(new.user_id);
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_attempt_submitted on attempts;
create trigger on_attempt_submitted
  after update on attempts
  for each row execute procedure public.update_streak_on_attempt_submit();

create or replace function public.update_streak_on_flashcard_review()
returns trigger as $$
begin
  perform public.bump_streak(new.user_id);
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_flashcard_reviewed on flashcard_progress;
create trigger on_flashcard_reviewed
  after insert or update on flashcard_progress
  for each row execute procedure public.update_streak_on_flashcard_review();
