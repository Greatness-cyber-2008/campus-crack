import type { Metadata } from 'next';
import { supabaseServer } from '@/lib/supabaseServer';

// Gives shared practice links a proper title/description when pasted into
// WhatsApp, Telegram, etc. Kept out of search results on purpose — these are
// links people pass around, not pages to rank.
export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  try {
    const { data } = await supabaseServer()
      .from('question_sets')
      .select('title, question_count, is_shared')
      .eq('share_token', token)
      .maybeSingle();

    if (data?.is_shared) {
      const title = `${data.title} — free CBT practice`;
      const description = `Try this ${data.question_count}-question CBT practice set on CampusCrack. Start free, no card needed.`;
      return {
        title,
        description,
        robots: { index: false, follow: false },
        openGraph: { title, description },
        twitter: { title, description },
      };
    }
  } catch {
    // fall through to the generic metadata
  }
  return { title: 'Practice set', robots: { index: false, follow: false } };
}

export default function SharedSetLayout({ children }: { children: React.ReactNode }) {
  return children;
}
