-- Campus rep program: referral links, who referred whom, and commissions owed to reps.
-- Safe to run more than once. Run in the Supabase SQL Editor BEFORE deploying the code.
-- All three tables are server-only: students can never read or change them.

create table if not exists public.reps (
  code text primary key check (code ~ '^[A-Z0-9_-]{3,20}$'),
  name text not null,
  phone text,
  user_id uuid references auth.users(id) on delete set null,  -- the rep's own CampusCrack account, if any (blocks self-referral)
  active boolean not null default true,
  notes text,
  created_at timestamptz not null default now()
);

-- One row per referred student. The first rep link that a new account claims wins, and it never changes.
create table if not exists public.referrals (
  user_id uuid primary key references auth.users(id) on delete cascade,
  rep_code text not null references public.reps(code) on update cascade,
  created_at timestamptz not null default now()
);
create index if not exists referrals_rep_code_idx on public.referrals(rep_code);

-- One commission per referred student, created when their first semester payment succeeds.
create table if not exists public.rep_commissions (
  id uuid primary key default gen_random_uuid(),
  rep_code text not null references public.reps(code) on update cascade,
  referred_user_id uuid not null unique,      -- unique = a student earns a rep at most one commission
  payment_reference text not null unique,
  amount_kobo integer not null,
  eligible_at timestamptz not null,           -- payable from this moment (payment date + hold period)
  paid_at timestamptz,                        -- set when you have paid the rep
  voided_at timestamptz,                      -- set if the payment is refunded or disputed
  note text,
  created_at timestamptz not null default now()
);
create index if not exists rep_commissions_rep_code_idx on public.rep_commissions(rep_code);

alter table public.reps enable row level security;
alter table public.referrals enable row level security;
alter table public.rep_commissions enable row level security;
revoke all on public.reps, public.referrals, public.rep_commissions from anon, authenticated;

-- Called by the server when a freshly signed-up student arrives via a rep link.
create or replace function public.claim_referral(
  p_user_id uuid, p_code text, p_account_created timestamptz, p_window_days int
) returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_code text := upper(trim(coalesce(p_code, '')));
  v_rep public.reps%rowtype;
begin
  if exists (select 1 from public.referrals where user_id = p_user_id) then return 'already'; end if;
  -- Only brand-new accounts can be credited to a rep, so nobody can claim existing users.
  if p_account_created < now() - make_interval(days => greatest(p_window_days, 1)) then return 'too_old'; end if;
  select * into v_rep from public.reps where code = v_code and active;
  if not found then return 'invalid'; end if;
  if v_rep.user_id is not null and v_rep.user_id = p_user_id then return 'self'; end if;
  insert into public.referrals(user_id, rep_code) values (p_user_id, v_rep.code) on conflict do nothing;
  return 'ok';
end;
$$;

-- Called by the server right after a student's payment is confirmed by Paystack.
create or replace function public.record_rep_commission(
  p_user_id uuid, p_reference text, p_amount_kobo int, p_hold_days int
) returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_ref public.referrals%rowtype;
  v_rep public.reps%rowtype;
  v_rows int;
begin
  select * into v_ref from public.referrals where user_id = p_user_id;
  if not found then return 'no_referral'; end if;
  select * into v_rep from public.reps where code = v_ref.rep_code;
  if not found or not v_rep.active then return 'rep_inactive'; end if;
  if v_rep.user_id is not null and v_rep.user_id = p_user_id then return 'self'; end if;
  insert into public.rep_commissions(rep_code, referred_user_id, payment_reference, amount_kobo, eligible_at)
    values (v_rep.code, p_user_id, p_reference, p_amount_kobo, now() + make_interval(days => greatest(p_hold_days, 0)))
    on conflict do nothing;
  get diagnostics v_rows = row_count;
  return case when v_rows > 0 then 'recorded' else 'already' end;
end;
$$;

revoke all on function public.claim_referral(uuid,text,timestamptz,int) from public, anon, authenticated;
revoke all on function public.record_rep_commission(uuid,text,int,int) from public, anon, authenticated;
grant execute on function public.claim_referral(uuid,text,timestamptz,int) to service_role;
grant execute on function public.record_rep_commission(uuid,text,int,int) to service_role;
