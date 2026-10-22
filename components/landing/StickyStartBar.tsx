'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

// A slim floating CTA that appears once the hero has scrolled out of view,
// so "Start free" stays one tap away on a long page without being pushy
// about it (no sound, no popup, just a bar that slides in).
export default function StickyStartBar() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    function onScroll() {
      setShow(window.scrollY > 560);
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div
      className={`fixed bottom-4 left-0 right-0 z-30 px-4 flex justify-center pointer-events-none transition-all duration-300 ${
        show ? 'opacity-100 translate-y-0 visible' : 'opacity-0 translate-y-4 invisible'
      }`}
    >
      <div className="pointer-events-auto flex items-center gap-3 bg-ink/95 backdrop-blur border border-gold/30 rounded-full pl-4 pr-1.5 py-1.5 shadow-lg shadow-black/40">
        <span className="text-xs sm:text-sm text-paper font-medium hidden sm:inline">
          Ready to crack your next exam?
        </span>
        <Link
          href="/signup"
          className="bg-gold text-ink font-semibold px-4 py-2 rounded-full text-xs sm:text-sm hover:brightness-110 transition whitespace-nowrap"
        >
          Start free
        </Link>
      </div>
    </div>
  );
}
