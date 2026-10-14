import Link from 'next/link';

// Nav for anyone NOT logged in — the landing page, and /pricing when
// visited by an anonymous visitor. Kept intentionally short: About,
// Pricing, Log in, Start free. The full app nav (AppNav) is only for
// signed-in users inside the product.
export default function PublicNav() {
  return (
    <nav className="flex items-center justify-between px-4 sm:px-6 md:px-12 py-4 sm:py-6 border-b border-white/10">
      <Link href="/" className="font-display text-sm sm:text-lg tracking-tight">
        CAMPUSCRACK
      </Link>
      <div className="flex items-center gap-2 sm:gap-6 text-xs sm:text-sm">
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
          className="bg-gold text-ink font-semibold px-3 sm:px-4 py-2 rounded-full text-xs sm:text-sm hover:brightness-110 transition whitespace-nowrap"
        >
          Start free
        </Link>
      </div>
    </nav>
  );
}
