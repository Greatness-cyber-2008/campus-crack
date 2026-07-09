'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useUser, getAuthHeader } from '@/lib/useUser';
import AppNav from '@/components/AppNav';

export default function FlashcardGeneratePage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-ink text-paper flex items-center justify-center">
          <p className="text-slate">Loading…</p>
        </main>
      }
    >
      <FlashcardGenerateForm />
    </Suspense>
  );
}

function FlashcardGenerateForm() {
  useUser();
  const router = useRouter();
  const params = useSearchParams();
  const materialId = params.get('materialId');

  const [title, setTitle] = useState('');
  const [cardCount, setCardCount] = useState(20);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    if (!materialId) return;
    setLoading(true);
    setError(null);

    const authHeader = await getAuthHeader();
    const res = await fetch('/api/generate-flashcards', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeader },
      body: JSON.stringify({ materialId, cardCount, title }),
    });

    const data = await res.json();
    setLoading(false);

    if (res.status === 402) {
      router.push('/pricing?reason=limit_reached');
      return;
    }
    if (!res.ok) {
      setError(data.error || 'Something went wrong generating your flashcards.');
      return;
    }

    router.push(`/flashcards/${data.flashcardSetId}`);
  }

  return (
    <main className="min-h-screen bg-ink text-paper">
      <AppNav />

      <div className="px-4 sm:px-6 md:px-12 py-6 sm:py-10 max-w-xl mx-auto">
        <h1 className="text-2xl font-semibold mb-1">Generate flashcards</h1>
        <p className="text-slate mb-8 text-sm">
          Short cards for daily review — great for the whole semester, not just exam week.
        </p>

        <div className="space-y-6">
          <div>
            <label className="block text-sm text-slate mb-1">Set title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. CYB 201 Key Terms"
              className="w-full bg-inkLight border border-white/10 rounded-lg px-4 py-3 focus:border-gold outline-none"
            />
          </div>

          <div>
            <label className="block text-sm text-slate mb-1">Number of cards</label>
            <input
              type="number"
              min={5}
              max={60}
              value={cardCount}
              onChange={(e) => setCardCount(parseInt(e.target.value, 10))}
              className="w-full bg-inkLight border border-white/10 rounded-lg px-4 py-3 focus:border-gold outline-none"
            />
          </div>

          {error && <p className="text-stamp text-sm">{error}</p>}

          <button
            onClick={handleGenerate}
            disabled={loading || !materialId}
            className="w-full bg-gold text-ink font-semibold py-3 rounded-full hover:brightness-110 transition disabled:opacity-60"
          >
            {loading ? 'Generating your flashcards…' : 'Generate flashcards'}
          </button>
          {!materialId && (
            <p className="text-stamp text-sm text-center">No material selected — go back and upload one first.</p>
          )}
        </div>
      </div>
    </main>
  );
}
