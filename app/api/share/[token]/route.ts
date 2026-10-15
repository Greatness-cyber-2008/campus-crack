import { NextResponse } from 'next/server';
import { getUserFromRequest, supabaseServer } from '@/lib/supabaseServer';
import {
  FREE_SHARED_SAMPLE_QUESTIONS,
  cleanAnonId,
  findOrCreateAttempt,
  isUnlockedFor,
  loadSharedSet,
} from '@/lib/sharedSets';

// Public (login optional). Returns the set's metadata and ONLY the questions this
// viewer is allowed to see — free sample for everyone else, everything for premium
// users and the set's owner. Correct answers/explanations are never included here;
// they're only revealed per-question after the viewer answers (see ./answer).
export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const anonId = cleanAnonId(new URL(req.url).searchParams.get('anonId'));
  const user = await getUserFromRequest(req); // null for logged-out visitors

  const supa = supabaseServer();
  const set = await loadSharedSet(supa, token);
  if (!set) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const { data: all } = await supa
    .from('questions')
    .select('id, order_index, prompt, options')
    .eq('question_set_id', set.id)
    .order('order_index');
  const questions = all || [];
  const total = questions.length;

  const { isPremium, unlocked } = await isUnlockedFor(supa, user, set);
  const allowed = unlocked ? total : Math.min(FREE_SHARED_SAMPLE_QUESTIONS, total);
  const visible = questions.slice(0, allowed);

  // Resume: return the viewer's earlier answers, with correctness, for visible questions.
  const attempt = await findOrCreateAttempt(supa, set.id, user, anonId, false);
  const answered: Record<string, { selected: string; correct: string; isCorrect: boolean; explanation: string | null }> = {};
  const savedAnswers = attempt?.answers || {};
  const answeredIds = visible.map((q) => q.id).filter((id) => savedAnswers[id]);

  if (answeredIds.length > 0) {
    const { data: keyed } = await supa
      .from('questions')
      .select('id, correct_option, explanation')
      .in('id', answeredIds);
    for (const k of keyed || []) {
      answered[k.id] = {
        selected: savedAnswers[k.id],
        correct: k.correct_option,
        isCorrect: savedAnswers[k.id] === k.correct_option,
        explanation: k.explanation,
      };
    }
  }

  return NextResponse.json({
    set: { title: set.title, courseCode: set.course_code, total, freeCount: Math.min(FREE_SHARED_SAMPLE_QUESTIONS, total) },
    viewer: { loggedIn: !!user, isPremium, unlocked },
    lockedCount: total - allowed,
    questions: visible,
    answered,
  });
}
