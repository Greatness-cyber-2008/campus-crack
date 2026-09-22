import type { SupabaseClient } from '@supabase/supabase-js';

// Finds-or-creates a Topic row for each distinct topic name generated for a
// student, and returns a name -> topic_id map so callers can attach topic_id
// to the questions/flashcards they're about to insert.
//
// Topics are scoped per (user_id, course_id) — see migration_012 for why:
// there's no shared course catalog today, so a shared taxonomy would be
// invented, not standardized, from what actually exists.
export async function resolveTopicIds(
  supa: SupabaseClient,
  userId: string,
  courseId: string | null,
  topicNames: (string | null | undefined)[]
): Promise<Record<string, string>> {
  const uniqueNames = Array.from(new Set(topicNames.filter((t): t is string => !!t)));
  if (uniqueNames.length === 0) return {};

  const map: Record<string, string> = {};

  for (const name of uniqueNames) {
    let findQuery = supa.from('topics').select('id').eq('user_id', userId).eq('name', name);
    findQuery = courseId ? findQuery.eq('course_id', courseId) : findQuery.is('course_id', null);
    const { data: existing } = await findQuery.maybeSingle();

    if (existing) {
      map[name] = existing.id;
      continue;
    }

    const { data: inserted, error } = await supa
      .from('topics')
      .insert({ user_id: userId, course_id: courseId, name })
      .select('id')
      .single();

    if (inserted) {
      map[name] = inserted.id;
    } else if (error) {
      // Likely a concurrent request created the same topic first (unique
      // constraint hit) — re-fetch rather than failing the whole generation.
      let retryQuery = supa.from('topics').select('id').eq('user_id', userId).eq('name', name);
      retryQuery = courseId ? retryQuery.eq('course_id', courseId) : retryQuery.is('course_id', null);
      const { data: retried } = await retryQuery.maybeSingle();
      if (retried) map[name] = retried.id;
    }
  }

  return map;
}
