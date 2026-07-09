'use client';

import Script from 'next/script';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useUser, getAuthHeader } from '@/lib/useUser';
import { supabase } from '@/lib/supabaseClient';
import AppNav from '@/components/AppNav';

declare global {
  interface Window {
    PaystackPop: any;
  }
}

const PREMIUM_PRICE_KOBO = parseInt(process.env.NEXT_PUBLIC_PREMIUM_PRICE_KOBO || '350000', 10);

const REASON_COPY: Record<string, string> = {
  limit_reached: "You've used all 3 free generations — unlock full access to keep generating.",
  written_locked: 'Written/theory mode is part of full access.',
  chat_limit_reached: "You've hit today's free chat limit — unlock full access for unlimited chat.",
};

export default function PricingPage() {
  return (
    <Suspense fallback={null}>
      <PricingContent />
    </Suspense>
  );
}

function PricingContent() {
  const { user } = useUser();
  const params = useSearchParams();
  const reason = params.get('reason');
  const [loading, setLoading] = useState(false);
  const [isPremium, setIsPremium] = useState<boolean | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase.from('profiles').select('is_premium').eq('id', user.id).single();
      setIsPremium(!!data?.is_premium);
    })();
  }, [user]);

  function handleUpgrade() {
    if (!user) return;
    setLoading(true);

    const handler = window.PaystackPop.setup({
      key: process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY,
      email: user.email,
      amount: PREMIUM_PRICE_KOBO,
      currency: 'NGN',
      ref: `campuscrack_${Date.now()}_${user.id.slice(0, 8)}`,
      callback: (response: any) => {
        (async () => {
          const authHeader = await getAuthHeader();
          await fetch('/api/paystack/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeader },
            body: JSON.stringify({ reference: response.reference, purpose: 'premium_unlock' }),
          });
          window.location.href = '/dashboard?upgraded=1';
        })();
      },
      onClose: () => setLoading(false),
    });
    handler.openIframe();
  }

  return (
    <main className="min-h-screen bg-ink text-paper">
      <Script src="https://js.paystack.co/v1/inline.js" strategy="lazyOnload" />
      <AppNav active="Pricing" />

      <div className="px-4 sm:px-6 md:px-12 py-10 sm:py-16 max-w-4xl mx-auto text-center">
        <h1 className="font-display text-3xl md:text-4xl mb-4">SIMPLE, HONEST PRICING</h1>
        <p className="text-slate mb-6 max-w-xl mx-auto">
          One clean unlock. No recurring charges you have to fight to cancel — pay once, keep it
          for good.
        </p>

        {isPremium ? (
          <p className="inline-block bg-gold/10 border border-gold/40 text-gold text-sm px-4 py-2 rounded-full mb-10">
            You already have full access unlocked ✓
          </p>
        ) : (
          reason &&
          REASON_COPY[reason] && (
            <p className="inline-block bg-stamp/10 border border-stamp/40 text-stamp text-sm px-4 py-2 rounded-full mb-10">
              {REASON_COPY[reason]}
            </p>
          )
        )}

        <div className="grid md:grid-cols-2 gap-6 max-w-2xl mx-auto text-left">
          <div className="border border-white/10 rounded-2xl p-6 sm:p-8">
            <h3 className="font-semibold text-lg mb-1">Free</h3>
            <p className="text-slate text-sm mb-6">Try it before you commit</p>
            <p className="font-display text-3xl mb-6">₦0</p>
            <ul className="text-sm text-slate space-y-2 mb-8">
              <li>3 free question set generations</li>
              <li>CBT mode only, up to 10 questions per set</li>
              <li>15 chat messages a day with your uploaded material</li>
              <li>Free access to all community-shared sets</li>
            </ul>
          </div>

          <div className="border border-gold rounded-2xl p-6 sm:p-8 bg-gold/5 relative">
            <span className="absolute -top-3 right-6 bg-gold text-ink text-xs font-semibold px-3 py-1 rounded-full">
              {isPremium ? 'Active' : 'Best value'}
            </span>
            <h3 className="font-semibold text-lg mb-1">Full access</h3>
            <p className="text-slate text-sm mb-6">Everything unlocked, one payment</p>
            <p className="font-display text-3xl mb-6">₦{(PREMIUM_PRICE_KOBO / 100).toLocaleString()}</p>
            <ul className="text-sm text-slate space-y-2 mb-8">
              <li>Unlimited question set generations</li>
              <li>Written/theory mode with model answers</li>
              <li>Up to 50 questions per set</li>
              <li>Unlimited chat with your materials</li>
              <li>All disciplines, both exam modes</li>
              <li>One-time payment — no auto-renewal</li>
            </ul>
            {isPremium ? (
              <div className="w-full bg-gold/20 text-gold font-semibold py-3 rounded-full text-center">
                ✓ Unlocked
              </div>
            ) : (
              <button
                onClick={handleUpgrade}
                disabled={loading || !user}
                className="w-full bg-gold text-ink font-semibold py-3 rounded-full hover:brightness-110 transition disabled:opacity-60"
              >
                {loading ? 'Opening checkout…' : user ? 'Unlock full access — ₦3,500' : 'Log in to upgrade'}
              </button>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
