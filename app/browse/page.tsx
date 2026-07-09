'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useUser } from '@/lib/useUser';
import { supabase } from '@/lib/supabaseClient';
import AppNav from '@/components/AppNav';

interface PublicSet {
  id: string;
  title: string;
  exam_mode: 'cbt' | 'written';
  discipline: string;
  course_code: string | null;
  author_university: string | null;
  question_count: number;
  clone_count: number;
  created_at: string;
}

export default function BrowsePage() {
  useUser(); // just enforces auth
  const [sets, setSets] = useState<PublicSet[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [disciplineFilter, setDisciplineFilter] = useState('all');

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('question_sets')
        .select('id, title, exam_mode, discipline, course_code, author_university, question_count, clone_count, created_at')
        .eq('is_public', true)
        .order('created_at', { ascending: false })
        .limit(100);
      setSets(data || []);
      setLoading(false);
    })();
  }, []);

  const filtered = sets.filter((s) => {
    const matchesSearch =
      !search ||
      s.title.toLowerCase().includes(search.toLowerCase()) ||
      (s.course_code || '').toLowerCase().includes(search.toLowerCase()) ||
      (s.author_university || '').toLowerCase().includes(search.toLowerCase());
    const matchesDiscipline = disciplineFilter === 'all' || s.discipline === disciplineFilter;
    return matchesSearch && matchesDiscipline;
  });

  return (
    <main className="min-h-screen bg-ink text-paper">
      <AppNav />

      <div className="px-4 sm:px-6 md:px-12 py-6 sm:py-10 max-w-4xl mx-auto">
        <h1 className="text-2xl font-semibold mb-1">Community sets</h1>
        <p className="text-slate mb-8 text-sm">
          Practice sets other students have shared from their courses. Practicing these is free — it
          doesn&apos;t use any of your generations.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 mb-8">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search course code, university, or title…"
            className="flex-1 bg-inkLight border border-white/10 rounded-lg px-4 py-3 focus:border-gold outline-none"
          />
          <select
            value={disciplineFilter}
            onChange={(e) => setDisciplineFilter(e.target.value)}
            className="bg-inkLight border border-white/10 rounded-lg px-4 py-3 focus:border-gold outline-none capitalize"
          >
            <option value="all">All disciplines</option>
            {['computing', 'medical', 'commercial', 'science', 'arts', 'law', 'engineering', 'general'].map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </div>

        {loading ? (
          <p className="text-slate">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="text-slate text-center py-16">No shared sets match yet — be the first to share one from your library.</p>
        ) : (
          <div className="space-y-3">
            {filtered.map((s) => (
              <Link
                key={s.id}
                href={s.exam_mode === 'cbt' ? `/practice/cbt/${s.id}` : `/practice/written/${s.id}`}
                className="flex items-center justify-between gap-3 border border-white/10 rounded-xl px-4 sm:px-5 py-4 hover:border-gold/40 transition"
              >
                <div className="min-w-0">
                  <p className="font-medium truncate">{s.title}</p>
                  <p className="text-slate text-xs sm:text-sm capitalize truncate">
                    {s.course_code ? `${s.course_code} · ` : ''}
                    {s.discipline} · {s.exam_mode.toUpperCase()} · {s.question_count} questions
                    {s.author_university ? ` · ${s.author_university}` : ''}
                  </p>
                </div>
                <span className="text-gold text-sm shrink-0">Practice →</span>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
