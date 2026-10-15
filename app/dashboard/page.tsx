'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useUser, getAuthHeader } from '@/lib/useUser';
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

      // Paid by bank transfer and came back later? Re-check Paystack for any unfinished
      // payment and unlock automatically, so nobody has to wait or pay twice.
      if (profileData && !(profileData as any).is_premium) {
        try {
          const res = await fetch('/api/paystack/sync', { method: 'POST', headers: await getAuthHeader() });
          const sync = await res.json();
          if (sync?.isPremium) setProfile((prev) => (prev ? { ...prev, is_premium: true } : prev));
        } catch {
          // best-effort — the webhook is the primary path
        }
      }

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
  const mostRecentSet = sets[0];
  const olderSets = sets.slice(1);

  // One label per concept, used identically in AppNav and here — no more
  // "My Courses" vs "Courses" / "My question sets" vs "My sets" drift.
  const secondaryActions = [
    { href: '/upload', icon: '📤', label: 'Upload', sub: 'Turn a PDF or your notes into a fresh practice set.' },
    { href: '/chat/general', icon: '🎓', label: 'Tutor', sub: 'Ask about any topic — text, voice, or attach a photo.' },
    { href: '/flashcards', icon: '🗂️', label: 'Flashcards', sub: 'A few minutes a day, all semester long.' },
    { href: '/planner', icon: '📅', label: 'Planner', sub: 'Week-by-week breakdown of your course.' },
    { href: '/courses', icon: '📚', label: 'Courses', sub: 'Group files by course, plan the whole semester at once.' },
    { href: '/library', icon: '📂', label: 'My sets', sub: 'Revisit past sets and see your score history.' },
    { href: '/analytics', icon: '📊', label: 'Analytics', sub: 'See your score trend and weakest topics.' },
    { href: '/browse', icon: '🌍', label: 'Community', sub: 'Practice sets other students have shared, free.' },
  ];

  return (
    <main className="min-h-screen bg-ink text-paper">
      <AppNav active="Dashboard" />

      <div className="px-4 sm:px-6 md:px-12 py-6 sm:py-10 max-w-5xl mx-auto">
        {/* Status row: greeting + streak + a real premium badge, not just a sentence */}
        <div className="flex items-center justify-between gap-3 mb-1 flex-wrap">
          <h1 className="text-2xl font-semibold">
            {profile?.full_name ? `Welcome back, ${profile.full_name.split(' ')[0]}` : 'Welcome back'}
          </h1>
          <div className="flex items-center gap-2 shrink-0">
            {profile?.is_premium && (
              <div className="flex items-center gap-1.5 bg-gold/15 border border-gold/40 text-gold px-3 py-1.5 rounded-full text-sm font-semibold">
                👑 Premium
              </div>
            )}
            {(profile?.current_streak || 0) > 0 && (
              <div className="flex items-center gap-1.5 bg-stamp/10 border border-stamp/30 text-stamp px-3 py-1.5 rounded-full text-sm font-semibold">
                🔥 {profile?.current_streak} day{profile?.current_streak === 1 ? '' : 's'}
              </div>
            )}
          </div>
        </div>
        {!profile?.is_premium && (
          <p className="text-slate mb-6">
            {remainingFree} free generation{remainingFree === 1 ? '' : 's'} left.
          </p>
        )}
        {profile?.is_premium && <div className="mb-6" />}

        {currentWeekInfo && (
          <Link
            href={`/planner/${currentWeekInfo.planId}`}
            className="block border border-gold/30 bg-gold/5 rounded-xl px-5 py-4 mb-4 hover:bg-gold/10 transition"
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
            className="block border border-gold/30 bg-gold/5 rounded-xl px-5 py-4 mb-4 hover:bg-gold/10 transition"
          >
            <p className="text-sm">
              <span className="text-gold font-semibold">Unlock everything for ₦3,500</span>
              <span className="text-slate"> — unlimited generations, written/theory mode, up to 50 questions per set.</span>
            </p>
          </Link>
        )}

        {/* ONE primary action — the only gold-emphasized element on the page.
            Brand-new users get a single obvious next step instead of 8 equal
            tiles; returning users get "continue" instead of hunting for it. */}
        {mostRecentSet ? (
          <Link
            href={mostRecentSet.exam_mode === 'cbt' ? `/practice/cbt/${mostRecentSet.id}` : `/practice/written/${mostRecentSet.id}`}
            className="block border-2 border-gold bg-gold/10 rounded-2xl px-5 sm:px-6 py-5 sm:py-6 mb-3 hover:bg-gold/15 transition"
          >
            <p className="text-xs text-gold font-semibold uppercase tracking-wide mb-2">Continue where you left off</p>
            <p className="text-lg font-semibold mb-1 truncate">{mostRecentSet.title}</p>
            <p className="text-slate text-sm capitalize">
              {mostRecentSet.discipline} · {mostRecentSet.exam_mode.toUpperCase()} · {mostRecentSet.question_count} questions
            </p>
            <span className="inline-block mt-3 text-gold text-sm font-semibold">Practice now →</span>
          </Link>
        ) : (
          <Link
            href="/upload"
            className="block border-2 border-gold bg-gold/10 rounded-2xl px-5 sm:px-6 py-7 sm:py-8 mb-3 text-center hover:bg-gold/15 transition"
          >
            <p className="text-lg font-semibold mb-1">📤 Upload your first material</p>
            <p className="text-slate text-sm max-w-sm mx-auto">
              Drop in a PDF or your notes and get your first practice set in minutes.
            </p>
          </Link>
        )}

        {olderSets.length > 0 && (
          <details className="mb-8 group">
            <summary className="cursor-pointer text-sm text-slate hover:text-paper transition list-none flex items-center gap-1.5 py-2">
              <span className="inline-block transition-transform group-open:rotate-90">▸</span>
              More recent sets ({olderSets.length})
            </summary>
            <div className="space-y-2 mt-2">
              {olderSets.map((s) => (
                <Link
                  key={s.id}
                  href={s.exam_mode === 'cbt' ? `/practice/cbt/${s.id}` : `/practice/written/${s.id}`}
                  className="flex items-center justify-between gap-3 border border-white/10 rounded-xl px-4 sm:px-5 py-3.5 hover:border-gold/40 transition"
                >
                  <div className="min-w-0">
                    <p className="font-medium truncate text-sm">{s.title}</p>
                    <p className="text-slate text-xs capitalize truncate">
                      {s.discipline} · {s.exam_mode.toUpperCase()} · {s.question_count} questions
                    </p>
                  </div>
                  <span className="text-gold text-sm shrink-0">Practice →</span>
                </Link>
              ))}
            </div>
          </details>
        )}

        {/* Secondary actions — deliberately smaller and visually equal to each
            other, so nothing competes with the primary action above. */}
        <h2 className="text-sm font-semibold text-slate uppercase tracking-wide mb-3">More</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {secondaryActions.map((a) => (
            <Link
              key={a.href}
              href={a.href}
              className="border border-white/10 rounded-xl p-4 hover:border-white/30 transition"
            >
              <h3 className="font-semibold text-sm mb-1">{a.icon} {a.label}</h3>
              <p className="text-slate text-xs leading-snug">{a.sub}</p>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}