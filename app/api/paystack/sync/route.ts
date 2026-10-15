import { NextResponse } from 'next/server';
import { getUserFromRequest, supabaseServer } from '@/lib/supabaseServer';
import { fulfilPayment } from '@/lib/paystack';

// Safety net: re-checks this student's recent unfinished payments with Paystack and
// unlocks anything that has actually been paid. The app calls it whenever a free user
// opens their dashboard or the pricing page, so a student who paid by transfer and came
// back later gets unlocked even if the webhook was missed or never configured.
export async function POST(req: Request) {
  const user = await getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const supa = supabaseServer();
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: pending } = await supa
    .from('payments')
    .select('paystack_reference')
    .eq('user_id', user.id)
    .eq('status', 'pending')
    .eq('purpose', 'premium_unlock')
    .gte('created_at', since)
    .order('created_at', { ascending: false })
    .limit(5);

  let unlocked = false;
  for (const p of pending || []) {
    const result = await fulfilPayment(supa, p.paystack_reference, { expectedUserId: user.id });
    if (result.status === 'success') unlocked = true;
  }

  const { data: profile } = await supa.from('profiles').select('is_premium').eq('id', user.id).maybeSingle();
  return NextResponse.json({ unlocked, isPremium: !!profile?.is_premium, checked: (pending || []).length });
}
