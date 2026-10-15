'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';
import { getSafeNext } from '@/lib/safeNext';

export default function SignupPage() {
  const router = useRouter();
  // Carries a ?next= (e.g. a shared practice link) through to the login link and the post-signup redirect.
  const [nextQs, setNextQs] = useState('');
  useEffect(() => {
    const n = getSafeNext();
    if (n) setNextQs(`?next=${encodeURIComponent(n)}`);
  }, []);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });

    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.push(getSafeNext() || '/dashboard');
  }

  return (
    <main className="min-h-screen bg-ink text-paper flex items-center justify-center px-4 sm:px-6">
      <div className="w-full max-w-sm">
        <Link href="/" className="font-display text-lg block text-center mb-8">
          CAMPUSCRACK
        </Link>
        <h1 className="text-2xl font-semibold mb-1">Create your account</h1>
        <p className="text-slate mb-8 text-sm">Start with 3 free question sets, no card needed.</p>

        <form onSubmit={handleSignup} className="space-y-4" autoComplete="off">
          <div>
            <label className="block text-sm text-slate mb-1">Full name</label>
            <input
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full bg-inkLight border border-white/10 rounded-lg px-4 py-3 focus:border-gold outline-none"
              placeholder="Adebayo Gboyega"
              autoComplete="off"
            />
          </div>
          <div>
            <label className="block text-sm text-slate mb-1">Email</label>
            <input
              required
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-inkLight border border-white/10 rounded-lg px-4 py-3 focus:border-gold outline-none"
              placeholder="you@school.edu.ng"
              autoComplete="off"
            />
          </div>
          <div>
            <label className="block text-sm text-slate mb-1">Password</label>
            <input
              required
              minLength={6}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-inkLight border border-white/10 rounded-lg px-4 py-3 focus:border-gold outline-none"
              placeholder="At least 6 characters"
              autoComplete="new-password"
            />
          </div>

          {error && <p className="text-stamp text-sm">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gold text-ink font-semibold py-3 rounded-full hover:brightness-110 transition disabled:opacity-60"
          >
            {loading ? 'Creating account…' : 'Create account'}
          </button>
        </form>

        <p className="text-slate text-sm text-center mt-6">
          Already have an account?{' '}
          <Link href={`/login${nextQs}`} className="text-gold">
            Log in
          </Link>
        </p>
      </div>
    </main>
  );
}
