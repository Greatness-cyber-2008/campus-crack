-- Your day-to-day rep toolkit. Run ONE block at a time in the Supabase SQL Editor
-- (select just that block before pressing Run). Not part of the app; nothing here runs automatically.

-- 1) ADD A REP. Code = what goes after ?ref= in their link (capital letters/numbers, 3-20 characters).
--    Their link: https://campuscrack.com.ng/?ref=TUNDE
insert into reps (code, name, phone) values ('TUNDE', 'Tunde A.', '08000000000');

-- 2) SCOREBOARD: one row per rep
select r.code, r.name,
  (select count(*) from referrals f where f.rep_code = r.code)                                                   as signups,
  (select count(*) from rep_commissions c where c.rep_code = r.code and c.voided_at is null)                     as paying_students,
  (select coalesce(sum(amount_kobo),0)/100 from rep_commissions c
     where c.rep_code = r.code and c.voided_at is null and c.paid_at is null and c.eligible_at <= now())         as owed_now_naira,
  (select coalesce(sum(amount_kobo),0)/100 from rep_commissions c
     where c.rep_code = r.code and c.voided_at is null and c.paid_at is null and c.eligible_at > now())          as still_waiting_naira,
  (select coalesce(sum(amount_kobo),0)/100 from rep_commissions c
     where c.rep_code = r.code and c.paid_at is not null)                                                        as already_paid_naira
from reps r order by paying_students desc;

-- 3) WEEKLY PAYOUT, step A: see exactly what you owe each rep right now
select rep_code, count(*) as students, sum(amount_kobo)/100 as pay_naira
from rep_commissions
where voided_at is null and paid_at is null and eligible_at <= now()
group by rep_code order by pay_naira desc;

-- 3) WEEKLY PAYOUT, step B: after you have transferred the money to a rep, mark it paid (change the code)
update rep_commissions set paid_at = now()
where rep_code = 'TUNDE' and voided_at is null and paid_at is null and eligible_at <= now();

-- 4) REFUND OR DISPUTE: cancel one commission (use the payment reference, e.g. campuscrack_...)
update rep_commissions set voided_at = now(), note = 'refunded'
where payment_reference = 'campuscrack_REPLACE_ME' and paid_at is null;

-- 5) STOP A REP (their link stops crediting new students; commissions already earned stay)
update reps set active = false where code = 'TUNDE';

-- 6) LET A REP SEE THEIR DASHBOARD (campuscrack.com.ng/rep)
--    The rep first signs up on CampusCrack normally (WITHOUT their own link). Then link their account here.
--    This also stops them earning from their own purchases.
update reps set user_id = (select id from auth.users where email = 'rep@example.com') where code = 'TUNDE';
