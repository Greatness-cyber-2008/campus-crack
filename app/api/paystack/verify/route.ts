import { NextResponse } from 'next/server';
import { getUserFromRequest, supabaseServer } from '@/lib/supabaseServer';

// Called from the client immediately after the Paystack popup succeeds.
// We re-verify server-side against Paystack's API before granting access —
// never trust the client-side "success" callback alone.
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

  // Idempotency guard — a webhook or a page refresh could call this twice
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
    await supa.from('profiles').update({ is_premium: true }).eq('id', user.id);
  } else if (purpose === 'set_unlock' && questionSetId) {
    await supa.from('question_sets').update({ is_locked: false }).eq('id', questionSetId).eq('user_id', user.id);
  }

  return NextResponse.json({ status: 'success' });
}
