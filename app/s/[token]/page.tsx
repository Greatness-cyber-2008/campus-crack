'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import { useOptionalUser, getAuthHeader } from '@/lib/useUser';

interface Option {
  key: string;
  text: string;
}
interface Question {
  id: string;
  order_index: number;
  prompt: string;
  options: Option[];
}
interface Result {
  selected: string;
  correct: string;
  isCorrect: boolean;
  explanation: string | null;
}
interface SharedState {
  set: { title: string; courseCode: string | null; total: number; freeCount: number };
  viewer: { loggedIn: boolean; isPremium: boolean; unlocked: boolean };
  lockedCount: number;
  questions: Question[];
  answered: Record<string, Result>;
}

// Anonymous viewers are tracked by a random id kept in this browser, so they can
// leave and come back (or sign up and come back) without losing their answers.
let memoryAnonId: string | null = null;
function getAnonId(): string {
  try {
    let id = localStorage.getItem('cc_anon_id');
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem('cc_anon_id', id);
    }
    return id;
  } catch {
    if (!memoryAnonId) memoryAnonId = crypto.randomUUID();
    return memoryAnonId;
  }
}

export default function SharedSetPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const { user, loading: authLoading } = useOptionalUser();

  const [state, setState] = useState<SharedState | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [results, setResults] = useState<Record<string, Result>>({});
  const [idx, setIdx] = useState(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nextParam = `?next=${encodeURIComponent(`/s/${token}`)}`;

  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;
    (async () => {
      const authHeader = await getAuthHeader();
      const res = await fetch(`/api/share/${token}?anonId=${encodeURIComponent(getAnonId())}`, {
        headers: authHeader,
      });
      if (cancelled) return;
      if (res.status === 404) {
        setNotFound(true);
        return;
      }
      if (!res.ok) {
        setError('Could not load this practice set. Check your connection and refresh.');
        return;
      }
      const data: SharedState = await res.json();
      setState(data);
      setResults(data.answered);
      // Resume at the first question they haven't answered yet.
      const firstOpen = data.questions.findIndex((q) => !data.answered[q.id]);
      setIdx(firstOpen === -1 ? data.questions.length : firstOpen);
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, user?.id, token]);

  async function choose(q: Question, key: string) {
    if (pending || results[q.id]) return;
    setPending(true);
    setError(null);
    try {
      const authHeader = await getAuthHeader();
      const res = await fetch(`/api/share/${token}/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader },
        body: JSON.stringify({ anonId: getAnonId(), questionId: q.id, selected: key }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(res.status === 402 ? 'This part of the set is locked.' : data.error || 'Could not save that answer.');
        return;
      }
      setResults((prev) => ({
        ...prev,
        [q.id]: { selected: data.selected, correct: data.correct, isCorrect: data.isCorrect, explanation: data.explanation },
      }));
    } catch {
      setError('Network problem — try that again.');
    } finally {
      setPending(false);
    }
  }

  if (notFound) {
    return (
      <main className="min-h-screen bg-ink text-paper flex items-center justify-center px-6 text-center">
        <div>
          <p className="font-display text-lg mb-3">CAMPUSCRACK</p>
          <p className="text-slate mb-6">This practice link isn&apos;t available any more.</p>
          <Link href="/signup" className="bg-gold text-ink font-semibold px-6 py-3 rounded-full">
            Start free
          </Link>
        </div>
      </main>
    );
  }

  if (!state) {
    return (
      <main className="min-h-screen bg-ink text-paper flex items-center justify-center px-6 text-center">
        <p className={error ? 'text-stamp' : 'text-slate'}>{error || 'Loading practice set…'}</p>
      </main>
    );
  }

  const { set, viewer, lockedCount, questions } = state;
  const total = set.total;
  const finished = idx >= questions.length;
  const q = questions[idx];
  const result = q ? results[q.id] : undefined;
  const correctCount = questions.filter((x) => results[x.id]?.isCorrect).length;
  const isLocked = lockedCount > 0;

  return (
    <main className="min-h-screen bg-ink text-paper flex flex-col">
      <header className="flex items-center justify-between gap-3 px-4 sm:px-6 md:px-12 py-4 sm:py-5 border-b border-white/10">
        <div className="min-w-0">
          <Link href="/" className="font-display text-xs text-slate tracking-tight">
            CAMPUSCRACK
          </Link>
          <p className="font-semibold text-sm sm:text-base truncate">{set.title}</p>
        </div>
        <div className="text-right shrink-0">
          {!finished && (
            <p className="text-slate text-xs whitespace-nowrap">
              Q{idx + 1}/{total}
            </p>
          )}
          {isLocked && (
            <p className="text-gold text-[11px] whitespace-nowrap">
              Free preview · {questions.length} of {total}
            </p>
          )}
        </div>
      </header>

      {!finished && q ? (
        <>
          <div className="flex-1 px-4 sm:px-6 md:px-12 py-6 sm:py-10 max-w-3xl mx-auto w-full">
            <p className="text-base sm:text-lg mb-6 sm:mb-8 leading-relaxed whitespace-pre-wrap">{q.prompt}</p>
            <div className="space-y-3">
              {q.options?.map((opt) => {
                const isChosen = result?.selected === opt.key;
                const isCorrectOpt = result?.correct === opt.key;
                let style = 'border-white/10 active:border-white/30';
                if (result) {
                  if (isCorrectOpt) style = 'border-gold bg-gold/10';
                  else if (isChosen) style = 'border-stamp bg-stamp/10';
                  else style = 'border-white/10 opacity-60';
                }
                return (
                  <button
                    key={opt.key}
                    onClick={() => choose(q, opt.key)}
                    disabled={pending || !!result}
                    className={`w-full text-left border rounded-xl px-4 sm:px-5 py-4 min-h-[52px] transition ${style}`}
                  >
                    <span className="font-mono text-gold mr-3">{opt.key}</span>
                    {opt.text}
                    {result && isCorrectOpt && <span className="float-right text-gold">✓</span>}
                    {result && isChosen && !isCorrectOpt && <span className="float-right text-stamp">✗</span>}
                  </button>
                );
              })}
            </div>

            {error && <p className="text-stamp text-sm mt-4">{error}</p>}

            {result && (
              <div className="mt-6 border border-white/10 rounded-xl px-4 py-4 bg-inkLight">
                <p className={`text-sm font-semibold mb-1 ${result.isCorrect ? 'text-gold' : 'text-stamp'}`}>
                  {result.isCorrect ? 'Correct' : `Not quite — the answer is ${result.correct}`}
                </p>
                {result.explanation && <p className="text-slate text-sm leading-relaxed">{result.explanation}</p>}
              </div>
            )}
          </div>

          <footer className="flex items-center justify-between gap-3 px-4 sm:px-6 md:px-12 py-4 sm:py-5 border-t border-white/10">
            <button
              disabled={idx === 0}
              onClick={() => setIdx((i) => i - 1)}
              className="text-slate disabled:opacity-30 py-3 px-2 -mx-2"
            >
              ← Previous
            </button>
            {result && (
              <button
                onClick={() => setIdx((i) => i + 1)}
                className="bg-gold text-ink font-semibold px-5 sm:px-6 py-3 rounded-full hover:brightness-110 transition"
              >
                {idx === questions.length - 1 ? 'See my score →' : 'Next →'}
              </button>
            )}
          </footer>
        </>
      ) : (
        <div className="flex-1 px-4 sm:px-6 md:px-12 py-10 sm:py-14 max-w-xl mx-auto w-full text-center">
          <p className="text-slate text-sm mb-2">{isLocked ? 'Free preview done' : 'Set complete'}</p>
          <p className="font-display text-5xl text-gold mb-2">
            {correctCount}/{questions.length}
          </p>
          <p className="text-slate mb-8">
            {correctCount === questions.length
              ? 'Perfect run.'
              : correctCount >= questions.length / 2
              ? 'Solid. A bit more practice and you have it.'
              : 'Good start — this is exactly what practice is for.'}
          </p>

          {isLocked ? (
            <div className="border border-gold/40 bg-gold/5 rounded-2xl p-6 text-left">
              <p className="font-semibold mb-1">
                {lockedCount} more question{lockedCount === 1 ? '' : 's'} waiting
              </p>
              <p className="text-slate text-sm mb-5">
                Unlock the rest of this set, plus unlimited practice sets, written mode, flashcards and your own AI tutor
                — ₦3,500 per semester, no auto-charge.
              </p>
              {viewer.loggedIn ? (
                <Link
                  href={`/pricing?reason=shared_set&next=${encodeURIComponent(`/s/${token}`)}`}
                  className="block text-center bg-gold text-ink font-semibold py-3 rounded-full hover:brightness-110 transition"
                >
                  Unlock full access — ₦3,500
                </Link>
              ) : (
                <>
                  <Link
                    href={`/signup${nextParam}`}
                    className="block text-center bg-gold text-ink font-semibold py-3 rounded-full hover:brightness-110 transition"
                  >
                    Create a free account to continue
                  </Link>
                  <p className="text-slate text-xs text-center mt-3">
                    Already have one?{' '}
                    <Link href={`/login${nextParam}`} className="text-gold">
                      Log in
                    </Link>
                    . Your answers so far are saved.
                  </p>
                </>
              )}
            </div>
          ) : (
            <Link
              href={viewer.loggedIn ? '/upload' : '/signup'}
              className="inline-block bg-gold text-ink font-semibold px-6 py-3 rounded-full hover:brightness-110 transition"
            >
              {viewer.loggedIn ? 'Make a set from your own notes' : 'Make your own sets from your notes — free'}
            </Link>
          )}

          <div className="mt-8">
            <button onClick={() => setIdx(0)} className="text-slate text-sm underline">
              Review my answers
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
