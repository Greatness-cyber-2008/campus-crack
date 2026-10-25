'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useUser, getAuthHeader } from '@/lib/useUser';
import AppNav from '@/components/AppNav';

interface Student { name: string; joined: string; status: 'signed_up' | 'paid_waiting' | 'payable' | 'paid_out' | 'cancelled'; payable_on: string | null; }
interface Stats {
  isRep: boolean; code?: string; name?: string; active?: boolean;
  signups?: number; paying?: number; owedNowNaira?: number; waitingNaira?: number; paidNaira?: number;
  students?: Student[];
}

const naira = (n: number) => `₦${n.toLocaleString('en-NG')}`;
const day = (iso: string) => new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' });

function statusText(s: Student) {
  switch (s.status) {
    case 'signed_up': return { label: 'Signed up', cls: 'text-slate' };
    case 'paid_waiting': return { label: `Paid. Payable ${s.payable_on ? day(s.payable_on) : 'soon'}`, cls: 'text-gold' };
    case 'payable': return { label: 'Paid. Payable this Sunday', cls: 'text-gold' };
    case 'paid_out': return { label: 'Paid out to you', cls: 'text-gold' };
    default: return { label: 'Cancelled', cls: 'text-stamp' };
  }
}

export default function RepPage() {
  const { user, loading } = useUser();
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const res = await fetch('/api/rep/stats', { headers: await getAuthHeader() });
        if (!res.ok) throw new Error();
        setStats(await res.json());
      } catch {
        setError('Could not load your numbers. Please refresh.');
      }
    })();
  }, [user]);

  if (loading || (!stats && !error)) {
    return <main className="min-h-screen bg-ink text-paper flex items-center justify-center"><p className="text-slate">Loading…</p></main>;
  }

  const link = stats?.code ? `https://campuscrack.com.ng/?ref=${stats.code}` : '';
  const shareText = `Stop reading blindly before exams. CampusCrack turns your lecture notes into real CBT and theory practice questions. Try it free: ${link}`;

  async function copy() {
    try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* ignore */ }
  }

  return (
    <main className="min-h-screen bg-ink text-paper">
      <AppNav />
      <div className="px-4 sm:px-6 md:px-12 py-8 sm:py-12 max-w-3xl mx-auto">
        {error && <p className="text-stamp">{error}</p>}

        {stats && !stats.isRep && (
          <div className="text-center py-16">
            <h1 className="font-display text-2xl mb-3">Campus rep dashboard</h1>
            <p className="text-slate mb-6">This account isn’t a campus rep yet. Message Gboy to join the programme.</p>
            <Link href="/dashboard" className="border border-white/10 px-6 py-3 rounded-full hover:border-gold/40 transition">Back to dashboard</Link>
          </div>
        )}

        {stats?.isRep && (
          <>
            <h1 className="font-display text-2xl sm:text-3xl mb-1">Hi {stats.name?.split(' ')[0]} 👋</h1>
            <p className="text-slate mb-8">You earn ₦500 for every student who signs up with your link and pays. Paid every Sunday, 7 days after the student pays.</p>

            {!stats.active && <p className="text-stamp mb-6 text-sm">Your link is paused, so new signups aren’t being counted. Message Gboy.</p>}

            <div className="border border-gold/30 bg-gold/5 rounded-xl p-5 mb-8">
              <p className="text-xs uppercase tracking-wide text-slate mb-2">Your link</p>
              <p className="font-mono text-sm break-all mb-4">{link}</p>
              <div className="flex flex-wrap gap-3">
                <button onClick={copy} className="bg-gold text-ink font-semibold px-5 py-2 rounded-full hover:brightness-110 transition">
                  {copied ? 'Copied ✓' : 'Copy link'}
                </button>
                <a href={`https://wa.me/?text=${encodeURIComponent(shareText)}`} target="_blank" rel="noopener noreferrer"
                   className="border border-gold/40 text-gold px-5 py-2 rounded-full hover:bg-gold/10 transition">
                  Share on WhatsApp
                </a>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-8">
              <Stat label="Signed up" value={String(stats.signups)} />
              <Stat label="Paid" value={String(stats.paying)} />
              <Stat label="Payable this Sunday" value={naira(stats.owedNowNaira || 0)} highlight />
              <Stat label="Waiting (7 days)" value={naira(stats.waitingNaira || 0)} />
              <Stat label="Already paid to you" value={naira(stats.paidNaira || 0)} />
            </div>

            <h2 className="font-display text-lg mb-3">Your students</h2>
            {stats.students && stats.students.length > 0 ? (
              <div className="space-y-2">
                {stats.students.map((s, i) => {
                  const t = statusText(s);
                  return (
                    <div key={i} className="flex items-center justify-between border border-white/10 rounded-lg px-4 py-3 text-sm">
                      <span>{s.name} <span className="text-slate">· {day(s.joined)}</span></span>
                      <span className={t.cls}>{t.label}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-slate text-sm">No signups yet. Share your link in your course groups to get your first one.</p>
            )}
          </>
        )}
      </div>
    </main>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`border rounded-xl p-4 ${highlight ? 'border-gold/40 bg-gold/5' : 'border-white/10'}`}>
      <p className="text-xs text-slate mb-1">{label}</p>
      <p className="font-mono text-xl">{value}</p>
    </div>
  );
}
