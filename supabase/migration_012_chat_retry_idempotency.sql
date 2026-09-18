-- Keeps retries from creating duplicate user messages or duplicate AI replies.
alter table chat_messages add column if not exists request_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'chat_messages_user_request_role_key'
  ) then
    alter table chat_messages
      add constraint chat_messages_user_request_role_key unique (user_id, request_id, role);
  end if;
end $$;
