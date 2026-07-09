'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';

export default function AppNav({ active }: { active?: string }) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push('/');
  }

  const links = [
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/upload', label: 'Upload' },
    { href: '/flashcards', label: 'Flashcards' },
    { href: '/library', label: 'My sets' },
    { href: '/analytics', label: 'Analytics' },
    { href: '/browse', label: 'Community' },
    { href: '/pricing', label: 'Pricing' },
  ];

  return (
    <nav className="border-b border-white/10 bg-ink text-paper relative z-20">
      <div className="flex items-center justify-between px-4 sm:px-6 md:px-12 py-4 sm:py-5">
        <Link href="/dashboard" className="font-display text-sm sm:text-base tracking-tight">
          CAMPUSCRACK
        </Link>

        {/* Desktop links - hidden below md */}
        <div className="hidden md:flex items-center gap-6 text-sm">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={active === l.label ? 'text-gold' : 'text-slate hover:text-paper transition'}
            >
              {l.label}
            </Link>
          ))}
          <button onClick={handleLogout} className="text-slate hover:text-stamp transition">
            Log out
          </button>
        </div>

        {/* Mobile hamburger - hidden from md up */}
        <button
          onClick={() => setMenuOpen((v) => !v)}
          aria-label="Toggle menu"
          aria-expanded={menuOpen}
          className="md:hidden flex flex-col justify-center items-center w-10 h-10 -mr-2"
        >
          <span
            className={`block w-6 h-0.5 bg-paper transition-transform ${menuOpen ? 'rotate-45 translate-y-[3px]' : ''}`}
          />
          <span className={`block w-6 h-0.5 bg-paper my-1.5 transition-opacity ${menuOpen ? 'opacity-0' : ''}`} />
          <span
            className={`block w-6 h-0.5 bg-paper transition-transform ${menuOpen ? '-rotate-45 -translate-y-[3px]' : ''}`}
          />
        </button>
      </div>

      {/* Mobile dropdown */}
      {menuOpen && (
        <div className="md:hidden border-t border-white/10 px-4 py-3 flex flex-col gap-1">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setMenuOpen(false)}
              className={`py-3 px-2 rounded-lg text-base ${
                active === l.label ? 'text-gold bg-gold/5' : 'text-slate active:bg-white/5'
              }`}
            >
              {l.label}
            </Link>
          ))}
          <button
            onClick={handleLogout}
            className="text-left py-3 px-2 rounded-lg text-base text-slate active:bg-white/5"
          >
            Log out
          </button>
        </div>
      )}
    </nav>
  );
}
