'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { supabase } from '@/lib/supabaseClient';

const MAX_DEVICES = 2;

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [deviceNotice, setDeviceNotice] = useState<string | null>(null);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDeviceNotice(null);
    setLoading(true);

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setLoading(false);
      setError(error.message);
      return;
    }

    // Enforce the device limit right after a fresh login — if this device is the
    // 3rd+ one, the oldest existing session gets logged out (not instantly, but
    // it won't be able to refresh its token again). See migration_011 for details.
    const { data: revokedCount } = await supabase.rpc('enforce_device_limit', { max_devices: MAX_DEVICES });
    if (revokedCount && revokedCount > 0) {
      setDeviceNotice(
        `You're now logged in on this device. Since accounts are limited to ${MAX_DEVICES} devices, your oldest session was signed out.`
      );
      // Give the student a moment to actually read this before moving on
      setTimeout(() => router.push('/dashboard'), 2500);
      return;
    }

    setLoading(false);
    router.push('/dashboard');
  }

  return (
    <main className="min-h-screen bg-ink text-paper flex items-center justify-center px-4 sm:px-6">
      <div className="w-full max-w-sm">
        <Link href="/" className="font-display text-lg block text-center mb-8">
          CAMPUSCRACK
        </Link>
        <h1 className="text-2xl font-semibold mb-8">Welcome back</h1>

        {deviceNotice ? (
          <div className="border border-gold/30 bg-gold/5 rounded-xl px-4 py-3 text-sm text-gold">
            {deviceNotice}
          </div>
        ) : (
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm text-slate mb-1">Email</label>
              <input
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-inkLight border border-white/10 rounded-lg px-4 py-3 focus:border-gold outline-none"
              />
            </div>
            <div>
              <label className="block text-sm text-slate mb-1">Password</label>
              <input
                required
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-inkLight border border-white/10 rounded-lg px-4 py-3 focus:border-gold outline-none"
              />
            </div>

            {error && <p className="text-stamp text-sm">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-gold text-ink font-semibold py-3 rounded-full hover:brightness-110 transition disabled:opacity-60"
            >
              {loading ? 'Logging in…' : 'Log in'}
            </button>
          </form>
        )}

        <p className="text-slate text-sm text-center mt-6">
          Don&apos;t have an account?{' '}
          <Link href="/signup" className="text-gold">
            Sign up free
          </Link>
        </p>
      </div>
    </main>
  );
}
