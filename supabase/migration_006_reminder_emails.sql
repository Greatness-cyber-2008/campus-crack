-- ============================================================
-- Migration: inactivity reminder emails, sent entirely from inside
-- Supabase itself (pg_cron + pg_net) — no Vercel Cron, no new app
-- code, and NOT related to Supabase Auth's SMTP settings at all.
-- This calls Brevo's HTTP API directly with an API key, which is a
-- completely separate mechanism from the SMTP setup that caused
-- signup issues before — this cannot affect login/signup emails.
-- ============================================================

-- 1) Enable the extensions this needs (safe to run even if already enabled)
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 2) Track when we last emailed each student, so we don't nag daily
alter table profiles add column if not exists last_reminder_sent_date date;

-- 3) Store your Brevo API key securely in Supabase Vault (encrypted, not
--    plain text in your SQL). Run this ONCE with your real key, then never
--    run it again (running it twice creates a duplicate secret):
--
--    select vault.create_secret('YOUR_BREVO_API_KEY_HERE', 'brevo_api_key');
--
-- Get this key from Brevo -> Settings -> SMTP & API -> API Keys tab
-- (this is a different key than the "SMTP key" you generated earlier —
-- this one is for calling Brevo's HTTP API directly).

-- 4) The function that finds inactive students and emails them
create or replace function public.send_inactivity_reminder_emails()
returns void
language plpgsql
security definer
as $$
declare
  api_key text;
  sender_email text := 'YOUR_VERIFIED_SENDER_EMAIL_HERE'; -- must match the email you verified in Brevo
  r record;
begin
  select decrypted_secret into api_key from vault.decrypted_secrets where name = 'brevo_api_key';

  if api_key is null then
    raise notice 'brevo_api_key not found in Vault — reminder emails skipped';
    return;
  end if;

  for r in
    select p.id, u.email, p.full_name
    from profiles p
    join auth.users u on u.id = p.id
    where coalesce(p.last_active_date, p.created_at::date) < current_date - interval '2 days'
      and (p.last_reminder_sent_date is null or p.last_reminder_sent_date < current_date - interval '3 days')
      and u.email is not null
  loop
    perform net.http_post(
      url := 'https://api.brevo.com/v3/smtp/email',
      headers := jsonb_build_object(
        'api-key', api_key,
        'Content-Type', 'application/json'
      ),
      body := jsonb_build_object(
        'sender', jsonb_build_object('name', 'CampusCrack', 'email', sender_email),
        'to', jsonb_build_array(jsonb_build_object('email', r.email, 'name', coalesce(r.full_name, 'there'))),
        'subject', 'Your exams are not going to crack themselves 👀',
        'htmlContent',
          '<p>Hey ' || coalesce(r.full_name, 'there') || ',</p>' ||
          '<p>You have not practiced on CampusCrack in a couple of days. ' ||
          'Jump back in and keep building your streak!</p>' ||
          '<p><a href="https://your-campuscrack-domain.vercel.app/dashboard">Continue studying</a></p>'
      )
    );

    update profiles set last_reminder_sent_date = current_date where id = r.id;
  end loop;
end;
$$;

-- 5) Schedule it to run once a day at 8am UTC (roughly 9am WAT / Nigerian time)
select cron.schedule(
  'daily-inactivity-reminder',
  '0 8 * * *',
  $$ select public.send_inactivity_reminder_emails(); $$
);
