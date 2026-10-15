import { NextResponse } from 'next/server';
import { getUserFromRequest, supabaseServer } from '@/lib/supabaseServer';
import { fulfilPayment } from '@/lib/paystack';

// Called by the browser right after the Paystack popup reports success. This is only
// the fast path — if the student leaves the page (e.g. to make a bank transfer) it never
// runs, which is why /api/paystack/webhook and /api/paystack/sync also exist.
export async function POST(req: Request) {
  const user = await getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { reference, purpose, questionSetId } = await req.json();
  if (!reference || !purpose) {
    return NextResponse.json({ error: 'reference and purpose required' }, { status: 400 });
  }

  const result = await fulfilPayment(supabaseServer(), reference, {
    expectedUserId: user.id,
    fallbackPurpose: purpose,
    fallbackQuestionSetId: questionSetId,
  });

  if (result.status === 'success' || result.status === 'already_processed') {
    return NextResponse.json({ status: result.status });
  }
  if (result.status === 'not_paid') {
    // Not an error: a transfer may simply not have landed yet. The webhook/sync will finish it.
    return NextResponse.json({ status: 'pending' }, { status: 202 });
  }
  return NextResponse.json({ error: 'Payment could not be verified' }, { status: 402 });
}
