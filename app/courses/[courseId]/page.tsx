'use client';
import { use, useEffect, useState } from "react";
import Link from 'next/link';
import { useUser } from '@/lib/useUser';
import { supabase } from '@/lib/supabaseClient';
import AppNav from '@/components/AppNav';

export default function CourseDetailPage({
  params,
}: {
  params: Promise<{ courseId: string }>;
}) {
  const { courseId } = use(params);

  const { user } = useUser();
  const [course, setCourse] = useState<CourseInfo | null>(null);
  const [materials, setMaterials] = useState<MaterialRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: courseData } = await supabase
        .from('courses')
        .select('id, title, course_code, discipline')
        .eq('id', courseId)
        .single();

      const { data: materialsData } = await supabase
        .from('materials')
        .select('id, title, status, created_at')
        .eq('course_id', courseId)
        .order('created_at', { ascending: false });

      setCourse(courseData);
      setMaterials(materialsData || []);
      setLoading(false);
    })();
  }, [user, courseId]);

  if (loading) {
    return (
      <main className="min-h-screen bg-ink text-paper flex items-center justify-center">
        <p className="text-slate">Loading…</p>
      </main>
    );
  }

  if (!course) {
    return (
      <main className="min-h-screen bg-ink text-paper flex items-center justify-center">
        <p className="text-slate">Course not found.</p>
      </main>
    );
  }

  const readyCount = materials.filter((m) => m.status === 'ready').length;

  return (
    <main className="min-h-screen bg-ink text-paper">
      <AppNav active="Courses" />

      <div className="px-4 sm:px-6 md:px-12 py-6 sm:py-10 max-w-3xl mx-auto">
        <h1 className="text-2xl font-semibold mb-1">{course.title}</h1>
        <p className="text-slate mb-8 text-sm capitalize">
          {course.course_code ? `${course.course_code} · ` : ''}
          {course.discipline}
        </p>

        <div className="flex flex-wrap gap-3 mb-8">
          <Link
            href={`/upload?courseId=${course.id}`}
            className="bg-gold text-ink font-semibold px-5 py-3 rounded-full text-sm hover:brightness-110 transition"
          >
            + Add a file to this course
          </Link>
          {readyCount > 0 && (
            <Link
              href={`/planner/generate?courseId=${course.id}`}
              className="border border-white/10 px-5 py-3 rounded-full text-sm hover:border-gold/40 transition"
            >
              📅 Build study plan from all {readyCount} file{readyCount === 1 ? '' : 's'}
            </Link>
          )}
        </div>

        <h2 className="text-lg font-semibold mb-4">Files in this course</h2>
        {materials.length === 0 ? (
          <p className="text-slate text-sm">No files uploaded to this course yet.</p>
        ) : (
          <div className="space-y-2">
            {materials.map((m) => (
              <div
                key={m.id}
                className="flex items-center justify-between border border-white/10 rounded-xl px-4 py-3"
              >
                <p className="text-sm truncate mr-3">{m.title}</p>
                <span
                  className={`text-xs shrink-0 ${
                    m.status === 'ready' ? 'text-gold' : m.status === 'failed' ? 'text-stamp' : 'text-slate'
                  }`}
                >
                  {m.status === 'ready' ? 'Ready ✓' : m.status === 'failed' ? 'Failed' : 'Processing…'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
