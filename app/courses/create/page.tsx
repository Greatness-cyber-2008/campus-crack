'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@/lib/useUser';
import { supabase } from '@/lib/supabaseClient';
import AppNav from '@/components/AppNav';

const DISCIPLINES = ['computing', 'medical', 'commercial', 'science', 'arts', 'law', 'engineering', 'general'];

export default function CreateCoursePage() {
  const { user } = useUser();
  const router = useRouter();

  const [title, setTitle] = useState('');
  const [courseCode, setCourseCode] = useState('');
  const [discipline, setDiscipline] = useState('general');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setLoading(true);
    setError(null);

    const { data, error } = await supabase
      .from('courses')
      .insert({ user_id: user.id, title, course_code: courseCode || null, discipline })
      .select()
      .single();

    setLoading(false);
    if (error || !data) {
      setError(error?.message || 'Could not create course');
      return;
    }

    router.push(`/courses/${data.id}`);
  }

  return (
    <main className="min-h-screen bg-ink text-paper">
      <AppNav />

      <div className="px-4 sm:px-6 md:px-12 py-6 sm:py-10 max-w-xl mx-auto">
        <h1 className="text-2xl font-semibold mb-1">Create a course</h1>
        <p className="text-slate mb-8 text-sm">
          You'll be able to upload multiple files into this course and build one study plan from all of them.
        </p>

        <form onSubmit={handleCreate} className="space-y-4">
          <div>
            <label className="block text-sm text-slate mb-1">Course name</label>
            <input
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Network Security"
              className="w-full bg-inkLight border border-white/10 rounded-lg px-4 py-3 focus:border-gold outline-none"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-slate mb-1">Course code</label>
              <input
                value={courseCode}
                onChange={(e) => setCourseCode(e.target.value)}
                placeholder="CYB 201"
                className="w-full bg-inkLight border border-white/10 rounded-lg px-4 py-3 focus:border-gold outline-none"
              />
            </div>
            <div>
              <label className="block text-sm text-slate mb-1">Discipline</label>
              <select
                value={discipline}
                onChange={(e) => setDiscipline(e.target.value)}
                className="w-full bg-inkLight border border-white/10 rounded-lg px-4 py-3 focus:border-gold outline-none capitalize"
              >
                {DISCIPLINES.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {error && <p className="text-stamp text-sm">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gold text-ink font-semibold py-3 rounded-full hover:brightness-110 transition disabled:opacity-60"
          >
            {loading ? 'Creating…' : 'Create course'}
          </button>
        </form>
      </div>
    </main>
  );
}
