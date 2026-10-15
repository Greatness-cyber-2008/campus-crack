import type { SupabaseClient } from '@supabase/supabase-js';

// Single place where a Paystack payment turns into premium access. Used by the
// browser callback (/api/paystack/verify), Paystack's own server-to-server
// webhook (/api/paystack/webhook) and the recovery check (/api/paystack/sync),
// so that no matter which of them hears about a payment first — or if the
// student closed the tab to go make a bank transfer — access gets unlocked once,
// and only once.

export const REFERENCE_PREFIX = 'campuscrack_';
export const PREMIUM_PRICE_KOBO = parseInt(process.env.NEXT_PUBLIC_PREMIUM_PRICE_KOBO || '350000', 10);

// How long a payment unlocks access for. Nigerian semesters typically run 4-5 months;
// 168 days (5.5 months) is slightly generous so a delayed resumption doesn't cut a
// student off early. Tune via env var without touching code.
const PREMIUM_DURATION_DAYS = parseInt(process.env.PREMIUM_DURATION_DAYS || '168', 10);

export type FulfilResult =
  | { status: 'success' }
  | { status: 'already_processed' }
  | { status: 'not_paid' } // Paystack says it isn't successful (yet) — e.g. transfer still pending, or abandoned
  | { status: 'rejected'; reason: string };

export async function fulfilPayment(
  supa: SupabaseClient,
  reference: string,
  opts: { expectedUserId?: string; fallbackPurpose?: string; fallbackQuestionSetId?: string } = {}
): Promise<FulfilResult> {
  if (!reference.startsWith(REFERENCE_PREFIX)) {
    // The Paystack account may also serve other apps — never act on their transactions.
    return { status: 'rejected', reason: 'not_a_campuscrack_reference' };
  }

  // 1. Ask Paystack directly. Never trust what the browser or a webhook body claims.
  const verifyRes = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
  });
  const verifyData = await verifyRes.json().catch(() => null);
  if (!verifyRes.ok || !verifyData?.data) return { status: 'not_paid' };
  if (verifyData.data.status !== 'success') return { status: 'not_paid' };

  const amountKobo: number = verifyData.data.amount;
  const currency: string | undefined = verifyData.data.currency;
  if (currency !== 'NGN') return { status: 'rejected', reason: 'wrong_currency' };

  // 2. Work out who paid and for what.
  const { data: row } = await supa
    .from('payments')
    .select('id, user_id, purpose, question_set_id, status')
    .eq('paystack_reference', reference)
    .maybeSingle();

  if (row?.status === 'success') return { status: 'already_processed' };

  // Whose payment is it? The pending row saved at checkout is the source of truth. Without one,
  // fall back to the user id attached to the Paystack transaction itself — never to "whoever is asking",
  // so nobody can claim someone else's genuine payment just by knowing its reference.
  const userId: string | undefined = row?.user_id || verifyData.data.metadata?.user_id;
  const purpose: string = row?.purpose || verifyData.data.metadata?.purpose || opts.fallbackPurpose || 'premium_unlock';
  const questionSetId: string | null = row?.question_set_id || opts.fallbackQuestionSetId || null;

  if (!userId) return { status: 'rejected', reason: 'unknown_user' };
  // A student can only claim their own payment.
  if (opts.expectedUserId && opts.expectedUserId !== userId) return { status: 'rejected', reason: 'wrong_user' };

  if (purpose === 'premium_unlock' && amountKobo < PREMIUM_PRICE_KOBO) {
    return { status: 'rejected', reason: 'amount_too_low' };
  }

  // 3. Claim it atomically: whichever caller flips the row to 'success' first does the
  //    unlocking; a second caller (webhook + callback racing) gets no row back and stops.
  if (!row) {
    await supa.from('payments').upsert(
      {
        user_id: userId,
        paystack_reference: reference,
        amount_kobo: amountKobo,
        purpose,
        question_set_id: purpose === 'set_unlock' ? questionSetId : null,
        status: 'pending',
      },
      { onConflict: 'paystack_reference', ignoreDuplicates: true }
    );
  }

  const { data: claimed } = await supa
    .from('payments')
    .update({ status: 'success', amount_kobo: amountKobo })
    .eq('paystack_reference', reference)
    .neq('status', 'success')
    .select('id');

  if (!claimed || claimed.length === 0) return { status: 'already_processed' };

  // 4. Apply the unlock. If this fails, put the row back to pending so a retry can finish the job.
  try {
    if (purpose === 'premium_unlock') {
      // Still has time left from a previous unlock? Extend from that expiry rather than
      // from today — renewing a few days early shouldn't waste time they already paid for.
      const { data: profile } = await supa.from('profiles').select('premium_expires_at').eq('id', userId).single();
      const now = new Date();
      const currentExpiry = profile?.premium_expires_at ? new Date(profile.premium_expires_at) : null;
      const extendFrom = currentExpiry && currentExpiry > now ? currentExpiry : now;
      const newExpiry = new Date(extendFrom);
      newExpiry.setDate(newExpiry.getDate() + PREMIUM_DURATION_DAYS);

      const { error } = await supa
        .from('profiles')
        .update({ is_premium: true, premium_expires_at: newExpiry.toISOString() })
        .eq('id', userId);
      if (error) throw error;
    } else if (purpose === 'set_unlock' && questionSetId) {
      const { error } = await supa.from('question_sets').update({ is_locked: false }).eq('id', questionSetId).eq('user_id', userId);
      if (error) throw error;
    }
  } catch (err) {
    console.error('fulfilPayment: unlock failed, reverting to pending', reference, err);
    await supa.from('payments').update({ status: 'pending' }).eq('paystack_reference', reference);
    return { status: 'rejected', reason: 'unlock_failed' };
  }

  return { status: 'success' };
}
