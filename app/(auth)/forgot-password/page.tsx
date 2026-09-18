'use client';

import { useState } from 'react';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/update-password`,
    });

    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }

    setSent(true);
  }

  return (
    <main className="min-h-screen bg-ink text-paper flex items-center justify-center px-4 sm:px-6">
      <div className="w-full max-w-sm">
        <Link href="/" className="font-display text-lg block text-center mb-8">
          CAMPUSCRACK
        </Link>
        <h1 className="text-2xl font-semibold mb-1">Reset your password</h1>
        <p className="text-slate mb-8 text-sm">
          Enter your email and we&apos;ll send you a link to choose a new password.
        </p>

        {sent ? (
          <div className="border border-gold/30 bg-gold/5 rounded-xl px-4 py-3 text-sm text-gold">
            If an account exists for that email, a password-reset link has been sent. Please check your inbox and spam folder.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm text-slate mb-1">Email</label>
              <input
                required
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-inkLight border border-white/10 rounded-lg px-4 py-3 focus:border-gold outline-none"
                placeholder="you@school.edu.ng"
              />
            </div>

            {error && <p className="text-stamp text-sm">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gold text-ink font-semibold py-3 rounded-full hover:brightness-110 transition disabled:opacity-60"
            >
              {loading ? 'Sending link...' : 'Send reset link'}
            </button>
          </form>
        )}

        <p className="text-slate text-sm text-center mt-6">
          Remembered your password?{' '}
          <Link href="/login" className="text-gold">
            Back to log in
          </Link>
        </p>
      </div>
    </main>
  );
}
