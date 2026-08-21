import { NextResponse } from 'next/server';
import { getUserFromRequest, supabaseServer } from '@/lib/supabaseServer';

// How long a ₦3,500 payment unlocks access for. Nigerian semesters typically run
// 4-5 months; this defaults to a slightly generous 5.5 months (168 days) so a
// slower-than-usual semester (e.g. a delayed resumption) doesn't cut a student
// off early. Tune via env var without touching code.
const PREMIUM_DURATION_DAYS = parseInt(process.env.PREMIUM_DURATION_DAYS || '168', 10);

export async function POST(req: Request) {
  const user = await getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { reference, purpose, questionSetId } = await req.json();
  if (!reference || !purpose) {
    return NextResponse.json({ error: 'reference and purpose required' }, { status: 400 });
  }

  const verifyRes = await fetch(`https://api.paystack.co/transaction/verify/${reference}`, {
    headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
  });
  const verifyData = await verifyRes.json();

  if (!verifyRes.ok || verifyData?.data?.status !== 'success') {
    return NextResponse.json({ error: 'Payment could not be verified' }, { status: 402 });
  }

  const amountKobo = verifyData.data.amount;
  const supa = supabaseServer();

  const { data: existing } = await supa
    .from('payments')
    .select('id, status')
    .eq('paystack_reference', reference)
    .maybeSingle();

  if (existing?.status === 'success') {
    return NextResponse.json({ status: 'already_processed' });
  }

  await supa.from('payments').upsert(
    {
      user_id: user.id,
      paystack_reference: reference,
      amount_kobo: amountKobo,
      purpose,
      question_set_id: purpose === 'set_unlock' ? questionSetId : null,
      status: 'success',
    },
    { onConflict: 'paystack_reference' }
  );

  if (purpose === 'premium_unlock') {
    // If the student still has time left on a previous unlock, extend from that
    // expiry date rather than from today — renewing a few days early shouldn't
    // waste the time they already paid for.
    const { data: profile } = await supa
      .from('profiles')
      .select('premium_expires_at')
      .eq('id', user.id)
      .single();

    const now = new Date();
    const currentExpiry = profile?.premium_expires_at ? new Date(profile.premium_expires_at) : null;
    const extendFrom = currentExpiry && currentExpiry > now ? currentExpiry : now;

    const newExpiry = new Date(extendFrom);
    newExpiry.setDate(newExpiry.getDate() + PREMIUM_DURATION_DAYS);

    await supa
      .from('profiles')
      .update({ is_premium: true, premium_expires_at: newExpiry.toISOString() })
      .eq('id', user.id);
  } else if (purpose === 'set_unlock' && questionSetId) {
    await supa.from('question_sets').update({ is_locked: false }).eq('id', questionSetId).eq('user_id', user.id);
  }

  return NextResponse.json({ status: 'success' });
}
