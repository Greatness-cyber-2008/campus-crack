'use client';

import Script from 'next/script';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useOptionalUser, getAuthHeader } from '@/lib/useUser';
import { supabase } from '@/lib/supabaseClient';
import AppNav from '@/components/AppNav';
import PublicNav from '@/components/PublicNav';
import { getSafeNext } from '@/lib/safeNext';

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
  shared_set: 'Unlock full access to finish this practice set — and everything else on CampusCrack.',
  plan_limit_reached:'Free plan is limited to 1 study plan — unlock full access for unlimited plans across all your courses.',
};

export default function PricingPage() {
  return (
    <Suspense fallback={null}>
      <PricingContent />
    </Suspense>
  );
}

function PricingContent() {
  const { user } = useOptionalUser();
  const params = useSearchParams();
  const reason = params.get('reason');
  const [loading, setLoading] = useState(false);
  const [isPremium, setIsPremium] = useState<boolean | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkMsg, setCheckMsg] = useState<string | null>(null);

  async function loadProfile() {
    if (!user) return;
    const { data } = await supabase
      .from('profiles')
      .select('is_premium, premium_expires_at')
      .eq('id', user.id)
      .single();
    setIsPremium(!!data?.is_premium);
    setExpiresAt(data?.premium_expires_at || null);
    return !!data?.is_premium;
  }

  // Re-checks Paystack for any payment this student started but we haven't unlocked yet
  // (typical after a bank transfer, where they leave the site while paying).
  async function checkPayment(manual: boolean) {
    if (!user) return;
    if (manual) {
      setChecking(true);
      setCheckMsg(null);
    }
    try {
      const res = await fetch('/api/paystack/sync', { method: 'POST', headers: await getAuthHeader() });
      const data = await res.json();
      if (data?.isPremium) {
        await loadProfile();
        if (manual) setCheckMsg('Payment found — your full access is now active. ✓');
      } else if (manual) {
        setCheckMsg(
          data?.checked > 0
            ? "We can't see a completed payment yet. Bank transfers can take a few minutes — try again shortly."
            : 'No recent payment found on this account.'
        );
      }
    } catch {
      if (manual) setCheckMsg('Could not check right now — try again in a moment.');
    } finally {
      if (manual) setChecking(false);
    }
  }

  useEffect(() => {
    if (!user) return;
    (async () => {
      const premium = await loadProfile();
      if (!premium) checkPayment(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  async function handleUpgrade() {
    if (!user) return;
    setLoading(true);

    // The server creates the payment reference and saves it against this student first,
    // so a payment made by bank transfer can still be matched to them after they leave.
    let reference: string;
    try {
      const res = await fetch('/api/paystack/init', { method: 'POST', headers: await getAuthHeader() });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'init failed');
      reference = data.reference;
    } catch {
      setLoading(false);
      setCheckMsg('Could not start the payment. Check your connection and try again.');
      return;
    }

    const handler = window.PaystackPop.setup({
      key: process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY,
      email: user.email,
      amount: PREMIUM_PRICE_KOBO,
      currency: 'NGN',
      ref: reference,
      metadata: { user_id: user.id, purpose: 'premium_unlock' },
      callback: (response: any) => {
        (async () => {
          const authHeader = await getAuthHeader();
          await fetch('/api/paystack/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeader },
            body: JSON.stringify({ reference: response.reference, purpose: 'premium_unlock' }),
          });
          window.location.href = getSafeNext() || '/dashboard?upgraded=1';
        })();
      },
      onClose: () => setLoading(false),
    });
    handler.openIframe();
  }

  const daysLeft = expiresAt
    ? Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
    : null;
  const isExpiringSoon = daysLeft !== null && daysLeft <= 14;

  return (
    <main className="min-h-screen bg-ink text-paper">
      <Script src="https://js.paystack.co/v1/inline.js" strategy="lazyOnload" />
      {user ? <AppNav active="Pricing" /> : <PublicNav />}

      <div className="px-4 sm:px-6 md:px-12 py-10 sm:py-16 max-w-4xl mx-auto text-center">
        <h1 className="font-display text-3xl md:text-4xl mb-4">SIMPLE, HONEST PRICING</h1>
        <p className="text-slate mb-6 max-w-xl mx-auto">
          One clean payment per semester. Never auto-charged — you choose when to renew.
        </p>

        {isPremium && expiresAt ? (
          <p
            className={`inline-block border text-sm px-4 py-2 rounded-full mb-10 ${
              isExpiringSoon ? 'bg-stamp/10 border-stamp/40 text-stamp' : 'bg-gold/10 border-gold/40 text-gold'
            }`}
          >
            {isExpiringSoon
              ? `Your access expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'} — renew below to keep it going.`
              : `Full access active until ${new Date(expiresAt).toLocaleDateString()}`}
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
              <li>1 study plan</li>
              <li>Free access to all community-shared sets</li>
            </ul>
          </div>

          <div className="border border-gold rounded-2xl p-6 sm:p-8 bg-gold/5 relative">
            <span className="absolute -top-3 right-6 bg-gold text-ink text-xs font-semibold px-3 py-1 rounded-full">
              {isPremium && !isExpiringSoon ? 'Active' : 'Best value'}
            </span>
            <h3 className="font-semibold text-lg mb-1">Full access</h3>
            <p className="text-slate text-sm mb-6">Everything unlocked, per semester</p>
            <p className="font-display text-3xl mb-6">
              ₦{(PREMIUM_PRICE_KOBO / 100).toLocaleString()}
              <span className="text-sm text-slate font-normal"> / semester</span>
            </p>
            <ul className="text-sm text-slate space-y-2 mb-8">
              <li>Unlimited question set generations</li>
              <li>Written/theory mode with model answers</li>
              <li>Up to 50 questions per set</li>
              <li>Unlimited chat with your materials</li>
              <li>Unlimited study plans — one for every course</li>
              <li>All disciplines, both exam modes</li>
              <li>Never auto-charged — you choose when to renew</li>
            </ul>
            {isPremium && !isExpiringSoon ? (
              <div className="w-full bg-gold/20 text-gold font-semibold py-3 rounded-full text-center">
                ✓ Active until {expiresAt ? new Date(expiresAt).toLocaleDateString() : ''}
              </div>
            ) : (
              <button
                onClick={handleUpgrade}
                disabled={loading || !user}
                className="w-full bg-gold text-ink font-semibold py-3 rounded-full hover:brightness-110 transition disabled:opacity-60"
              >
                {loading
                  ? 'Opening checkout…'
                  : !user
                  ? 'Log in to upgrade'
                  : isExpiringSoon
                  ? 'Renew for ₦3,500'
                  : 'Unlock full access — ₦3,500'}
              </button>
            )}
          </div>
        </div>

        {user && !isPremium && (
          <div className="max-w-2xl mx-auto mt-8 border border-white/10 rounded-xl px-5 py-4 text-left">
            <p className="text-sm font-semibold mb-1">Already paid?</p>
            <p className="text-slate text-xs mb-3">
              If you paid by bank transfer and left this page, your access unlocks automatically — usually within a minute or
              two. You can also check right now. You never need to pay twice.
            </p>
            <button
              onClick={() => checkPayment(true)}
              disabled={checking}
              className="border border-gold/40 text-gold text-sm px-4 py-2 rounded-full hover:bg-gold/10 transition disabled:opacity-60"
            >
              {checking ? 'Checking…' : 'Check my payment'}
            </button>
            {checkMsg && <p className="text-sm mt-3 text-slate">{checkMsg}</p>}
          </div>
        )}
      </div>
    </main>
  );
}
