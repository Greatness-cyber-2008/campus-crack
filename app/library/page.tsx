'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useUser } from '@/lib/useUser';
import { supabase } from '@/lib/supabaseClient';
import AppNav from '@/components/AppNav';

interface QuestionSet {
  id: string;
  title: string;
  exam_mode: 'cbt' | 'written';
  discipline: string;
  question_count: number;
  created_at: string;
  is_public: boolean;
  material_id: string | null;
}

export default function LibraryPage() {
  const { user } = useUser();
  const [sets, setSets] = useState<QuestionSet[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from('question_sets')
        .select('id, title, exam_mode, discipline, question_count, created_at, is_public, material_id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      setSets(data || []);
      setLoading(false);
    })();
  }, [user]);

  async function toggleShare(setId: string, current: boolean) {
    setSets((prev) => prev.map((s) => (s.id === setId ? { ...s, is_public: !current } : s)));
    await supabase.from('question_sets').update({ is_public: !current }).eq('id', setId);
  }

  return (
    <main className="min-h-screen bg-ink text-paper">
      <AppNav active="My sets" />

      <div className="px-4 sm:px-6 md:px-12 py-6 sm:py-10 max-w-4xl mx-auto">
        <h1 className="text-2xl font-semibold mb-8">My question sets</h1>

        {loading ? (
          <p className="text-slate">Loading…</p>
        ) : sets.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-slate mb-6">You haven&apos;t generated any question sets yet.</p>
            <Link
              href="/upload"
              className="bg-gold text-ink font-semibold px-6 py-3 rounded-full hover:brightness-110 transition"
            >
              Upload your first material
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {sets.map((s) => (
              <div
                key={s.id}
                className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border border-white/10 rounded-xl px-4 sm:px-5 py-4 hover:border-gold/40 transition"
              >
                <Link
                  href={s.exam_mode === 'cbt' ? `/practice/cbt/${s.id}` : `/practice/written/${s.id}`}
                  className="min-w-0"
                >
                  <p className="font-medium truncate">{s.title}</p>
                  <p className="text-slate text-xs sm:text-sm capitalize truncate">
                    {s.discipline} · {s.exam_mode.toUpperCase()} · {s.question_count} questions ·{' '}
                    {new Date(s.created_at).toLocaleDateString()}
                  </p>
                </Link>
                <div className="flex items-center justify-between sm:justify-end gap-4 shrink-0">
                  <button
                    onClick={() => toggleShare(s.id, s.is_public)}
                    className={`text-xs px-3 py-2 sm:py-1.5 rounded-full border transition ${
                      s.is_public ? 'border-gold text-gold' : 'border-white/10 text-slate hover:border-white/30'
                    }`}
                  >
                    {s.is_public ? 'Shared ✓' : 'Share with course'}
                  </button>
                  {s.material_id && (
                    <Link href={`/chat/${s.material_id}`} className="text-slate hover:text-gold text-sm py-2 sm:py-0">
                      💬 Chat
                    </Link>
                  )}
                  <Link
                    href={s.exam_mode === 'cbt' ? `/practice/cbt/${s.id}` : `/practice/written/${s.id}`}
                    className="text-gold text-sm py-2 sm:py-0"
                  >
                    Practice →
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
