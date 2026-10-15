'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useUser, getAuthHeader } from '@/lib/useUser';
import { supabase } from '@/lib/supabaseClient';
import AppNav from '@/components/AppNav';

const FREE_MAX_QUESTIONS = 10;

export default function GeneratePage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-ink text-paper flex items-center justify-center">
          <p className="text-slate">Loading…</p>
        </main>
      }
    >
      <GenerateForm />
    </Suspense>
  );
}

function GenerateForm() {
  const { user } = useUser();
  const router = useRouter();
  const params = useSearchParams();
  const materialId = params.get('materialId');
  const courseId = params.get('courseId');

  const [isPremium, setIsPremium] = useState<boolean | null>(null);
  const [examMode, setExamMode] = useState<'cbt' | 'written'>('cbt');
  const [difficulty, setDifficulty] = useState('mixed');
  const [questionCount, setQuestionCount] = useState(10);
  const [timeLimitMinutes, setTimeLimitMinutes] = useState(30);
  const [title, setTitle] = useState('');
  const [discipline, setDiscipline] = useState('general');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Mixed-set mode (?courseId=): pick several of a course's files to build ONE set from.
  const [courseTitle, setCourseTitle] = useState('');
  const [courseFiles, setCourseFiles] = useState<{ id: string; title: string }[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [filesLoading, setFilesLoading] = useState(!!courseId);
  // Single-file mode: does this file belong to a course with other ready files we could mix in?
  const [mixCourseId, setMixCourseId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase.from('profiles').select('is_premium').eq('id', user.id).single();
      const premium = !!data?.is_premium;
      setIsPremium(premium);
      if (premium) setQuestionCount(20);
    })();
  }, [user]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      if (courseId) {
        const { data: course } = await supabase
          .from('courses')
          .select('title, discipline')
          .eq('id', courseId)
          .single();
        const { data: files } = await supabase
          .from('materials')
          .select('id, title')
          .eq('course_id', courseId)
          .eq('status', 'ready')
          .order('created_at', { ascending: true });
        setCourseTitle(course?.title || '');
        if (course?.discipline) setDiscipline(course.discipline);
        setCourseFiles(files || []);
        setSelectedIds((files || []).map((f) => f.id));
        setFilesLoading(false);
      } else if (materialId) {
        const { data: mat } = await supabase.from('materials').select('course_id').eq('id', materialId).single();
        if (mat?.course_id) {
          const { count } = await supabase
            .from('materials')
            .select('id', { count: 'exact', head: true })
            .eq('course_id', mat.course_id)
            .eq('status', 'ready');
          if ((count || 0) > 1) setMixCourseId(mat.course_id);
        }
      }
    })();
  }, [user, courseId, materialId]);

  function toggleFile(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function handleGenerate() {
    if (!materialId && !courseId) return;
    if (courseId && selectedIds.length === 0) return;
    setLoading(true);
    setError(null);

    const authHeader = await getAuthHeader();
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader },
      body: JSON.stringify({
        ...(courseId ? { materialIds: selectedIds } : { materialId }),
        discipline,
        examMode,
        difficulty,
        questionCount,
        timeLimitMinutes,
        title,
      }),
    });

    const data = await res.json();
    setLoading(false);

    if (res.status === 402) {
      const reason = data.error === 'paywall' && examMode === 'written' ? 'written_locked' : 'limit_reached';
      router.push(`/pricing?reason=${reason}`);
      return;
    }
    if (!res.ok) {
      setError(data.error || 'Something went wrong generating your questions.');
      return;
    }

    router.push(examMode === 'cbt' ? `/practice/cbt/${data.questionSetId}` : `/practice/written/${data.questionSetId}`);
  }

  return (
    <main className="min-h-screen bg-ink text-paper">
      <AppNav />

      <div className="px-4 sm:px-6 md:px-12 py-6 sm:py-10 max-w-xl mx-auto">
        <h1 className="text-2xl font-semibold mb-1">Set up your practice</h1>
        <p className="text-slate mb-8 text-sm">
          {courseId
            ? 'Build one mixed set from the files you pick — questions are spread across all of them.'
            : 'Choose the format that matches how your course actually examines you.'}
        </p>

        {courseId && (
          <div className="mb-6">
            <label className="block text-sm text-slate mb-2">
              Files to include{courseTitle ? ` — ${courseTitle}` : ''} ({selectedIds.length} selected)
            </label>
            {filesLoading ? (
              <p className="text-slate text-sm">Loading files…</p>
            ) : courseFiles.length === 0 ? (
              <p className="text-stamp text-sm">No ready files in this course yet.</p>
            ) : (
              <div className="space-y-2">
                {courseFiles.map((f) => {
                  const on = selectedIds.includes(f.id);
                  return (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => toggleFile(f.id)}
                      className={`w-full flex items-center gap-3 text-left border rounded-xl px-4 py-3 min-h-[48px] transition ${
                        on ? 'border-gold bg-gold/10' : 'border-white/10'
                      }`}
                    >
                      <span className={`w-5 h-5 rounded border flex items-center justify-center text-xs shrink-0 ${on ? 'bg-gold text-ink border-gold' : 'border-white/30'}`}>
                        {on ? '✓' : ''}
                      </span>
                      <span className="text-sm truncate">{f.title}</span>
                    </button>
                  );
                })}
              </div>
            )}
            {selectedIds.length > 8 && <p className="text-stamp text-xs mt-2">Pick at most 8 files for one set.</p>}
          </div>
        )}

        {!courseId && mixCourseId && (
          <Link
            href={`/generate?courseId=${mixCourseId}`}
            className="block border border-gold/30 bg-gold/5 rounded-xl px-4 py-3 mb-6 text-sm text-gold hover:bg-gold/10 transition"
          >
            📚 This file is in a course with other files — build one mixed set from several of them →
          </Link>
        )}

        {isPremium === false && (
          <div className="border border-gold/30 bg-gold/5 rounded-xl px-5 py-4 mb-6 flex items-center justify-between gap-4">
            <p className="text-sm text-slate">
              You&apos;re on the free plan — CBT mode, up to {FREE_MAX_QUESTIONS} questions per set.
            </p>
            <Link href="/pricing" className="text-gold text-sm font-semibold whitespace-nowrap">
              Unlock everything — ₦3,500 →
            </Link>
          </div>
        )}

        <div className="space-y-6">
          <div>
            <label className="block text-sm text-slate mb-2">Exam mode</label>
            <div className="grid grid-cols-2 gap-2 sm:gap-3">
              <button
                onClick={() => setExamMode('cbt')}
                className={`rounded-xl border px-3 sm:px-4 py-3 sm:py-4 text-left transition ${
                  examMode === 'cbt' ? 'border-gold bg-gold/10' : 'border-white/10'
                }`}
              >
                <p className="font-semibold text-sm sm:text-base">CBT</p>
                <p className="text-slate text-[11px] sm:text-xs mt-1">Timed multiple choice, JAMB/uni CBT style</p>
              </button>
              <button
                onClick={() => {
                  if (isPremium === false) {
                    router.push('/pricing?reason=written_locked');
                    return;
                  }
                  setExamMode('written');
                }}
                className={`rounded-xl border px-3 sm:px-4 py-3 sm:py-4 text-left transition relative ${
                  examMode === 'written' ? 'border-gold bg-gold/10' : 'border-white/10'
                } ${isPremium === false ? 'opacity-60' : ''}`}
              >
                {isPremium === false && (
                  <span className="absolute top-2 right-2 text-[9px] sm:text-[10px] bg-stamp px-2 py-0.5 rounded-full">
                    ₦3,500
                  </span>
                )}
                <p className="font-semibold text-sm sm:text-base">Written</p>
                <p className="text-slate text-[11px] sm:text-xs mt-1">Theory questions with model answers</p>
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm text-slate mb-1">Set title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. CYB 201 Midterm Prep"
              className="w-full bg-inkLight border border-white/10 rounded-lg px-4 py-3 focus:border-gold outline-none"
            />
          </div>

          <div>
            <label className="block text-sm text-slate mb-1">Discipline (shapes question style)</label>
            <select
              value={discipline}
              onChange={(e) => setDiscipline(e.target.value)}
              className="w-full bg-inkLight border border-white/10 rounded-lg px-4 py-3 focus:border-gold outline-none capitalize"
            >
              {['computing', 'medical', 'commercial', 'science', 'arts', 'law', 'engineering', 'general'].map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-slate mb-1">
                Number of questions {isPremium === false && <span className="text-slate">(free max {FREE_MAX_QUESTIONS})</span>}
              </label>
              <input
                type="number"
                min={5}
                max={isPremium === false ? FREE_MAX_QUESTIONS : 50}
                value={questionCount}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  const cap = isPremium === false ? FREE_MAX_QUESTIONS : 50;
                  setQuestionCount(Number.isNaN(val) ? val : Math.min(val, cap));
                }}
                className="w-full bg-inkLight border border-white/10 rounded-lg px-4 py-3 focus:border-gold outline-none"
              />
            </div>
            <div>
              <label className="block text-sm text-slate mb-1">Difficulty</label>
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value)}
                className="w-full bg-inkLight border border-white/10 rounded-lg px-4 py-3 focus:border-gold outline-none capitalize"
              >
                {['mixed', 'easy', 'medium', 'hard'].map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {examMode === 'cbt' && (
            <div>
              <label className="block text-sm text-slate mb-1">Time limit (minutes)</label>
              <input
                type="number"
                min={5}
                max={180}
                value={timeLimitMinutes}
                onChange={(e) => setTimeLimitMinutes(parseInt(e.target.value, 10))}
                className="w-full bg-inkLight border border-white/10 rounded-lg px-4 py-3 focus:border-gold outline-none"
              />
            </div>
          )}

          {error && <p className="text-stamp text-sm">{error}</p>}

          <button
            onClick={handleGenerate}
            disabled={loading || (!materialId && !courseId) || (!!courseId && (selectedIds.length === 0 || selectedIds.length > 8))}
            className="w-full bg-gold text-ink font-semibold py-3 rounded-full hover:brightness-110 transition disabled:opacity-60"
          >
            {loading ? 'Generating your questions…' : 'Generate practice set'}
          </button>
          {!materialId && !courseId && <p className="text-stamp text-sm text-center">No material selected — go back and upload one first.</p>}
        </div>
      </div>
    </main>
  );
}
