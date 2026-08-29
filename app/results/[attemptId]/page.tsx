'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { useUser } from '@/lib/useUser';
import { supabase } from '@/lib/supabaseClient';
import AppNav from '@/components/AppNav';

interface AttemptDetail { id: string; score: number; marks_scored: number; total_marks: number; question_set_id: string; }
interface AnswerRow { id: string; question_id: string; selected_option: string | null; is_correct: boolean | null; self_rating: string | null; written_response: string | null; }
interface QuestionRow { id: string; prompt: string; options: { key: string; text: string }[] | null; correct_option: string | null; explanation: string | null; model_answer: string | null; }

function verdict(score: number) {
  if (score >= 80) return { label: 'CRACKED', tone: 'stamp-gold' };
  if (score >= 50) return { label: 'GETTING THERE', tone: 'stamp-gold' };
  return { label: 'KEEP GRINDING', tone: '' };
}

export default function ResultsPage({ params }: { params: Promise<{ attemptId: string }> }) {
  const { attemptId } = use(params);
  const { user } = useUser();
  const [attempt, setAttempt] = useState<AttemptDetail | null>(null);
  const [answers, setAnswers] = useState<AnswerRow[]>([]);
  const [questions, setQuestions] = useState<Record<string, QuestionRow>>({});
  const [examMode, setExamMode] = useState<'cbt' | 'written'>('cbt');
  const [materialId, setMaterialId] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: attemptData } = await supabase
        .from('attempts')
        .select('id, score, marks_scored, total_marks, question_set_id')
        .eq('id', attemptId)
        .single();

      if (!attemptData) return;

      const { data: setData } = await supabase
        .from('question_sets')
        .select('exam_mode, material_id')
        .eq('id', attemptData.question_set_id)
        .single();

      const { data: answerData } = await supabase
        .from('answers')
        .select('id, question_id, selected_option, is_correct, self_rating, written_response')
        .eq('attempt_id', attemptId);

      const { data: questionData } = await supabase
        .from('questions')
        .select('id, prompt, options, correct_option, explanation, model_answer')
        .eq('question_set_id', attemptData.question_set_id);

      const qMap: Record<string, QuestionRow> = {};
      (questionData || []).forEach((q) => (qMap[q.id] = q));

      setAttempt(attemptData);
      setAnswers(answerData || []);
      setQuestions(qMap);
      setExamMode((setData?.exam_mode as any) || 'cbt');
      setMaterialId(setData?.material_id || null);
    })();
  }, [user, attemptId]);

  if (!attempt) {
    return (
      <main className="min-h-screen bg-ink text-paper flex items-center justify-center">
        <p className="text-slate">Loading your results…</p>
      </main>
    );
  }

  const v = verdict(attempt.score);

  return (
    <main className="min-h-screen bg-ink text-paper">
      <AppNav />
      <div className="px-4 sm:px-6 md:px-12 py-8 sm:py-12 max-w-3xl mx-auto text-center">
        <div className="flex justify-center mb-8">
          <div className={`grade-stamp ${v.tone} w-36 h-36 sm:w-48 sm:h-48 flex-col p-3 sm:p-4`}>
            <span className="text-2xl sm:text-3xl">{attempt.score}%</span>
            <span className="text-[9px] sm:text-[10px] mt-2 tracking-widest">{v.label}</span>
          </div>
        </div>
        <p className="text-slate mb-10">You scored {attempt.marks_scored} / {attempt.total_marks} marks</p>

        <div className="text-left space-y-4">
          {answers.map((a, i) => {
            const q = questions[a.question_id];
            if (!q) return null;
            return (
              <div key={a.id} className={`border rounded-xl p-5 ${examMode === 'cbt' ? (a.is_correct ? 'border-gold/30 bg-gold/5' : 'border-stamp/40 bg-stamp/5') : 'border-white/10'}`}>
                <p className="text-sm text-slate mb-2">Question {i + 1}</p>
                <p className="mb-3 leading-relaxed">{q.prompt}</p>
                {examMode === 'cbt' ? (
                  <>
                    <p className="text-sm mb-1">
                      Your answer: <span className={a.is_correct ? 'text-gold' : 'text-stamp'}>{a.selected_option ? q.options?.find((o) => o.key === a.selected_option)?.text : 'Not answered'}</span>
                    </p>
                    {!a.is_correct && (<p className="text-sm mb-2">Correct answer: <span className="text-gold">{q.options?.find((o) => o.key === q.correct_option)?.text}</span></p>)}
                    {q.explanation && <p className="text-slate text-sm">{q.explanation}</p>}
                  </>
                ) : (
                  <>
                    <p className="text-sm text-slate mb-1">Your response:</p>
                    <p className="text-sm mb-3 whitespace-pre-wrap">{a.written_response || '(no response)'}</p>
                    <p className="text-sm">Self-rating: <span className="text-gold capitalize">{a.self_rating?.replace('_', ' ')}</span></p>
                  </>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-10 flex justify-center gap-4">
          <Link href="/dashboard" className="border border-white/10 px-6 py-3 rounded-full hover:border-gold/40 transition">
            Back to dashboard
          </Link>
          {materialId && (
            <Link href={`/generate?materialId=${materialId}`} className="bg-gold text-ink font-semibold px-6 py-3 rounded-full hover:brightness-110 transition">
              Generate a fresh set
            </Link>
          )}
        </div>
      </div>
    </main>
  );
}
