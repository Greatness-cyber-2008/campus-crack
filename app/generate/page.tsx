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

  const [isPremium, setIsPremium] = useState<boolean | null>(null);
  const [examMode, setExamMode] = useState<'cbt' | 'written'>('cbt');
  const [difficulty, setDifficulty] = useState('mixed');
  const [questionCount, setQuestionCount] = useState(10);
  const [timeLimitMinutes, setTimeLimitMinutes] = useState(30);
  const [title, setTitle] = useState('');
  const [discipline, setDiscipline] = useState('general');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase.from('profiles').select('is_premium').eq('id', user.id).single();
      const premium = !!data?.is_premium;
      setIsPremium(premium);
      if (premium) setQuestionCount(20);
    })();
  }, [user]);

  async function handleGenerate() {
    if (!materialId) return;
    setLoading(true);
    setError(null);

    const authHeader = await getAuthHeader();
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader },
      body: JSON.stringify({
        materialId,
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
        <p className="text-slate mb-8 text-sm">Choose the format that matches how your course actually examines you.</p>

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
            disabled={loading || !materialId}
            className="w-full bg-gold text-ink font-semibold py-3 rounded-full hover:brightness-110 transition disabled:opacity-60"
          >
            {loading ? 'Generating your questions…' : 'Generate practice set'}
          </button>
          {!materialId && <p className="text-stamp text-sm text-center">No material selected — go back and upload one first.</p>}
        </div>
      </div>
    </main>
  );
}
