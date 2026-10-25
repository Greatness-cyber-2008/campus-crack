import type { SupabaseClient } from '@supabase/supabase-js';

// Campus rep program. A rep's link is  campuscrack.com.ng/?ref=CODE  (works on any page, including shared practice links).
// The rules live in two SQL functions (migration_019) so they are atomic and can't be bent from the browser.

export const REF_CODE_PATTERN = /^[A-Z0-9_-]{3,20}$/;
export const REP_COMMISSION_KOBO = parseInt(process.env.REP_COMMISSION_KOBO || '50000', 10); // N500
export const REP_PAYOUT_HOLD_DAYS = parseInt(process.env.REP_PAYOUT_HOLD_DAYS || '7', 10);
export const REP_CLAIM_WINDOW_DAYS = parseInt(process.env.REP_CLAIM_WINDOW_DAYS || '7', 10);

export function normalizeRefCode(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const code = raw.trim().toUpperCase();
  return REF_CODE_PATTERN.test(code) ? code : null;
}

// Credits a rep for a student's first successful semester payment. Best effort: a problem here
// must never get in the way of unlocking the student's access, so it only logs.
export async function recordRepCommission(supa: SupabaseClient, userId: string, paymentReference: string) {
  try {
    const { data, error } = await supa.rpc('record_rep_commission', {
      p_user_id: userId,
      p_reference: paymentReference,
      p_amount_kobo: REP_COMMISSION_KOBO,
      p_hold_days: REP_PAYOUT_HOLD_DAYS,
    });
    if (error) console.error('recordRepCommission failed:', error.message);
    else if (data === 'recorded') console.log('Rep commission recorded for payment', paymentReference);
  } catch (err) {
    console.error('recordRepCommission error:', err);
  }
}
