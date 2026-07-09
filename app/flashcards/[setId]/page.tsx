'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useUser } from '@/lib/useUser';
import { supabase } from '@/lib/supabaseClient';
import AppNav from '@/components/AppNav';

interface Flashcard {
  id: string;
  front: string;
  back: string;
  topic: string | null;
}
interface ProgressRow {
  flashcard_id: string;
  next_review_date: string;
  interval_days: number;
  review_count?: number;
}
interface FlashcardSetInfo {
  id: string;
  title: string;
}

type Rating = 'again' | 'hard' | 'good' | 'easy';

function nextInterval(currentInterval: number, rating: Rating): number {
  switch (rating) {
    case 'again':
      return 1;
    case 'hard':
      return Math.max(1, Math.round(currentInterval * 1.2));
    case 'good':
      return Math.max(1, Math.round(currentInterval * 2));
    case 'easy':
      return Math.max(1, Math.round(currentInterval * 2.5));
  }
}

export default function FlashcardReviewPage({ params }: { params: { setId: string } }) {
  const { user } = useUser();

  const [set, setSet] = useState<FlashcardSetInfo | null>(null);
  const [dueCards, setDueCards] = useState<Flashcard[]>([]);
  const [progressMap, setProgressMap] = useState<Record<string, ProgressRow>>({});
  const [current, setCurrent] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [reviewedCount, setReviewedCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: setData } = await supabase
        .from('flashcard_sets')
        .select('id, title')
        .eq('id', params.setId)
        .single();

      const { data: cardsData } = await supabase
        .from('flashcards')
        .select('id, front, back, topic')
        .eq('flashcard_set_id', params.setId)
        .order('order_index');

      const { data: progressData } = await supabase
        .from('flashcard_progress')
        .select('flashcard_id, next_review_date, interval_days, review_count')
        .eq('user_id', user.id)
        .in('flashcard_id', (cardsData || []).map((c) => c.id));

      const pMap: Record<string, ProgressRow> = {};
      (progressData || []).forEach((p) => (pMap[p.flashcard_id] = p as ProgressRow));

      const today = new Date().toISOString().slice(0, 10);
      const due = (cardsData || []).filter((c) => {
        const progress = pMap[c.id];
        return !progress || progress.next_review_date <= today;
      });

      setSet(setData);
      setDueCards(due);
      setProgressMap(pMap);
      setLoading(false);
    })();
  }, [user, params.setId]);

  async function handleRate(rating: Rating) {
    if (!user) return;
    const card = dueCards[current];
    const existingProgress = progressMap[card.id];
    const currentInterval = existingProgress?.interval_days || 1;
    const newInterval = nextInterval(currentInterval, rating);

    const nextReviewDate = new Date();
    nextReviewDate.setDate(nextReviewDate.getDate() + newInterval);

    await supabase.from('flashcard_progress').upsert(
      {
        user_id: user.id,
        flashcard_id: card.id,
        next_review_date: nextReviewDate.toISOString().slice(0, 10),
        interval_days: newInterval,
        last_rating: rating,
        last_reviewed_at: new Date().toISOString(),
        review_count: (existingProgress?.review_count || 0) + 1,
      },
      { onConflict: 'user_id,flashcard_id' }
    );

    setReviewedCount((c) => c + 1);
    setRevealed(false);
    setCurrent((c) => c + 1);
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-ink text-paper flex items-center justify-center">
        <p className="text-slate">Loading flashcards…</p>
      </main>
    );
  }

  const isDone = current >= dueCards.length;

  return (
    <main className="min-h-screen bg-ink text-paper flex flex-col">
      <AppNav />

      <header className="px-4 sm:px-6 md:px-12 py-3 sm:py-4 border-b border-white/10">
        <p className="font-semibold text-sm sm:text-base truncate">🗂️ {set?.title}</p>
        {!isDone && dueCards.length > 0 && (
          <p className="text-slate text-xs">
            Card {current + 1} of {dueCards.length} due today
          </p>
        )}
      </header>

      <div className="flex-1 flex items-center justify-center px-4 sm:px-6 py-10">
        {dueCards.length === 0 ? (
          <div className="text-center">
            <p className="text-lg mb-2">🎉 Nothing due right now</p>
            <p className="text-slate text-sm mb-6">All caught up on this set — come back tomorrow.</p>
            <Link href="/flashcards" className="text-gold text-sm">
              ← Back to my flashcard sets
            </Link>
          </div>
        ) : isDone ? (
          <div className="text-center">
            <p className="text-lg mb-2">✅ Done for now</p>
            <p className="text-slate text-sm mb-6">
              Reviewed {reviewedCount} card{reviewedCount === 1 ? '' : 's'}. Come back tomorrow for more.
            </p>
            <Link href="/flashcards" className="text-gold text-sm">
              ← Back to my flashcard sets
            </Link>
          </div>
        ) : (
          <div className="w-full max-w-md">
            <button
              onClick={() => setRevealed((v) => !v)}
              className="w-full min-h-[220px] border border-white/10 rounded-2xl p-6 sm:p-8 flex items-center justify-center text-center hover:border-gold/40 transition"
            >
              <p className="text-lg leading-relaxed">{revealed ? dueCards[current].back : dueCards[current].front}</p>
            </button>

            {!revealed ? (
              <button
                onClick={() => setRevealed(true)}
                className="w-full mt-4 bg-inkLight border border-white/10 py-3 rounded-full hover:border-gold/40 transition"
              >
                Show answer
              </button>
            ) : (
              <div className="grid grid-cols-4 gap-2 mt-4">
                <button
                  onClick={() => handleRate('again')}
                  className="py-3 rounded-full text-sm font-semibold bg-stamp/20 border border-stamp/40 text-stamp"
                >
                  Again
                </button>
                <button
                  onClick={() => handleRate('hard')}
                  className="py-3 rounded-full text-sm font-semibold bg-inkLight border border-white/10"
                >
                  Hard
                </button>
                <button
                  onClick={() => handleRate('good')}
                  className="py-3 rounded-full text-sm font-semibold bg-inkLight border border-white/10"
                >
                  Good
                </button>
                <button
                  onClick={() => handleRate('easy')}
                  className="py-3 rounded-full text-sm font-semibold bg-gold/20 border border-gold/40 text-gold"
                >
                  Easy
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
