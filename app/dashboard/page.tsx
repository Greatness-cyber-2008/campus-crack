'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useUser } from '@/lib/useUser';
import { supabase } from '@/lib/supabaseClient';
import AppNav from '@/components/AppNav';

interface QuestionSet {
  id: string;
  title: string;
  exam_mode: 'cbt' | 'written';
  discipline: string;
  question_count: number;
  created_at: string;
}
interface CurrentWeekInfo {
  planId: string;
  planTitle: string;
  weekNumber: number;
  topic: string;
}

function getCurrentWeekNumber(startDate: string): number {
  const start = new Date(startDate);
  const today = new Date();
  const diffMs = today.getTime() - start.getTime();
  return Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000)) + 1;
}

export default function DashboardPage() {
  const { user, loading } = useUser();
  const [sets, setSets] = useState<QuestionSet[]>([]);
  const [profile, setProfile] = useState<{
    full_name: string;
    is_premium: boolean;
    free_generations_used: number;
    current_streak: number;
    longest_streak: number;
  } | null>(null);
  const [currentWeekInfo, setCurrentWeekInfo] = useState<CurrentWeekInfo | null>(null);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [{ data: setsData }, { data: profileData }, { data: plansData }] = await Promise.all([
        supabase
          .from('question_sets')
          .select('id, title, exam_mode, discipline, question_count, created_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(5),
        supabase
          .from('profiles')
          .select('full_name, is_premium, free_generations_used, current_streak, longest_streak')
          .eq('id', user.id)
          .single(),
        supabase
          .from('study_plans')
          .select('id, title, start_date, total_weeks')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false }),
      ]);
      setSets(setsData || []);
      setProfile(profileData as any);

      for (const plan of plansData || []) {
        const weekNum = getCurrentWeekNumber(plan.start_date);
        if (weekNum >= 1 && weekNum <= plan.total_weeks) {
          const { data: weekData } = await supabase
            .from('study_plan_weeks')
            .select('topic')
            .eq('study_plan_id', plan.id)
            .eq('week_number', weekNum)
            .single();
          if (weekData) {
            setCurrentWeekInfo({ planId: plan.id, planTitle: plan.title, weekNumber: weekNum, topic: weekData.topic });
          }
          break;
        }
      }

      setFetching(false);
    })();
  }, [user]);

  if (loading || fetching) {
    return (
      <main className="min-h-screen bg-ink text-paper flex items-center justify-center">
        <p className="text-slate">Loading…</p>
      </main>
    );
  }

  const remainingFree = Math.max(0, 3 - (profile?.free_generations_used || 0));

  return (
    <main className="min-h-screen bg-ink text-paper">
      <AppNav active="Dashboard" />

      <div className="px-4 sm:px-6 md:px-12 py-6 sm:py-10 max-w-5xl mx-auto">
        <div className="flex items-center justify-between gap-3 mb-1">
          <h1 className="text-2xl font-semibold">
            {profile?.full_name ? `Welcome back, ${profile.full_name.split(' ')[0]}` : 'Welcome back'}
          </h1>
          {(profile?.current_streak || 0) > 0 && (
            <div className="shrink-0 flex items-center gap-1.5 bg-stamp/10 border border-stamp/30 text-stamp px-3 py-1.5 rounded-full text-sm font-semibold">
              🔥 {profile?.current_streak} day{profile?.current_streak === 1 ? '' : 's'}
            </div>
          )}
        </div>
        <p className="text-slate mb-8">
          {profile?.is_premium ? 'You have full access unlocked.' : `${remainingFree} free generation${remainingFree === 1 ? '' : 's'} left.`}
        </p>

        {currentWeekInfo && (
          <Link
            href={`/planner/${currentWeekInfo.planId}`}
            className="block border border-gold/30 bg-gold/5 rounded-xl px-5 py-4 mb-6 hover:bg-gold/10 transition"
          >
            <p className="text-xs text-gold font-semibold uppercase tracking-wide mb-1">
              📅 Week {currentWeekInfo.weekNumber} · {currentWeekInfo.planTitle}
            </p>
            <p className="text-sm">{currentWeekInfo.topic}</p>
          </Link>
        )}

        {!profile?.is_premium && (
          <Link
            href="/pricing"
            className="block border border-gold/30 bg-gold/5 rounded-xl px-5 py-4 mb-8 hover:bg-gold/10 transition"
          >
            <p className="text-sm">
              <span className="text-gold font-semibold">Unlock everything for ₦3,500</span>
              <span className="text-slate"> — unlimited generations, written/theory mode, up to 50 questions per set.</span>
            </p>
          </Link>
        )}

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 mb-10">
          <Link href="/chat/general" className="border border-gold/40 bg-gold/10 rounded-2xl p-6 hover:bg-gold/20 transition">
            <h3 className="font-semibold mb-1">🎓 Ask the Study Tutor</h3>
            <p className="text-slate text-sm">Ask about any topic — text, voice, or attach a photo.</p>
          </Link>
          <Link href="/flashcards" className="border border-gold/40 bg-gold/10 rounded-2xl p-6 hover:bg-gold/20 transition">
            <h3 className="font-semibold mb-1">🗂️ Flashcards</h3>
            <p className="text-slate text-sm">A few minutes a day, all semester long.</p>
          </Link>
          <Link href="/planner" className="border border-gold/40 bg-gold/10 rounded-2xl p-6 hover:bg-gold/20 transition">
            <h3 className="font-semibold mb-1">📅 Study Planner</h3>
            <p className="text-slate text-sm">Week-by-week breakdown of your course.</p>
          </Link>
          <Link href="/courses" className="border border-white/10 rounded-2xl p-6 hover:border-white/30 transition">
            <h3 className="font-semibold mb-1">📚 My Courses</h3>
            <p className="text-slate text-sm">Group files by course, plan the whole semester at once.</p>
          </Link>
          <Link href="/upload" className="border border-white/10 rounded-2xl p-6 hover:border-white/30 transition">
            <h3 className="font-semibold mb-1">Upload new material</h3>
            <p className="text-slate text-sm">Turn a PDF or your notes into a fresh practice set.</p>
          </Link>
          <Link href="/library" className="border border-white/10 rounded-2xl p-6 hover:border-white/30 transition">
            <h3 className="font-semibold mb-1">My question sets</h3>
            <p className="text-slate text-sm">Revisit past sets and see your score history.</p>
          </Link>
          <Link href="/analytics" className="border border-white/10 rounded-2xl p-6 hover:border-white/30 transition">
            <h3 className="font-semibold mb-1">📊 Analytics</h3>
            <p className="text-slate text-sm">See your score trend and weakest topics.</p>
          </Link>
          <Link href="/browse" className="border border-white/10 rounded-2xl p-6 hover:border-white/30 transition">
            <h3 className="font-semibold mb-1">Community sets</h3>
            <p className="text-slate text-sm">Practice sets other students have shared, free.</p>
          </Link>
        </div>

        <h2 className="text-lg font-semibold mb-4">Recent sets</h2>
        {sets.length === 0 ? (
          <p className="text-slate">No question sets yet — upload your first material to get started.</p>
        ) : (
          <div className="space-y-3">
            {sets.map((s) => (
              <Link
                key={s.id}
                href={s.exam_mode === 'cbt' ? `/practice/cbt/${s.id}` : `/practice/written/${s.id}`}
                className="flex items-center justify-between gap-3 border border-white/10 rounded-xl px-4 sm:px-5 py-4 hover:border-gold/40 transition"
              >
                <div className="min-w-0">
                  <p className="font-medium truncate">{s.title}</p>
                  <p className="text-slate text-xs sm:text-sm capitalize truncate">
                    {s.discipline} · {s.exam_mode.toUpperCase()} · {s.question_count} questions
                  </p>
                </div>
                <span className="text-gold text-sm shrink-0">Practice →</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}