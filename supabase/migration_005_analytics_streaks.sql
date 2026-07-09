-- ============================================================
-- Migration: adds weak-topic analytics + streak tracking to an
-- existing CampusCrack DB. Run this once regardless of which earlier
-- migrations you've already applied.
-- ============================================================

alter table questions add column if not exists topic text;

alter table profiles add column if not exists current_streak int default 0;
alter table profiles add column if not exists longest_streak int default 0;
alter table profiles add column if not exists last_active_date date;

create or replace function public.update_streak_on_attempt_submit()
returns trigger as $$
declare
  last_date date;
  today date := current_date;
begin
  if new.status = 'submitted' and (old.status is distinct from 'submitted') then
    select last_active_date into last_date from profiles where id = new.user_id;

    if last_date = today then
      null;
    elsif last_date = today - interval '1 day' then
      update profiles
      set current_streak = current_streak + 1,
          longest_streak = greatest(longest_streak, current_streak + 1),
          last_active_date = today
      where id = new.user_id;
    else
      update profiles
      set current_streak = 1,
          longest_streak = greatest(longest_streak, 1),
          last_active_date = today
      where id = new.user_id;
    end if;
  end if;
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_attempt_submitted on attempts;
create trigger on_attempt_submitted
  after update on attempts
  for each row execute procedure public.update_streak_on_attempt_submit();
