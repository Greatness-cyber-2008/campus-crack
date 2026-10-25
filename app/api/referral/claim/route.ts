import { NextResponse } from 'next/server';
import { getUserFromRequest, supabaseServer } from '@/lib/supabaseServer';
import { normalizeRefCode, REP_CLAIM_WINDOW_DAYS } from '@/lib/referrals';

// Called once by the browser after a student who arrived through a rep link has signed up / logged in.
// The server decides everything: the browser only says which code it saw.
export async function POST(req: Request) {
  const user = await getUserFromRequest(req);
  if (!user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const code = normalizeRefCode(body?.code);
  if (!code) return NextResponse.json({ status: 'invalid' });

  const { data, error } = await supabaseServer().rpc('claim_referral', {
    p_user_id: user.id,
    p_code: code,
    p_account_created: user.created_at,
    p_window_days: REP_CLAIM_WINDOW_DAYS,
  });
  if (error) {
    console.error('claim_referral failed:', error.message);
    return NextResponse.json({ error: 'Could not record referral' }, { status: 500 });
  }
  return NextResponse.json({ status: data });
}
