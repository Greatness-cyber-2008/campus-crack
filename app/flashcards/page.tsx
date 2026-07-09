'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useUser } from '@/lib/useUser';
import { supabase } from '@/lib/supabaseClient';
import AppNav from '@/components/AppNav';

interface FlashcardSet {
  id: string;
  title: string;
  discipline: string | null;
  card_count: number;
  created_at: string;
}

export default function FlashcardsListPage() {
  const { user } = useUser();
  const [sets, setSets] = useState<FlashcardSet[]>([]);
  const [dueCounts, setDueCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: setsData } = await supabase
        .from('flashcard_sets')
        .select('id, title, discipline, card_count, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      const setRows = setsData || [];

      // For each set, count cards due today (never reviewed, or next_review_date <= today)
      const today = new Date().toISOString().slice(0, 10);
      const counts: Record<string, number> = {};

      await Promise.all(
        setRows.map(async (s) => {
          const { data: cards } = await supabase.from('flashcards').select('id').eq('flashcard_set_id', s.id);
          const cardIds = (cards || []).map((c) => c.id);
          if (cardIds.length === 0) {
            counts[s.id] = 0;
            return;
          }
          const { data: progress } = await supabase
            .from('flashcard_progress')
            .select('flashcard_id, next_review_date')
            .eq('user_id', user.id)
            .in('flashcard_id', cardIds);

          const reviewedIds = new Set((progress || []).map((p) => p.flashcard_id));
          const dueFromProgress = (progress || []).filter((p) => p.next_review_date <= today).length;
          const neverReviewed = cardIds.filter((id) => !reviewedIds.has(id)).length;
          counts[s.id] = dueFromProgress + neverReviewed;
        })
      );

      setSets(setRows);
      setDueCounts(counts);
      setLoading(false);
    })();
  }, [user]);

  return (
    <main className="min-h-screen bg-ink text-paper">
      <AppNav />

      <div className="px-4 sm:px-6 md:px-12 py-6 sm:py-10 max-w-4xl mx-auto">
        <h1 className="text-2xl font-semibold mb-1">My flashcards</h1>
        <p className="text-slate mb-8 text-sm">A few minutes a day beats one big session before the exam.</p>

        {loading ? (
          <p className="text-slate">Loading…</p>
        ) : sets.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-slate mb-6">You haven&apos;t generated any flashcard sets yet.</p>
            <Link
              href="/upload"
              className="bg-gold text-ink font-semibold px-6 py-3 rounded-full hover:brightness-110 transition"
            >
              Upload material to get started
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {sets.map((s) => (
              <Link
                key={s.id}
                href={`/flashcards/${s.id}`}
                className="flex items-center justify-between gap-3 border border-white/10 rounded-xl px-4 sm:px-5 py-4 hover:border-gold/40 transition"
              >
                <div className="min-w-0">
                  <p className="font-medium truncate">{s.title}</p>
                  <p className="text-slate text-xs sm:text-sm capitalize truncate">
                    {s.discipline} · {s.card_count} cards
                  </p>
                </div>
                {(dueCounts[s.id] || 0) > 0 ? (
                  <span className="shrink-0 bg-gold text-ink text-xs font-semibold px-3 py-1.5 rounded-full">
                    {dueCounts[s.id]} due
                  </span>
                ) : (
                  <span className="shrink-0 text-slate text-xs">Up to date ✓</span>
                )}
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
