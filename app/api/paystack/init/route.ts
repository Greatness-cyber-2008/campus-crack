import { NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { getUserFromRequest, supabaseServer } from '@/lib/supabaseServer';
import { PREMIUM_PRICE_KOBO, REFERENCE_PREFIX } from '@/lib/paystack';

// Called just before the Paystack popup opens. Creates the transaction reference on the
// server and saves a "pending" payment against this student, so that even if they leave
// the site mid-payment (bank transfer), we still know whose payment it is when Paystack
// confirms it later.
export async function POST(req: Request) {
  const user = await getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const reference = `${REFERENCE_PREFIX}${Date.now()}_${randomBytes(5).toString('hex')}`;
  const { error } = await supabaseServer().from('payments').insert({
    user_id: user.id,
    paystack_reference: reference,
    amount_kobo: PREMIUM_PRICE_KOBO,
    purpose: 'premium_unlock',
    status: 'pending',
  });

  if (error) {
    console.error('paystack init error:', error);
    return NextResponse.json({ error: 'Could not start payment' }, { status: 500 });
  }
  return NextResponse.json({ reference });
}
