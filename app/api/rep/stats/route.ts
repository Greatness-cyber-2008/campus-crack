import { NextResponse } from 'next/server';
import { getUserFromRequest, supabaseServer } from '@/lib/supabaseServer';

// Numbers for the logged-in campus rep's own dashboard. A rep is a CampusCrack account that
// has been linked to a row in `reps` (reps.user_id). Everyone else just gets { isRep: false }.
export async function GET(req: Request) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const supa = supabaseServer();
  const { data: rep } = await supa.from('reps').select('code, name, active').eq('user_id', user.id).maybeSingle();
  if (!rep) return NextResponse.json({ isRep: false });

  const [{ data: referrals }, { data: commissions }] = await Promise.all([
    supa.from('referrals').select('user_id, created_at').eq('rep_code', rep.code).order('created_at', { ascending: false }).limit(200),
    supa.from('rep_commissions').select('referred_user_id, amount_kobo, eligible_at, paid_at, voided_at, created_at').eq('rep_code', rep.code),
  ]);

  const now = Date.now();
  let owedNow = 0, waiting = 0, paid = 0, paying = 0;
  const byStudent = new Map<string, any>();
  for (const c of commissions || []) {
    byStudent.set(c.referred_user_id, c);
    if (c.voided_at) continue;
    paying++;
    if (c.paid_at) paid += c.amount_kobo;
    else if (new Date(c.eligible_at).getTime() <= now) owedNow += c.amount_kobo;
    else waiting += c.amount_kobo;
  }

  // Show students by first name only, and never any contact details.
  const ids = (referrals || []).map((r) => r.user_id);
  const names = new Map<string, string>();
  if (ids.length) {
    const { data: profs } = await supa.from('profiles').select('id, full_name').in('id', ids);
    for (const p of profs || []) names.set(p.id, (p.full_name || '').trim().split(/\s+/)[0] || 'Student');
  }

  const students = (referrals || []).map((r) => {
    const c = byStudent.get(r.user_id);
    let status: 'signed_up' | 'paid_waiting' | 'payable' | 'paid_out' | 'cancelled' = 'signed_up';
    if (c) {
      if (c.voided_at) status = 'cancelled';
      else if (c.paid_at) status = 'paid_out';
      else if (new Date(c.eligible_at).getTime() <= now) status = 'payable';
      else status = 'paid_waiting';
    }
    return {
      name: names.get(r.user_id) || 'Student',
      joined: r.created_at,
      status,
      payable_on: c && !c.voided_at && !c.paid_at ? c.eligible_at : null,
    };
  });

  return NextResponse.json({
    isRep: true,
    code: rep.code,
    name: rep.name,
    active: rep.active,
    signups: (referrals || []).length,
    paying,
    owedNowNaira: owedNow / 100,
    waitingNaira: waiting / 100,
    paidNaira: paid / 100,
    students,
  });
}
