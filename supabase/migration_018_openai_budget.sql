-- Global monthly OpenAI budget: reservations + usage ledger.
-- Safe to run more than once. Run it in the Supabase SQL Editor BEFORE deploying the code.

create table if not exists public.openai_budget_months (
  month_start date primary key,
  actual_usd numeric(14,8) not null default 0,
  reserved_usd numeric(14,8) not null default 0,
  updated_at timestamptz not null default now()
);
-- The part of actual_usd that came from the starting baseline (spend that happened before
-- this ledger existed). Kept separately so changing the baseline later adjusts the total
-- instead of being ignored.
alter table public.openai_budget_months add column if not exists baseline_usd numeric(14,8) not null default 0;

create table if not exists public.openai_budget_requests (
  request_id uuid primary key,
  month_start date not null references public.openai_budget_months(month_start),
  feature text not null,
  reserved_usd numeric(14,8) not null,
  actual_usd numeric(14,8),
  model text,
  input_tokens bigint not null default 0,
  cached_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  status text not null default 'reserved' check (status in ('reserved','succeeded','failed','unknown_failure','expired')),
  created_at timestamptz not null default now(),
  settled_at timestamptz
);
-- Older copies of this table (from the first draft) don't allow the 'expired' status.
alter table public.openai_budget_requests drop constraint if exists openai_budget_requests_status_check;
alter table public.openai_budget_requests add constraint openai_budget_requests_status_check
  check (status in ('reserved','succeeded','failed','unknown_failure','expired'));

alter table public.openai_budget_months enable row level security;
alter table public.openai_budget_requests enable row level security;
-- No client policies: students can never read or change these. Only the server (service role) can.
revoke all on public.openai_budget_months from anon, authenticated;
revoke all on public.openai_budget_requests from anon, authenticated;

create or replace function public.reserve_openai_budget(
  p_request_id uuid,
  p_reserve_usd numeric,
  p_monthly_cap_usd numeric,
  p_monthly_spend_baseline_usd numeric,
  p_monthly_spend_baseline_month text,
  p_feature text
) returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  v_month date := date_trunc('month', now() at time zone 'UTC')::date;
  v_actual numeric;
  v_reserved numeric;
  v_baseline numeric;
  v_new_baseline numeric := 0;
  v_stale_total numeric;
begin
  insert into public.openai_budget_months(month_start) values (v_month) on conflict do nothing;
  -- This row lock is what makes the check below safe when many requests arrive at once.
  select actual_usd, reserved_usd, baseline_usd into v_actual, v_reserved, v_baseline
    from public.openai_budget_months where month_start = v_month for update;

  -- Starting baseline: spend OpenAI already billed this month before the ledger existed.
  -- Applies only to the month it names, and can be corrected later by changing the env var.
  if p_monthly_spend_baseline_month = v_month::text then
    v_new_baseline := greatest(coalesce(p_monthly_spend_baseline_usd, 0), 0);
  end if;
  if v_new_baseline <> v_baseline then
    update public.openai_budget_months
      set actual_usd = actual_usd - baseline_usd + v_new_baseline, baseline_usd = v_new_baseline
      where month_start = v_month;
    v_actual := v_actual - v_baseline + v_new_baseline;
  end if;

  -- Requests that never settled (function killed or timed out mid-call) would hold budget
  -- forever. After 10 minutes, treat them as spent at their reserved amount and release.
  select coalesce(sum(reserved_usd), 0) into v_stale_total
    from public.openai_budget_requests
    where month_start = v_month and status = 'reserved' and created_at < now() - interval '10 minutes';
  if v_stale_total > 0 then
    update public.openai_budget_requests
      set status = 'expired', actual_usd = reserved_usd, settled_at = now()
      where month_start = v_month and status = 'reserved' and created_at < now() - interval '10 minutes';
    update public.openai_budget_months
      set reserved_usd = greatest(0, reserved_usd - v_stale_total),
          actual_usd = actual_usd + v_stale_total
      where month_start = v_month;
    v_actual := v_actual + v_stale_total;
    v_reserved := greatest(0, v_reserved - v_stale_total);
  end if;

  if v_actual + v_reserved + greatest(p_reserve_usd, 0) > p_monthly_cap_usd then
    return false;
  end if;
  insert into public.openai_budget_requests(request_id, month_start, feature, reserved_usd)
    values (p_request_id, v_month, left(coalesce(p_feature, 'unknown'), 80), greatest(p_reserve_usd, 0));
  update public.openai_budget_months
    set reserved_usd = reserved_usd + greatest(p_reserve_usd, 0), updated_at = now()
    where month_start = v_month;
  return true;
end;
$$;

create or replace function public.settle_openai_budget(
  p_request_id uuid,
  p_actual_usd numeric,
  p_model text,
  p_input_tokens bigint,
  p_cached_tokens bigint,
  p_output_tokens bigint,
  p_status text
) returns void
language plpgsql security definer set search_path = public
as $$
declare
  r public.openai_budget_requests%rowtype;
  v_actual numeric := greatest(coalesce(p_actual_usd, 0), 0);
begin
  select * into r from public.openai_budget_requests where request_id = p_request_id for update;
  -- Already settled (or expired by the clean-up above): do nothing, so nothing is counted twice.
  if not found or r.status <> 'reserved' then return; end if;
  update public.openai_budget_requests set
    actual_usd = v_actual,
    model = left(coalesce(p_model, ''), 120),
    input_tokens = greatest(coalesce(p_input_tokens, 0), 0),
    cached_tokens = greatest(coalesce(p_cached_tokens, 0), 0),
    output_tokens = greatest(coalesce(p_output_tokens, 0), 0),
    status = case when p_status in ('succeeded','failed','unknown_failure') then p_status else 'failed' end,
    settled_at = now()
    where request_id = p_request_id;
  update public.openai_budget_months set
    reserved_usd = greatest(0, reserved_usd - r.reserved_usd),
    actual_usd = actual_usd + v_actual,
    updated_at = now()
    where month_start = r.month_start;
end;
$$;

revoke all on function public.reserve_openai_budget(uuid,numeric,numeric,numeric,text,text) from public, anon, authenticated;
revoke all on function public.settle_openai_budget(uuid,numeric,text,bigint,bigint,bigint,text) from public, anon, authenticated;
grant execute on function public.reserve_openai_budget(uuid,numeric,numeric,numeric,text,text) to service_role;
grant execute on function public.settle_openai_budget(uuid,numeric,text,bigint,bigint,bigint,text) to service_role;
