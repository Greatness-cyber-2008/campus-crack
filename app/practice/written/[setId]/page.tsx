'use client';

import { use, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/lib/useUser';
import { supabase } from '@/lib/supabaseClient';

interface Question { id: string; order_index: number; prompt: string; }
interface QSet { id: string; title: string; }

export default function WrittenPracticePage({ params }: { params: Promise<{ setId: string }> }) {
  const { setId } = use(params);
  const { user } = useUser();
  const router = useRouter();

  const [qset, setQset] = useState<QSet | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [current, setCurrent] = useState(0);
  const [responses, setResponses] = useState<Record<string, string>>({});
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const initializedRef = useRef(false);

  useEffect(() => {
    if (!user || initializedRef.current) return;
    initializedRef.current = true;

    (async () => {
      const { data: qsetData } = await supabase.from('question_sets').select('id, title').eq('id', setId).single();
      const { data: questionsData } = await supabase
        .from('questions')
        .select('id, order_index, prompt')
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
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, setId]);

  async function handleSubmit() {
    if (!attemptId || submitting) return;
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/grade-written', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          attemptId,
          answers: questions.map((q) => ({ questionId: q.id, response: responses[q.id] || '' })),
        }),
      });

      if (!res.ok) {
        setSubmitting(false);
        setError('Could not grade your exam, please try again.');
        return;
      }

      router.push(`/results/${attemptId}`);
    } catch (err) {
      setSubmitting(false);
      setError('Could not grade your exam, please try again.');
    }
  }

  if (!qset || questions.length === 0) {
    return (
      <main className="min-h-screen bg-ink text-paper flex items-center justify-center">
        <p className="text-slate">Loading your practice set…</p>
      </main>
    );
  }

  const q = questions[current];
  const answeredCount = Object.values(responses).filter((r) => r.trim()).length;

  return (
    <main className="min-h-screen bg-ink text-paper flex flex-col">
      <header className="px-4 sm:px-6 md:px-12 py-4 sm:py-5 border-b border-white/10">
        <p className="font-semibold text-sm sm:text-base truncate">{qset.title}</p>
        <p className="text-slate text-xs">Question {current + 1} of {questions.length} · {answeredCount} written</p>
      </header>

      <div className="flex-1 px-4 sm:px-6 md:px-12 py-6 sm:py-10 max-w-2xl mx-auto w-full">
        <p className="text-base sm:text-lg mb-6 leading-relaxed whitespace-pre-wrap">{q.prompt}</p>

        <textarea
          value={responses[q.id] || ''}
          onChange={(e) => setResponses((prev) => ({ ...prev, [q.id]: e.target.value }))}
          rows={10}
          placeholder="Write your answer as you would in the exam…"
          className="w-full bg-inkLight border border-white/10 rounded-xl px-4 py-3 text-base focus:border-gold outline-none"
        />

        {current === questions.length - 1 && answeredCount < questions.length && (
          <p className="text-slate text-xs mt-3">
            You have {questions.length - answeredCount} question(s) left unanswered. You can still submit, but
            unanswered questions will be graded as 0%.
          </p>
        )}

        {error && <p className="text-stamp text-sm mt-3">{error}</p>}
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
          <button onClick={handleSubmit} disabled={submitting} className="bg-stamp px-5 sm:px-6 py-3 rounded-full font-semibold hover:brightness-110 transition disabled:opacity-60 text-sm sm:text-base">
            {submitting ? 'Grading your exam…' : 'Submit & grade exam'}
          </button>
        )}
      </footer>
    </main>
  );
}