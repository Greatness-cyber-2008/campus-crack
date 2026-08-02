'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { v4 as uuidv4 } from 'uuid';
import { useUser, getAuthHeader } from '@/lib/useUser';
import { supabase } from '@/lib/supabaseClient';
import AppNav from '@/components/AppNav';

const DISCIPLINES = ['computing', 'medical', 'commercial', 'science', 'arts', 'law', 'engineering', 'general'];

interface Course {
  id: string;
  title: string;
  course_code: string | null;
}

export default function UploadPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-ink text-paper flex items-center justify-center">
          <p className="text-slate">Loading…</p>
        </main>
      }
    >
      <UploadForm />
    </Suspense>
  );
}

function UploadForm() {
  const { user } = useUser();
  const router = useRouter();
  const params = useSearchParams();
  const preselectedCourseId = params.get('courseId');

  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [courseCode, setCourseCode] = useState('');
  const [discipline, setDiscipline] = useState('general');
  const [courses, setCourses] = useState<Course[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState<string>(preselectedCourseId || '');
  const [status, setStatus] = useState<'idle' | 'uploading' | 'extracting' | 'done' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [materialId, setMaterialId] = useState<string | null>(null);
  const [usedOcr, setUsedOcr] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from('courses')
        .select('id, title, course_code')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      setCourses(data || []);
    })();
  }, [user]);

  const preselectedCourse = courses.find((c) => c.id === preselectedCourseId);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !user) return;
    setErrorMsg(null);
    setStatus('uploading');

    try {
      const ext = file.name.split('.').pop();
      const path = `${user.id}/${uuidv4()}.${ext}`;

      const { error: uploadError } = await supabase.storage.from('materials').upload(path, file);
      if (uploadError) throw new Error(uploadError.message);

      const { data: material, error: insertError } = await supabase
        .from('materials')
        .insert({
          user_id: user.id,
          course_id: selectedCourseId || null,
          title: title || file.name,
          course_code: courseCode || null,
          discipline,
          storage_path: path,
        })
        .select()
        .single();

      if (insertError || !material) throw new Error(insertError?.message || 'Could not save material');

      setMaterialId(material.id);
      setStatus('extracting');

      const authHeader = await getAuthHeader();
      const res = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader },
        body: JSON.stringify({ materialId: material.id }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Extraction failed');
      setUsedOcr(!!data.usedOcrFallback);

      setStatus('done');
    } catch (err: any) {
      setErrorMsg(err.message || 'Something went wrong');
      setStatus('error');
    }
  }

  return (
    <main className="min-h-screen bg-ink text-paper">
      <AppNav active="Upload" />

      <div className="px-4 sm:px-6 md:px-12 py-6 sm:py-10 max-w-xl mx-auto">
        <h1 className="text-2xl font-semibold mb-1">Upload your material</h1>
        <p className="text-slate mb-8 text-sm">
          PDF or plain text notes work best. Scanned image-only PDFs may not extract cleanly.
        </p>

        {status !== 'done' ? (
          <form onSubmit={handleUpload} className="space-y-4">
            {preselectedCourse ? (
              <div className="bg-gold/10 border border-gold/30 rounded-lg px-4 py-3 text-sm">
                Uploading to course: <span className="text-gold font-semibold">{preselectedCourse.title}</span>
              </div>
            ) : (
              <div>
                <label className="block text-sm text-slate mb-1">Add to a course (optional)</label>
                <select
                  value={selectedCourseId}
                  onChange={(e) => setSelectedCourseId(e.target.value)}
                  className="w-full bg-inkLight border border-white/10 rounded-lg px-4 py-3 focus:border-gold outline-none"
                >
                  <option value="">No course — standalone upload</option>
                  {courses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                      {c.course_code ? ` (${c.course_code})` : ''}
                    </option>
                  ))}
                </select>
                <p className="text-slate text-xs mt-1">
                  Grouping files under a course lets you build one study plan from all of them combined.{' '}
                  <Link href="/courses/create" className="text-gold">
                    Create a new course
                  </Link>
                </p>
              </div>
            )}

            <div>
              <label className="block text-sm text-slate mb-1">File (PDF or .txt)</label>
              <input
                required
                type="file"
                accept=".pdf,.txt,.md"
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="w-full bg-inkLight border border-white/10 rounded-lg px-4 py-3 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm text-slate mb-1">Title</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. CYB 201 - Network Security Week 5"
                className="w-full bg-inkLight border border-white/10 rounded-lg px-4 py-3 focus:border-gold outline-none"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-slate mb-1">Course code</label>
                <input
                  value={courseCode}
                  onChange={(e) => setCourseCode(e.target.value)}
                  placeholder="CYB 201"
                  className="w-full bg-inkLight border border-white/10 rounded-lg px-4 py-3 focus:border-gold outline-none"
                />
              </div>
              <div>
                <label className="block text-sm text-slate mb-1">Discipline</label>
                <select
                  value={discipline}
                  onChange={(e) => setDiscipline(e.target.value)}
                  className="w-full bg-inkLight border border-white/10 rounded-lg px-4 py-3 focus:border-gold outline-none capitalize"
                >
                  {DISCIPLINES.map((d) => (
                    <option key={d} value={d} className="capitalize">
                      {d}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {errorMsg && <p className="text-stamp text-sm">{errorMsg}</p>}

            <button
              type="submit"
              disabled={status === 'uploading' || status === 'extracting'}
              className="w-full bg-gold text-ink font-semibold py-3 rounded-full hover:brightness-110 transition disabled:opacity-60"
            >
              {status === 'uploading' && 'Uploading…'}
              {status === 'extracting' && 'Reading your material…'}
              {status === 'idle' && 'Upload material'}
              {status === 'error' && 'Try again'}
            </button>
            {status === 'extracting' && (
              <p className="text-slate text-xs text-center">
                Scanned documents can take up to a minute to read — hang tight, don&apos;t refresh.
              </p>
            )}
          </form>
        ) : (
          <div className="border border-gold/40 bg-gold/10 rounded-2xl p-6 text-center">
            <p className="font-semibold mb-2">Material ready ✅</p>
            {usedOcr && (
              <p className="text-slate text-xs mb-3">
                This looked like a scanned document, so we read it page by page — double-check the
                generated questions match your material.
              </p>
            )}
            <p className="text-slate text-sm mb-6">Now choose what you want to do with it.</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center flex-wrap">
              <button
                onClick={() => router.push(`/generate?materialId=${materialId}`)}
                className="bg-gold text-ink font-semibold px-6 py-3 rounded-full hover:brightness-110 transition"
              >
                Set up practice questions →
              </button>
              <button
                onClick={() => router.push(`/flashcards/generate?materialId=${materialId}`)}
                className="border border-white/10 px-6 py-3 rounded-full hover:border-gold/40 transition"
              >
                🗂️ Generate flashcards
              </button>
              <button
                onClick={() => router.push(`/planner/generate?materialId=${materialId}`)}
                className="border border-white/10 px-6 py-3 rounded-full hover:border-gold/40 transition"
              >
                📅 Build a study plan
              </button>
              <button
                onClick={() => router.push(`/chat/${materialId}`)}
                className="border border-white/10 px-6 py-3 rounded-full hover:border-gold/40 transition"
              >
                💬 Chat about this material
              </button>
            </div>
            {(selectedCourseId || preselectedCourseId) && (
              <p className="text-slate text-xs mt-4">
                <Link href={`/courses/${selectedCourseId || preselectedCourseId}`} className="text-gold">
                  ← Back to course
                </Link>
              </p>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
