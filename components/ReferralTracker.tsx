'use client';

import { useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';

// Remembers a rep's link (?ref=CODE) from the moment a student first lands on the site, then — once they
// have an account — tells the server which code they came with. Invisible: it renders nothing.
const KEY = 'cc_ref';

function read(): string | null {
  try { return localStorage.getItem(KEY); } catch { return null; }
}
function write(v: string | null) {
  try { v ? localStorage.setItem(KEY, v) : localStorage.removeItem(KEY); } catch { /* private mode etc. */ }
}

export default function ReferralTracker() {
  useEffect(() => {
    // 1) Remember the code. The first link a visitor opens wins.
    try {
      const fromUrl = new URLSearchParams(window.location.search).get('ref');
      const code = fromUrl ? fromUrl.trim().toUpperCase() : '';
      if (/^[A-Z0-9_-]{3,20}$/.test(code) && !read()) write(code);
    } catch { /* ignore */ }

    // 2) Once logged in, hand it to the server — exactly once.
    let busy = false;
    async function claim(accessToken: string | undefined) {
      const code = read();
      if (!code || !accessToken || busy) return;
      busy = true;
      try {
        const res = await fetch('/api/referral/claim', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
          body: JSON.stringify({ code }),
        });
        // Any definite answer (credited, already counted, too old, invalid...) closes the matter. A network or server error keeps it for next time.
        if (res.status < 500) write(null);
      } catch { /* try again on a later page */ } finally { busy = false; }
    }

    supabase.auth.getSession().then(({ data }) => claim(data.session?.access_token));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => claim(session?.access_token));
    return () => listener.subscription.unsubscribe();
  }, []);

  return null;
}
