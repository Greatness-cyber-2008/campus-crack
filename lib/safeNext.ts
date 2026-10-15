// Reads the ?next= param from the current URL, but only if it's a plain
// in-site path — never an absolute URL — so login/signup/pricing can send a
// student back where they came from (e.g. a shared practice link) without
// becoming an open redirect. Client-side only.
export function getSafeNext(): string | null {
  if (typeof window === 'undefined') return null;
  const next = new URLSearchParams(window.location.search).get('next');
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.includes('\\')) return null;
  return next;
}
