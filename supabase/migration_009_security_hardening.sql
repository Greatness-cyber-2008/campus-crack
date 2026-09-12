-- ============================================================
-- Migration: security hardening based on Supabase's Security Advisor.
-- Pins search_path on SECURITY DEFINER functions and revokes public
-- execute access on functions that should only run via triggers/cron.
-- Safe to run regardless of which earlier migrations you've applied.
-- ============================================================

alter function public.handle_new_user() set search_path = public;
alter function public.update_streak_on_attempt_submit() set search_path = public;
alter function public.update_streak_on_flashcard_review() set search_path = public;
alter function public.bump_streak(uuid) set search_path = public;
alter function public.send_inactivity_reminder_emails() set search_path = public;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.update_streak_on_attempt_submit() from public, anon, authenticated;
revoke execute on function public.update_streak_on_flashcard_review() from public, anon, authenticated;
revoke execute on function public.bump_streak(uuid) from public, anon, authenticated;
revoke execute on function public.send_inactivity_reminder_emails() from public, anon, authenticated;
