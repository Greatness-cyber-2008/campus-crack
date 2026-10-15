import type { SupabaseClient, User } from '@supabase/supabase-js';

// Server-only helpers for shareable question-set links (/s/<token>).
// Everything here runs with the service-role client, so access rules are
// enforced in code: never trust anything the browser claims about itself.

export const FREE_SHARED_SAMPLE_QUESTIONS = parseInt(process.env.FREE_SHARED_SAMPLE_QUESTIONS || '5', 10);

export interface SharedSetRow {
  id: string;
  user_id: string;
  title: string;
  course_code: string | null;
  exam_mode: string;
  is_shared: boolean;
}

export interface AttemptRow {
  id: string;
  answers: Record<string, string>;
}

export async function loadSharedSet(supa: SupabaseClient, token: string): Promise<SharedSetRow | null> {
  if (!token || token.length > 64) return null;
  const { data } = await supa
    .from('question_sets')
    .select('id, user_id, title, course_code, exam_mode, is_shared')
    .eq('share_token', token)
    .maybeSingle();
  if (!data || !data.is_shared || data.exam_mode !== 'cbt') return null;
  return data as SharedSetRow;
}

// Full access = premium (not expired) or the set's own creator.
export async function isUnlockedFor(supa: SupabaseClient, user: User | null, set: SharedSetRow) {
  if (!user) return { isPremium: false, unlocked: false };
  if (user.id === set.user_id) return { isPremium: false, unlocked: true };

  const { data: profile } = await supa
    .from('profiles')
    .select('is_premium, premium_expires_at')
    .eq('id', user.id)
    .maybeSingle();

  const isPremium =
    !!profile?.is_premium &&
    (!profile.premium_expires_at || new Date(profile.premium_expires_at).getTime() > Date.now());
  return { isPremium, unlocked: isPremium };
}

// Finds this viewer's attempt. If they're logged in and have no attempt yet but
// an anonymous one exists for their browser, that anonymous attempt is claimed
// so progress survives signing up / upgrading. With create=true a fresh attempt
// is made when none exists.
export async function findOrCreateAttempt(
  supa: SupabaseClient,
  setId: string,
  user: User | null,
  anonId: string | null,
  create: boolean
): Promise<AttemptRow | null> {
  if (user) {
    const { data: mine } = await supa
      .from('shared_attempts')
      .select('id, answers')
      .eq('question_set_id', setId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (mine) return mine as AttemptRow;

    if (anonId) {
      const { data: anon } = await supa
        .from('shared_attempts')
        .select('id, answers')
        .eq('question_set_id', setId)
        .eq('anon_id', anonId)
        .is('user_id', null)
        .maybeSingle();
      if (anon) {
        const { data: claimed } = await supa
          .from('shared_attempts')
          .update({ user_id: user.id, updated_at: new Date().toISOString() })
          .eq('id', anon.id)
          .select('id, answers')
          .single();
        if (claimed) return claimed as AttemptRow;
      }
    }

    if (!create) return null;
    const { data: created } = await supa
      .from('shared_attempts')
      .insert({ question_set_id: setId, user_id: user.id })
      .select('id, answers')
      .single();
    return (created as AttemptRow) || null;
  }

  if (!anonId) return null;
  const { data: existing } = await supa
    .from('shared_attempts')
    .select('id, answers')
    .eq('question_set_id', setId)
    .eq('anon_id', anonId)
    .is('user_id', null)
    .maybeSingle();
  if (existing) return existing as AttemptRow;

  if (!create) return null;
  const { data: created } = await supa
    .from('shared_attempts')
    .insert({ question_set_id: setId, anon_id: anonId })
    .select('id, answers')
    .single();
  return (created as AttemptRow) || null;
}

export function cleanAnonId(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const v = raw.trim();
  return v.length >= 8 && v.length <= 64 && /^[A-Za-z0-9_-]+$/.test(v) ? v : null;
}
