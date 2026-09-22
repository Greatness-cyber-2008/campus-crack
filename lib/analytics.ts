import { supabaseServer } from './supabaseServer';

// The event names this phase actually instruments — tied to flows that already
// exist today. Events for features introduced in later phases (e.g.
// tutor_opened_from_result, recommendation_shown) get added when those
// features are built, not invented ahead of time.
export type AnalyticsEventName =
  | 'course_created'
  | 'material_uploaded'
  | 'material_processed'
  | 'exam_generated'
  | 'exam_started'
  | 'exam_submitted'
  | 'payment_completed';

// Server-side event logging. Deliberately fire-and-forget: a logging failure
// must never break or slow down the actual feature it's instrumenting.
export async function logEvent(
  userId: string,
  eventName: AnalyticsEventName,
  properties: Record<string, unknown> = {}
): Promise<void> {
  try {
    const supa = supabaseServer();
    await supa.from('analytics_events').insert({ user_id: userId, event_name: eventName, properties });
  } catch (err) {
    console.error(`Failed to log analytics event "${eventName}":`, err);
  }
}
