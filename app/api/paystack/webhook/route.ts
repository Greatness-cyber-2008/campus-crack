import { NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';
import { supabaseServer } from '@/lib/supabaseServer';
import { fulfilPayment } from '@/lib/paystack';

// Paystack calls this itself, server to server, the moment a payment succeeds — including
// bank transfers that land minutes after the student left the site. Set the URL in the
// Paystack dashboard: Settings → API Keys & Webhooks → Webhook URL.
export async function POST(req: Request) {
  const raw = await req.text(); // the signature is over the exact raw body
  const signature = req.headers.get('x-paystack-signature') || '';
  const expected = createHmac('sha512', process.env.PAYSTACK_SECRET_KEY || '').update(raw).digest('hex');

  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  let event: any;
  try {
    event = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: 'Bad payload' }, { status: 400 });
  }

  if (event?.event === 'charge.success' && event?.data?.reference) {
    const result = await fulfilPayment(supabaseServer(), event.data.reference);
    // 'rejected' for a reference that isn't ours (other apps on the same Paystack account) is expected.
    if (result.status === 'rejected' && result.reason !== 'not_a_campuscrack_reference') {
      console.error('Paystack webhook: could not fulfil', event.data.reference, result.reason);
      // 500 makes Paystack retry later, which is what we want for a failed unlock.
      if (result.reason === 'unlock_failed') {
        return NextResponse.json({ error: 'retry' }, { status: 500 });
      }
    }
  }

  // Always acknowledge quickly so Paystack doesn't keep re-sending events we've handled.
  return NextResponse.json({ received: true });
}
