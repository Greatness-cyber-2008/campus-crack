'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useUser } from '@/lib/useUser';
import { supabase } from '@/lib/supabaseClient';
import AppNav from '@/components/AppNav';

interface Course {
  id: string;
  title: string;
  course_code: string | null;
  discipline: string | null;
}

export default function CoursesListPage() {
  const { user } = useUser();
  const [courses, setCourses] = useState<Course[]>([]);
  const [materialCounts, setMaterialCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: coursesData } = await supabase
        .from('courses')
        .select('id, title, course_code, discipline')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      const rows = coursesData || [];
      const counts: Record<string, number> = {};
      await Promise.all(
        rows.map(async (c) => {
          const { count } = await supabase
            .from('materials')
            .select('id', { count: 'exact', head: true })
            .eq('course_id', c.id);
          counts[c.id] = count || 0;
        })
      );

      setCourses(rows);
      setMaterialCounts(counts);
      setLoading(false);
    })();
  }, [user]);

  return (
    <main className="min-h-screen bg-ink text-paper">
      <AppNav active="Courses" />

      <div className="px-4 sm:px-6 md:px-12 py-6 sm:py-10 max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-2xl font-semibold">My courses</h1>
          <Link
            href="/courses/create"
            className="bg-gold text-ink font-semibold px-4 py-2 rounded-full text-sm hover:brightness-110 transition"
          >
            + New course
          </Link>
        </div>
        <p className="text-slate mb-8 text-sm">
          Group all your files for a course together — notes, past questions, slides — so you can
          build one study plan from everything at once.
        </p>

        {loading ? (
          <p className="text-slate">Loading…</p>
        ) : courses.length === 0 ? (
          <div className="text-center py-16 border border-white/10 rounded-2xl">
            <p className="text-slate mb-6">You haven&apos;t created a course yet.</p>
            <Link
              href="/courses/create"
              className="bg-gold text-ink font-semibold px-6 py-3 rounded-full hover:brightness-110 transition"
            >
              Create your first course
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {courses.map((c) => (
              <Link
                key={c.id}
                href={`/courses/${c.id}`}
                className="flex items-center justify-between gap-3 border border-white/10 rounded-xl px-4 sm:px-5 py-4 hover:border-gold/40 transition"
              >
                <div className="min-w-0">
                  <p className="font-medium truncate">{c.title}</p>
                  <p className="text-slate text-xs sm:text-sm capitalize truncate">
                    {c.course_code ? `${c.course_code} · ` : ''}
                    {c.discipline}
                  </p>
                </div>
                <span className="shrink-0 text-slate text-xs">
                  {materialCounts[c.id] || 0} file{materialCounts[c.id] === 1 ? '' : 's'}
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
