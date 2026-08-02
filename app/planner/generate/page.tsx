'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useUser, getAuthHeader } from '@/lib/useUser';
import AppNav from '@/components/AppNav';

export default function PlannerGeneratePage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-ink text-paper flex items-center justify-center">
          <p className="text-slate">Loading…</p>
        </main>
      }
    >
      <PlannerGenerateForm />
    </Suspense>
  );
}

function PlannerGenerateForm() {
  useUser();
  const router = useRouter();
  const params = useSearchParams();
  const materialId = params.get('materialId');
  const courseId = params.get('courseId');

  const [title, setTitle] = useState('');
  const [totalWeeks, setTotalWeeks] = useState(12);
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    if (!materialId && !courseId) return;
    setLoading(true);
    setError(null);

    const authHeader = await getAuthHeader();
    const res = await fetch('/api/generate-study-plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader },
      body: JSON.stringify({ materialId, courseId, totalWeeks, startDate, title }),
    });

    const data = await res.json();
    setLoading(false);

    if (res.status === 402) {
      const reason = data.error === 'paywall' && data.message?.includes('study plan') ? 'plan_limit_reached' : 'limit_reached';
      router.push(`/pricing?reason=${reason}`);
      return;
    }
    if (!res.ok) {
      setError(data.error || 'Something went wrong building your study plan.');
      return;
    }

    router.push(`/planner/${data.planId}`);
  }

  return (
    <main className="min-h-screen bg-ink text-paper">
      <AppNav />

      <div className="px-4 sm:px-6 md:px-12 py-6 sm:py-10 max-w-xl mx-auto">
        <h1 className="text-2xl font-semibold mb-1">Build a study plan</h1>
        <p className="text-slate mb-8 text-sm">
          {courseId
            ? 'This plan will be built from every file uploaded to this course, combined.'
            : 'Upload a course outline or syllabus and get a week-by-week breakdown for the whole semester.'}
        </p>

        <div className="space-y-6">
          <div>
            <label className="block text-sm text-slate mb-1">Plan title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. CYB 201 Semester Plan"
              className="w-full bg-inkLight border border-white/10 rounded-lg px-4 py-3 focus:border-gold outline-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-slate mb-1">Total weeks in semester</label>
              <input
                type="number"
                min={4}
                max={20}
                value={totalWeeks}
                onChange={(e) => setTotalWeeks(parseInt(e.target.value, 10))}
                className="w-full bg-inkLight border border-white/10 rounded-lg px-4 py-3 focus:border-gold outline-none"
              />
            </div>
            <div>
              <label className="block text-sm text-slate mb-1">Semester start date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full bg-inkLight border border-white/10 rounded-lg px-4 py-3 focus:border-gold outline-none"
              />
            </div>
          </div>

          {error && <p className="text-stamp text-sm">{error}</p>}

          <button
            onClick={handleGenerate}
            disabled={loading || (!materialId && !courseId)}
            className="w-full bg-gold text-ink font-semibold py-3 rounded-full hover:brightness-110 transition disabled:opacity-60"
          >
            {loading ? 'Building your study plan…' : 'Build study plan'}
          </button>
          {!materialId && !courseId && (
            <p className="text-stamp text-sm text-center">
              No material or course selected — go back and upload your course outline/syllabus first.
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
