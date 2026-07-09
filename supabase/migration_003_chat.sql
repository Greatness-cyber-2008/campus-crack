-- ============================================================
-- Migration: adds the "chat with your notes" feature to an existing
-- CampusCrack DB. Only run this if you already executed schema.sql
-- (and possibly migration_002_public_sets.sql) previously.
-- ============================================================

create table if not exists chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id) on delete cascade not null,
  material_id uuid references materials(id) on delete cascade, -- null = general tutor mode
  role text not null check (role in ('user','assistant')),
  content text not null,
  created_at timestamptz default now()
);

alter table chat_messages enable row level security;

drop policy if exists "chat_messages_owner_all" on chat_messages;
create policy "chat_messages_owner_all" on chat_messages for all using (auth.uid() = user_id);

create index if not exists chat_messages_user_material_idx
  on chat_messages (user_id, material_id, created_at);
