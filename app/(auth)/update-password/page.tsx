'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';

export default function UpdatePasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);

    if (error) {
      setError(error.message);
      return;
    }

    router.push('/dashboard');
  }

  return (
    <main className="min-h-screen bg-ink text-paper flex items-center justify-center px-4 sm:px-6">
      <div className="w-full max-w-sm">
        <Link href="/" className="font-display text-lg block text-center mb-8">
          CAMPUSCRACK
        </Link>
        <h1 className="text-2xl font-semibold mb-1">Choose a new password</h1>
        <p className="text-slate mb-8 text-sm">Use at least 6 characters and keep it somewhere safe.</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm text-slate mb-1">New password</label>
            <input
              required
              minLength={6}
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-inkLight border border-white/10 rounded-lg px-4 py-3 focus:border-gold outline-none"
            />
          </div>
          <div>
            <label className="block text-sm text-slate mb-1">Confirm new password</label>
            <input
              required
              minLength={6}
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full bg-inkLight border border-white/10 rounded-lg px-4 py-3 focus:border-gold outline-none"
            />
          </div>

          {error && <p className="text-stamp text-sm">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gold text-ink font-semibold py-3 rounded-full hover:brightness-110 transition disabled:opacity-60"
          >
            {loading ? 'Saving password...' : 'Save new password'}
          </button>
        </form>
      </div>
    </main>
  );
}
