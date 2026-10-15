import { NextResponse } from 'next/server';
import { getUserFromRequest, supabaseServer } from '@/lib/supabaseServer';
import {
  FREE_SHARED_SAMPLE_QUESTIONS,
  cleanAnonId,
  findOrCreateAttempt,
  isUnlockedFor,
  loadSharedSet,
} from '@/lib/sharedSets';

// Records one answer and returns whether it was right. This is the paywall's real
// enforcement point: a question past the free sample is refused with 402 unless the
// caller is premium (or the owner), no matter what the browser sends. Answers are
// final once given, so retrying a question can't be used to guess through the options.
export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const body = await req.json().catch(() => ({}));
  const anonId = cleanAnonId(body.anonId);
  const questionId: string | undefined = body.questionId;
  const selected: string | undefined = body.selected;

  if (!questionId || typeof selected !== 'string' || !/^[A-D]$/.test(selected)) {
    return NextResponse.json({ error: 'Invalid answer' }, { status: 400 });
  }

  const user = await getUserFromRequest(req);
  if (!user && !anonId) {
    return NextResponse.json({ error: 'Missing viewer id' }, { status: 400 });
  }

  const supa = supabaseServer();
  const set = await loadSharedSet(supa, token);
  if (!set) {
    return NextResponse.json({ error: 'not_found' }, { status: 404 });
  }

  const { data: ordered } = await supa
    .from('questions')
    .select('id')
    .eq('question_set_id', set.id)
    .order('order_index');
  const ids = (ordered || []).map((q) => q.id);
  const index = ids.indexOf(questionId);
  if (index === -1) {
    return NextResponse.json({ error: 'Question not in this set' }, { status: 404 });
  }

  const { unlocked } = await isUnlockedFor(supa, user, set);
  const allowed = unlocked ? ids.length : Math.min(FREE_SHARED_SAMPLE_QUESTIONS, ids.length);
  if (index >= allowed) {
    return NextResponse.json({ error: 'paywall' }, { status: 402 });
  }

  const attempt = await findOrCreateAttempt(supa, set.id, user, anonId, true);
  if (!attempt) {
    return NextResponse.json({ error: 'Could not start attempt' }, { status: 500 });
  }

  const { data: q } = await supa
    .from('questions')
    .select('correct_option, explanation')
    .eq('id', questionId)
    .single();
  if (!q) {
    return NextResponse.json({ error: 'Question not found' }, { status: 404 });
  }

  const already = attempt.answers?.[questionId];
  const finalSelected = already || selected;

  if (!already) {
    await supa
      .from('shared_attempts')
      .update({ answers: { ...attempt.answers, [questionId]: selected }, updated_at: new Date().toISOString() })
      .eq('id', attempt.id);
  }

  return NextResponse.json({
    selected: finalSelected,
    correct: q.correct_option,
    isCorrect: finalSelected === q.correct_option,
    explanation: q.explanation,
    alreadyAnswered: !!already,
  });
}
