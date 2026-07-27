'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useUser } from '@/lib/useUser';
import { supabase } from '@/lib/supabaseClient';
import AppNav from '@/components/AppNav';

interface StudyPlan {
  id: string;
  title: string;
  course_code: string | null;
  start_date: string;
  total_weeks: number;
}

function getCurrentWeekNumber(startDate: string): number {
  const start = new Date(startDate);
  const today = new Date();
  const diffMs = today.getTime() - start.getTime();
  return Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000)) + 1;
}

export default function PlannerListPage() {
  const { user } = useUser();
  const [plans, setPlans] = useState<StudyPlan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from('study_plans')
        .select('id, title, course_code, start_date, total_weeks')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      setPlans(data || []);
      setLoading(false);
    })();
  }, [user]);

  return (
    <main className="min-h-screen bg-ink text-paper">
      <AppNav />

      <div className="px-4 sm:px-6 md:px-12 py-6 sm:py-10 max-w-4xl mx-auto">
        <h1 className="text-2xl font-semibold mb-1">My study plans</h1>
        <p className="text-slate mb-8 text-sm">A week-by-week breakdown so you're never behind.</p>

        {loading ? (
          <p className="text-slate">Loading…</p>
        ) : plans.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-slate mb-6">You haven&apos;t built a study plan yet.</p>
            <Link
              href="/upload"
              className="bg-gold text-ink font-semibold px-6 py-3 rounded-full hover:brightness-110 transition"
            >
              Upload a course outline to get started
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {plans.map((p) => {
              const currentWeek = getCurrentWeekNumber(p.start_date);
              const isOver = currentWeek > p.total_weeks;
              const isUpcoming = currentWeek < 1;
              return (
                <Link
                  key={p.id}
                  href={`/planner/${p.id}`}
                  className="flex items-center justify-between gap-3 border border-white/10 rounded-xl px-4 sm:px-5 py-4 hover:border-gold/40 transition"
                >
                  <div className="min-w-0">
                    <p className="font-medium truncate">{p.title}</p>
                    <p className="text-slate text-xs sm:text-sm truncate">
                      {p.course_code ? `${p.course_code} · ` : ''}
                      {p.total_weeks} weeks
                    </p>
                  </div>
                  <span className="shrink-0 text-xs font-mono text-gold">
                    {isOver ? 'Completed' : isUpcoming ? 'Not started' : `Week ${currentWeek}`}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
