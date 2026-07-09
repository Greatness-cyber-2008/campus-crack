'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/lib/useUser';
import { supabase } from '@/lib/supabaseClient';

interface Question {
  id: string;
  order_index: number;
  prompt: string;
  model_answer: string;
  marking_points: string[];
}
interface QSet {
  id: string;
  title: string;
}

const RATING_MARKS: Record<string, number> = { nailed_it: 1, close: 0.5, missed: 0 };

export default function WrittenPracticePage({ params }: { params: { setId: string } }) {
  const { user } = useUser();
  const router = useRouter();

  const [qset, setQset] = useState<QSet | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [current, setCurrent] = useState(0);
  const [responses, setResponses] = useState<Record<string, string>>({});
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [ratings, setRatings] = useState<Record<string, string>>({});
  const [attemptId, setAttemptId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: qsetData } = await supabase
        .from('question_sets')
        .select('id, title')
        .eq('id', params.setId)
        .single();
      const { data: questionsData } = await supabase
        .from('questions')
        .select('id, order_index, prompt, model_answer, marking_points')
        .eq('question_set_id', params.setId)
        .order('order_index');
      const { data: attempt } = await supabase
        .from('attempts')
        .insert({ user_id: user.id, question_set_id: params.setId })
        .select()
        .single();

      setQset(qsetData);
      setQuestions(questionsData || []);
      setAttemptId(attempt?.id || null);
    })();
  }, [user, params.setId]);

  function rateAnswer(questionId: string, rating: string) {
    setRatings((prev) => ({ ...prev, [questionId]: rating }));
  }

  async function handleSubmit() {
    if (!attemptId) return;
    setSubmitting(true);

    let marksScored = 0;
    const totalMarks = questions.length;

    const answerRows = questions.map((q) => {
      const rating = ratings[q.id] || 'missed';
      const marks = RATING_MARKS[rating] ?? 0;
      marksScored += marks;
      return {
        attempt_id: attemptId,
        question_id: q.id,
        written_response: responses[q.id] || '',
        self_rating: rating,
        marks_awarded: marks,
      };
    });

    await supabase.from('answers').insert(answerRows);

    const score = totalMarks > 0 ? Math.round((marksScored / totalMarks) * 100) : 0;

    await supabase
      .from('attempts')
      .update({
        submitted_at: new Date().toISOString(),
        status: 'submitted',
        score,
        total_marks: totalMarks,
        marks_scored: marksScored,
      })
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
  const isRevealed = revealed[q.id];
  const allRated = questions.every((qq) => ratings[qq.id]);

  return (
    <main className="min-h-screen bg-ink text-paper flex flex-col">
      <header className="px-4 sm:px-6 md:px-12 py-4 sm:py-5 border-b border-white/10">
        <p className="font-semibold text-sm sm:text-base truncate">{qset.title}</p>
        <p className="text-slate text-xs">
          Question {current + 1} of {questions.length}
        </p>
      </header>

      <div className="flex-1 px-4 sm:px-6 md:px-12 py-6 sm:py-10 max-w-2xl mx-auto w-full">
        <p className="text-base sm:text-lg mb-6 leading-relaxed whitespace-pre-wrap">{q.prompt}</p>

        <textarea
          value={responses[q.id] || ''}
          onChange={(e) => setResponses((prev) => ({ ...prev, [q.id]: e.target.value }))}
          disabled={isRevealed}
          rows={7}
          placeholder="Write your answer as you would in the exam…"
          className="w-full bg-inkLight border border-white/10 rounded-xl px-4 py-3 text-base focus:border-gold outline-none mb-4 disabled:opacity-70"
        />

        {!isRevealed ? (
          <button
            onClick={() => setRevealed((prev) => ({ ...prev, [q.id]: true }))}
            className="w-full sm:w-auto bg-inkLight border border-white/10 px-5 py-3 rounded-full hover:border-gold/40 transition text-sm"
          >
            Reveal model answer & marking points
          </button>
        ) : (
          <div className="border border-gold/30 bg-gold/5 rounded-xl p-4 sm:p-5 space-y-4">
            <div>
              <p className="text-gold text-xs uppercase tracking-wide mb-2">Model answer</p>
              <p className="text-paper text-sm leading-relaxed whitespace-pre-wrap">{q.model_answer}</p>
            </div>
            <div>
              <p className="text-gold text-xs uppercase tracking-wide mb-2">Marking points to hit</p>
              <ul className="list-disc list-inside text-sm text-slate space-y-1">
                {(q.marking_points || []).map((point, i) => (
                  <li key={i}>{point}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-slate text-xs mb-2">Be honest — how did you do?</p>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { key: 'nailed_it', label: 'Nailed it' },
                  { key: 'close', label: 'Close' },
                  { key: 'missed', label: 'Missed it' },
                ].map((opt) => (
                  <button
                    key={opt.key}
                    onClick={() => rateAnswer(q.id, opt.key)}
                    className={`px-2 sm:px-4 py-2.5 rounded-full text-xs sm:text-sm border transition ${
                      ratings[q.id] === opt.key ? 'border-gold bg-gold/20' : 'border-white/10'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <footer className="flex items-center justify-between gap-3 px-4 sm:px-6 md:px-12 py-4 sm:py-5 border-t border-white/10">
        <button
          disabled={current === 0}
          onClick={() => setCurrent((c) => c - 1)}
          className="text-slate disabled:opacity-30 py-3 px-2 -mx-2"
        >
          ← Previous
        </button>

        {current < questions.length - 1 ? (
          <button
            onClick={() => setCurrent((c) => c + 1)}
            className="bg-inkLight border border-white/10 px-5 sm:px-6 py-3 rounded-full hover:border-gold/40 transition"
          >
            Next →
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={submitting || !allRated}
            className="bg-stamp px-5 sm:px-6 py-3 rounded-full font-semibold hover:brightness-110 transition disabled:opacity-60 text-sm sm:text-base"
            title={!allRated ? 'Rate every question first' : ''}
          >
            {submitting ? 'Submitting…' : 'Finish & see results'}
          </button>
        )}
      </footer>
    </main>
  );
}
