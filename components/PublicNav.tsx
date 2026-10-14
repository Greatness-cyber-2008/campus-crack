'use client';

import { useState } from 'react';
import Link from 'next/link';

// Nav for anyone NOT logged in — the landing page, and /pricing when
// visited by an anonymous visitor. On mobile there isn't room for four
// text links next to the wordmark and the CTA pill, so About/Pricing/Log in
// collapse into a toggle menu; the logo and "Start free" stay visible at
// all times since those are the two things a first-time visitor needs most.
export default function PublicNav() {
  const [open, setOpen] = useState(false);

  return (
    <nav className="relative border-b border-white/10">
      <div className="flex items-center justify-between px-4 sm:px-6 md:px-12 py-4 sm:py-6">
        <Link href="/" className="font-display text-sm sm:text-lg tracking-tight">
          CAMPUSCRACK
        </Link>

        {/* Desktop links */}
        <div className="hidden sm:flex items-center gap-6 text-sm">
          <Link href="/about" className="text-slate hover:text-paper transition">
            About
          </Link>
          <Link href="/pricing" className="text-slate hover:text-paper transition">
            Pricing
          </Link>
          <Link href="/login" className="text-slate hover:text-paper transition">
            Log in
          </Link>
          <Link
            href="/signup"
            className="bg-gold text-ink font-semibold px-4 py-2 rounded-full text-sm hover:brightness-110 transition whitespace-nowrap"
          >
            Start free
          </Link>
        </div>

        {/* Mobile: CTA + menu toggle only */}
        <div className="flex sm:hidden items-center gap-2">
          <Link
            href="/signup"
            className="bg-gold text-ink font-semibold px-3 py-2 rounded-full text-xs hover:brightness-110 transition whitespace-nowrap"
          >
            Start free
          </Link>
          <button
            onClick={() => setOpen((v) => !v)}
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            className="w-9 h-9 flex items-center justify-center rounded-full border border-white/10 text-paper"
          >
            {open ? (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M1 1L15 15M15 1L1 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M1 3H15M1 8H15M1 13H15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Mobile dropdown */}
      {open && (
        <div className="sm:hidden border-t border-white/10 bg-ink px-4 py-3 flex flex-col gap-1 text-sm">
          <Link
            href="/about"
            onClick={() => setOpen(false)}
            className="py-2.5 text-slate hover:text-paper transition"
          >
            About
          </Link>
          <Link
            href="/pricing"
            onClick={() => setOpen(false)}
            className="py-2.5 text-slate hover:text-paper transition"
          >
            Pricing
          </Link>
          <Link
            href="/login"
            onClick={() => setOpen(false)}
            className="py-2.5 text-slate hover:text-paper transition"
          >
            Log in
          </Link>
        </div>
      )}
    </nav>
  );
}
