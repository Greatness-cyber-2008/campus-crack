'use client';

import { use, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/lib/useUser';
import { supabase } from '@/lib/supabaseClient';

interface Option { key: string; text: string; }
interface Question { id: string; order_index: number; prompt: string; options: Option[]; }
interface QSet { id: string; title: string; time_limit_minutes: number | null; question_count: number; }

export default function CbtPracticePage({ params }: { params: Promise<{ setId: string }> }) {
  const { setId } = use(params);
  const { user } = useUser();
  const router = useRouter();

  const [qset, setQset] = useState<QSet | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [current, setCurrent] = useState(0);
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submittedRef = useRef(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: qsetData } = await supabase
        .from('question_sets')
        .select('id, title, time_limit_minutes, question_count')
        .eq('id', setId)
        .single();
      const { data: questionsData } = await supabase
        .from('questions')
        .select('id, order_index, prompt, options')
        .eq('question_set_id', setId)
        .order('order_index');

      const { data: attempt } = await supabase
        .from('attempts')
        .insert({ user_id: user.id, question_set_id: setId })
        .select()
        .single();

      setQset(qsetData);
      setQuestions(questionsData || []);
      setAttemptId(attempt?.id || null);
      if (qsetData?.time_limit_minutes) {
        setSecondsLeft(qsetData.time_limit_minutes * 60);
      }
    })();
  }, [user, setId]);

  useEffect(() => {
    if (secondsLeft === null) return;
    if (secondsLeft <= 0) {
      handleSubmit();
      return;
    }
    const t = setTimeout(() => setSecondsLeft((s) => (s !== null ? s - 1 : s)), 1000);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [secondsLeft]);

  function selectOption(questionId: string, key: string) {
    setAnswers((prev) => ({ ...prev, [questionId]: key }));
  }

  async function handleSubmit() {
    if (submittedRef.current || !attemptId) return;
    submittedRef.current = true;
    setSubmitting(true);

    const { data: fullQuestions } = await supabase
      .from('questions')
      .select('id, correct_option, marks')
      .eq('question_set_id', setId);

    let marksScored = 0;
    let totalMarks = 0;

    const answerRows = (fullQuestions || []).map((q) => {
      const selected = answers[q.id];
      const isCorrect = selected === q.correct_option;
      totalMarks += q.marks;
      if (isCorrect) marksScored += q.marks;
      return {
        attempt_id: attemptId,
        question_id: q.id,
        selected_option: selected || null,
        is_correct: isCorrect,
        marks_awarded: isCorrect ? q.marks : 0,
      };
    });

    await supabase.from('answers').insert(answerRows);

    const score = totalMarks > 0 ? Math.round((marksScored / totalMarks) * 100) : 0;

    await supabase
      .from('attempts')
      .update({ submitted_at: new Date().toISOString(), status: 'submitted', score, total_marks: totalMarks, marks_scored: marksScored })
      .eq('id', attemptId);

    router.push(`/results/${attemptId}`);
  }

  if (!qset || questions.length === 0) {
    return (
      <main className="min-h-screen bg-ink text-paper flex items-center justify-center">
        <p className="text-slate">Loading your practice set…</p>
      </main>
    );
  }

  const q = questions[current];
  const minutes = secondsLeft !== null ? Math.floor(secondsLeft / 60) : null;
  const seconds = secondsLeft !== null ? secondsLeft % 60 : null;
  const answeredCount = Object.keys(answers).length;

  return (
    <main className="min-h-screen bg-ink text-paper flex flex-col">
      <header className="flex items-center justify-between gap-3 px-4 sm:px-6 md:px-12 py-4 sm:py-5 border-b border-white/10">
        <div className="min-w-0">
          <p className="font-semibold text-sm sm:text-base truncate">{qset.title}</p>
          <p className="text-slate text-xs whitespace-nowrap">Q{current + 1}/{questions.length} · {answeredCount} answered</p>
        </div>
        {secondsLeft !== null && (
          <div className={`font-mono text-base sm:text-lg shrink-0 ${secondsLeft < 60 ? 'text-stamp' : 'text-gold'}`}>
            {minutes}:{String(seconds).padStart(2, '0')}
          </div>
        )}
      </header>

      <div className="flex-1 px-4 sm:px-6 md:px-12 py-6 sm:py-10 max-w-3xl mx-auto w-full">
        <p className="text-base sm:text-lg mb-6 sm:mb-8 leading-relaxed whitespace-pre-wrap">{q.prompt}</p>
        <div className="space-y-3">
          {q.options?.map((opt) => (
            <button
              key={opt.key}
              onClick={() => selectOption(q.id, opt.key)}
              className={`w-full text-left border rounded-xl px-4 sm:px-5 py-4 min-h-[52px] transition ${
                answers[q.id] === opt.key ? 'border-gold bg-gold/10' : 'border-white/10 active:border-white/30'
              }`}
            >
              <span className="font-mono text-gold mr-3">{opt.key}</span>
              {opt.text}
            </button>
          ))}
        </div>
      </div>

      <footer className="flex items-center justify-between gap-3 px-4 sm:px-6 md:px-12 py-4 sm:py-5 border-t border-white/10">
        <button disabled={current === 0} onClick={() => setCurrent((c) => c - 1)} className="text-slate disabled:opacity-30 py-3 px-2 -mx-2">
          ← Previous
        </button>
        {current < questions.length - 1 ? (
          <button onClick={() => setCurrent((c) => c + 1)} className="bg-inkLight border border-white/10 px-5 sm:px-6 py-3 rounded-full hover:border-gold/40 transition">
            Next →
          </button>
        ) : (
          <button onClick={handleSubmit} disabled={submitting} className="bg-stamp px-5 sm:px-6 py-3 rounded-full font-semibold hover:brightness-110 transition disabled:opacity-60">
            {submitting ? 'Submitting…' : 'Submit exam'}
          </button>
        )}
      </footer>
    </main>
  );
}
