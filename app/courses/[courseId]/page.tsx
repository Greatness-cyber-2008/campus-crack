'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { useUser } from '@/lib/useUser';
import { supabase } from '@/lib/supabaseClient';
import AppNav from '@/components/AppNav';

interface CourseInfo {
  id: string;
  title: string;
  course_code: string | null;
  discipline: string | null;
}
interface MaterialRow {
  id: string;
  title: string;
  status: string;
  created_at: string;
  storage_path: string;
}

// A material stuck on "processing" past this long almost certainly means the
// extraction request died server-side (crashed, or hit a hosting time limit)
// without ever reporting back — so we stop showing it as "in progress" and
// let the student clear it out instead of waiting on something that will
// never finish.
const STUCK_AFTER_MS = 5 * 60 * 1000;

function isStuck(m: MaterialRow) {
  return m.status === 'processing' && Date.now() - new Date(m.created_at).getTime() > STUCK_AFTER_MS;
}

export default function CourseDetailPage({ params }: { params: Promise<{ courseId: string }> }) {
  const { courseId } = use(params);
  const { user } = useUser();
  const [course, setCourse] = useState<CourseInfo | null>(null);
  const [materials, setMaterials] = useState<MaterialRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);

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
        .select('id, title, status, created_at, storage_path')
        .eq('course_id', courseId)
        .order('created_at', { ascending: false });

      setCourse(courseData);
      setMaterials(materialsData || []);
      setLoading(false);
    })();
  }, [user, courseId]);

  async function handleDelete(m: MaterialRow) {
    if (!confirm(`Delete "${m.title}"? This can't be undone.`)) return;
    setDeletingId(m.id);

    // Best-effort storage cleanup — if this fails (e.g. file already gone)
    // we still remove the database row so the student isn't stuck with a
    // ghost entry they can't get rid of.
    if (m.storage_path) {
      await supabase.storage.from('materials').remove([m.storage_path]);
    }
    const { error } = await supabase.from('materials').delete().eq('id', m.id);

    if (error) {
      alert('Could not delete this file — please try again.');
      setDeletingId(null);
      return;
    }

    setMaterials((prev) => prev.filter((x) => x.id !== m.id));
    setDeletingId(null);
  }

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
          {readyCount >= 2 && (
            <Link
              href={`/generate?courseId=${course.id}`}
              className="border border-gold/40 text-gold px-5 py-3 rounded-full text-sm hover:bg-gold/10 transition"
            >
              📝 Mixed question set from your files
            </Link>
          )}
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
            {materials.map((m) => {
              const stuck = isStuck(m);
              const label = m.status === 'ready' ? 'Ready ✓' : m.status === 'failed' ? 'Failed' : stuck ? 'Failed to process' : 'Processing…';
              const labelClass = m.status === 'ready' ? 'text-gold' : m.status === 'failed' || stuck ? 'text-stamp' : 'text-slate';

              return (
                <div
                  key={m.id}
                  className="flex items-center justify-between border border-white/10 rounded-xl px-4 py-3"
                >
                  <p className="text-sm truncate mr-3">{m.title}</p>
                  <div className="flex items-center gap-3 shrink-0">
                    {m.status === 'ready' && (
                      <Link href={`/chat/${m.id}`} className="text-gold text-xs hover:underline">
                        💬 Chat
                      </Link>
                    )}
                    <span className={`text-xs ${labelClass}`}>{label}</span>
                    <button
                      onClick={() => handleDelete(m)}
                      disabled={deletingId === m.id}
                      aria-label={`Delete ${m.title}`}
                      className="text-slate hover:text-stamp transition disabled:opacity-50 text-xs"
                    >
                      {deletingId === m.id ? '…' : '🗑️'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
