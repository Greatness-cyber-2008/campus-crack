-- ============================================================
-- Migration: switches pricing from "pay once, forever" to
-- "pay ₦3,500 per semester", and adds a real 2-device login limit.
-- Safe to run regardless of which earlier migrations you've applied.
-- ============================================================

alter table profiles add column if not exists premium_expires_at timestamptz;

create or replace function public.expire_premium_subscriptions()
returns void
language plpgsql
security definer
as $$
begin
  update profiles
  set is_premium = false
  where is_premium = true
    and premium_expires_at is not null
    and premium_expires_at < now();
end;
$$;

-- Only (re)schedule if this exact cron job doesn't already exist — running
-- cron.schedule twice with the same name errors instead of updating quietly.
do $$
begin
  if not exists (select 1 from cron.job where jobname = 'daily-premium-expiry-check') then
    perform cron.schedule(
      'daily-premium-expiry-check',
      '30 0 * * *',
      $sync$ select public.expire_premium_subscriptions(); $sync$
    );
  end if;
end $$;

create or replace function public.enforce_device_limit(max_devices int default 2)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  revoked_count int;
  uid uuid := auth.uid();
begin
  if uid is null then
    return 0;
  end if;

  with ranked as (
    select id, row_number() over (order by created_at desc) as rn
    from auth.sessions
    where user_id = uid
  )
  delete from auth.sessions where id in (select id from ranked where rn > max_devices);

  get diagnostics revoked_count = row_count;
  return revoked_count;
end;
$$;

revoke execute on function public.enforce_device_limit(int) from public, anon;
grant execute on function public.enforce_device_limit(int) to authenticated;
