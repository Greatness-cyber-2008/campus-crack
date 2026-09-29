import { supabaseServer } from './supabaseServer';

export type AnalyticsEventName =
  | 'course_created'
  | 'material_uploaded'
  | 'material_processed'
  | 'exam_generated'
  | 'exam_started'
  | 'exam_submitted'
  | 'payment_completed'
  | 'tutor_opened_from_result'
  | 'remediation_completed';

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
