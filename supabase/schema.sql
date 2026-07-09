-- ============================================================
-- CampusCrack database schema
-- Run this in Supabase SQL editor (or via `supabase db push`)
-- ============================================================

-- ---------- PROFILES ----------
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  university text,
  discipline text check (discipline in ('computing','medical','commercial','science','arts','law','engineering','general')),
  level text, -- e.g. '100', '200', '300', '400'
  is_premium boolean default false,
  free_generations_used int default 0,
  current_streak int default 0,
  longest_streak int default 0,
  last_active_date date,
  created_at timestamptz default now()
);

alter table profiles enable row level security;
create policy "profiles_select_own" on profiles for select using (auth.uid() = id);
create policy "profiles_update_own" on profiles for update using (auth.uid() = id);
create policy "profiles_insert_own" on profiles for insert with check (auth.uid() = id);

-- Auto-create a profile row whenever a new auth user signs up
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, new.raw_user_meta_data->>'full_name');
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ---------- MATERIALS (uploaded PDFs / notes) ----------
create table if not exists materials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade not null,
  title text not null,
  course_code text,          -- e.g. CYB 201
  discipline text,
  storage_path text not null, -- path inside the 'materials' storage bucket
  extracted_text text,        -- populated after PDF parsing
  page_count int,
  status text default 'processing' check (status in ('processing','ready','failed')),
  created_at timestamptz default now()
);

alter table materials enable row level security;
create policy "materials_owner_all" on materials for all using (auth.uid() = user_id);

-- ---------- QUESTION SETS (a generation run) ----------
create table if not exists question_sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade not null,
  material_id uuid references materials(id) on delete set null,
  title text not null,
  exam_mode text not null check (exam_mode in ('cbt','written')),
  discipline text not null,
  course_code text,
  author_university text,
  difficulty text default 'mixed' check (difficulty in ('easy','medium','hard','mixed')),
  question_count int not null,
  time_limit_minutes int, -- for CBT mode
  is_locked boolean default false, -- true if behind paywall until unlocked
  is_public boolean default false, -- shared to the community library
  clone_count int default 0,
  created_at timestamptz default now()
);

alter table question_sets enable row level security;
create policy "question_sets_owner_all" on question_sets for all using (auth.uid() = user_id);
create policy "question_sets_public_read" on question_sets for select using (is_public = true);

-- ---------- QUESTIONS ----------
create table if not exists questions (
  id uuid primary key default gen_random_uuid(),
  question_set_id uuid references question_sets(id) on delete cascade not null,
  order_index int not null,
  question_type text not null check (question_type in ('mcq','theory')),
  prompt text not null,
  topic text, -- short topic/subtopic label, used for weak-topic analytics
  options jsonb,           -- for mcq: [{"key":"A","text":"..."}, ...]
  correct_option text,     -- for mcq: e.g. 'B'
  model_answer text,       -- for theory: expected/ideal answer
  marking_points jsonb,    -- for theory: ["point 1", "point 2", ...]
  explanation text,
  marks int default 1
);

alter table questions enable row level security;
create policy "questions_owner_all" on questions for all using (
  exists (
    select 1 from question_sets qs
    where qs.id = questions.question_set_id and qs.user_id = auth.uid()
  )
);
create policy "questions_public_read" on questions for select using (
  exists (
    select 1 from question_sets qs
    where qs.id = questions.question_set_id and qs.is_public = true
  )
);

-- ---------- ATTEMPTS (a practice session / exam run) ----------
create table if not exists attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade not null,
  question_set_id uuid references question_sets(id) on delete cascade not null,
  started_at timestamptz default now(),
  submitted_at timestamptz,
  score numeric,          -- percentage
  total_marks numeric,
  marks_scored numeric,
  status text default 'in_progress' check (status in ('in_progress','submitted','abandoned'))
);

alter table attempts enable row level security;
create policy "attempts_owner_all" on attempts for all using (auth.uid() = user_id);

-- Streak tracking: shared logic, callable from multiple triggers (exam attempts,
-- flashcard reviews) so any form of daily practice keeps the streak alive —
-- not just finishing a full CBT/Written set, which is rare mid-semester.
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
    null; -- already counted today
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

-- ---------- ANSWERS ----------
create table if not exists answers (
  id uuid primary key default gen_random_uuid(),
  attempt_id uuid references attempts(id) on delete cascade not null,
  question_id uuid references questions(id) on delete cascade not null,
  selected_option text,      -- for mcq
  written_response text,     -- for theory
  is_correct boolean,        -- for mcq (auto graded)
  self_rating text check (self_rating in ('nailed_it','close','missed')), -- for theory self-grading
  marks_awarded numeric
);

alter table answers enable row level security;
create policy "answers_owner_all" on answers for all using (
  exists (
    select 1 from attempts a where a.id = answers.attempt_id and a.user_id = auth.uid()
  )
);

-- ---------- CHAT MESSAGES (chat grounded in uploaded material, or general tutor mode) ----------
create table if not exists chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade not null,
  material_id uuid references materials(id) on delete cascade, -- null = general tutor mode (not tied to a specific upload)
  role text not null check (role in ('user','assistant')),
  content text not null,
  created_at timestamptz default now()
);

alter table chat_messages enable row level security;
create policy "chat_messages_owner_all" on chat_messages for all using (auth.uid() = user_id);

create index if not exists chat_messages_user_material_idx
  on chat_messages (user_id, material_id, created_at);

-- ---------- FLASHCARDS (daily spaced-repetition study, separate from exam practice) ----------
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
create policy "flashcard_sets_owner_all" on flashcard_sets for all using (auth.uid() = user_id);

create table if not exists flashcards (
  id uuid primary key default gen_random_uuid(),
  flashcard_set_id uuid references flashcard_sets(id) on delete cascade not null,
  order_index int not null,
  front text not null,  -- term / question side
  back text not null,   -- definition / answer side
  topic text
);

alter table flashcards enable row level security;
create policy "flashcards_owner_all" on flashcards for all using (
  exists (
    select 1 from flashcard_sets fs
    where fs.id = flashcards.flashcard_set_id and fs.user_id = auth.uid()
  )
);

-- One row per (user, flashcard) tracking simple spaced-repetition state.
-- Interval ladder (not full SM-2, kept simple and easy to reason about):
--   again -> review tomorrow (interval resets to 1 day)
--   hard  -> interval * 1.2
--   good  -> interval * 2
--   easy  -> interval * 2.5
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
create policy "flashcard_progress_owner_all" on flashcard_progress for all using (auth.uid() = user_id);

-- Any flashcard review counts toward the daily streak too — this is what makes
-- streaks meaningful outside exam season, when full practice attempts are rare.
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

-- ---------- PAYMENTS ----------
create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade not null,
  paystack_reference text unique not null,
  amount_kobo int not null,
  purpose text not null check (purpose in ('premium_unlock','set_unlock')),
  question_set_id uuid references question_sets(id) on delete set null,
  status text default 'pending' check (status in ('pending','success','failed')),
  created_at timestamptz default now()
);

alter table payments enable row level security;
create policy "payments_owner_all" on payments for all using (auth.uid() = user_id);

-- ---------- STORAGE BUCKET ----------
insert into storage.buckets (id, name, public) values ('materials', 'materials', false)
on conflict (id) do nothing;

create policy "materials_bucket_owner_read"
on storage.objects for select
using (bucket_id = 'materials' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "materials_bucket_owner_write"
on storage.objects for insert
with check (bucket_id = 'materials' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "materials_bucket_owner_delete"
on storage.objects for delete
using (bucket_id = 'materials' and auth.uid()::text = (storage.foldername(name))[1]);
