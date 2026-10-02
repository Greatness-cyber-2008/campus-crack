import { NextResponse } from 'next/server';
import { getUserFromRequest, supabaseServer } from '@/lib/supabaseServer';
import { generateWithAI } from '@/lib/aiProvider';

export const maxDuration = 60;

interface GradedQuestion {
  question_id: string;
  percentage: number;
  points_covered: string[];
  points_missed: string[];
  feedback: string;
}

export async function POST(req: Request) {
  const user = await getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { attemptId, answers } = (await req.json()) as {
    attemptId: string;
    answers: { questionId: string; response: string }[];
  };

  if (!attemptId || !Array.isArray(answers)) {
    return NextResponse.json({ error: 'attemptId and answers are required' }, { status: 400 });
  }

  const supa = supabaseServer();

  const { data: attempt } = await supa
    .from('attempts')
    .select('id, user_id, question_set_id, status')
    .eq('id', attemptId)
    .single();

  if (!attempt || attempt.user_id !== user.id) {
    return NextResponse.json({ error: 'Attempt not found' }, { status: 404 });
  }

  if (attempt.status === 'submitted') {
    return NextResponse.json({ error: 'This attempt was already submitted' }, { status: 409 });
  }

  const { data: questions } = await supa
    .from('questions')
    .select('id, prompt, marking_points')
    .eq('question_set_id', attempt.question_set_id);

  if (!questions || questions.length === 0) {
    return NextResponse.json({ error: 'Questions not found' }, { status: 404 });
  }

  const responseByQuestion: Record<string, string> = {};
  answers.forEach((a) => { responseByQuestion[a.questionId] = a.response; });

  const gradingInput = questions.map((q, i) => ({
    index: i + 1,
    question_id: q.id,
    prompt: q.prompt,
    marking_points: q.marking_points || [],
    student_answer: responseByQuestion[q.id] || '(no response written)',
  }));

  const system = `You are grading a Nigerian university student's written exam answers, the way a
strict but fair lecturer would mark against specific marking points. You are not the actual lecturer
and will not see the real exam script, so grade only to give the student an honest estimate of how
they would likely perform if they wrote this exact answer in the real exam. Do not inflate scores to
be encouraging - an honest low score is more useful to the student than false comfort.

For each question, compare the student's answer against its marking points. Decide which marking
points are clearly covered (judge the idea, even if worded differently, not exact wording), which are
missing, and give a percentage score for that question from 0 to 100 based on the proportion of
marking points covered. If the student wrote nothing or something irrelevant, give 0 and say so
plainly. Give short, specific feedback (1-2 sentences) explaining the score and exactly what to add
to improve it.

Respond ONLY with a JSON object of this exact shape, no other text:
{
  "results": [
    {
      "question_id": "...",
      "percentage": 0,
      "points_covered": ["..."],
      "points_missed": ["..."],
      "feedback": "..."
    }
  ]
}`;

  const userPrompt = `Grade these ${gradingInput.length} answers:\n\n${JSON.stringify(gradingInput, null, 2)}`;

  let raw: string;
  try {
    raw = await generateWithAI(system, userPrompt);
  } catch (err) {
    console.error('Written grading AI error:', err);
    return NextResponse.json({ error: 'Could not grade this attempt, please try again' }, { status: 502 });
  }

  let parsed: { results: GradedQuestion[] };
  try {
    const cleaned = raw.trim().replace(/^```json\s*/i, '').replace(/```$/, '');
    parsed = JSON.parse(cleaned);
  } catch (err) {
    console.error('Could not parse grading JSON:', raw);
    return NextResponse.json({ error: 'Could not grade this attempt, please try again' }, { status: 502 });
  }

  const resultByQuestion: Record<string, GradedQuestion> = {};
  (parsed.results || []).forEach((r) => { resultByQuestion[r.question_id] = r; });

  let marksScored = 0;
  const totalMarks = questions.length;

  const answerRows = questions.map((q) => {
    const result = resultByQuestion[q.id];
    const percentage = result?.percentage ?? 0;
    const marks = percentage / 100;
    marksScored += marks;
    return {
      attempt_id: attemptId,
      question_id: q.id,
      written_response: responseByQuestion[q.id] || '',
      marks_awarded: marks,
      ai_feedback: result?.feedback || 'Could not be graded.',
      points_covered: result?.points_covered || [],
      points_missed: result?.points_missed || [],
    };
  });

  await supa.from('answers').insert(answerRows);

  const score = totalMarks > 0 ? Math.round((marksScored / totalMarks) * 100) : 0;

  await supa
    .from('attempts')
    .update({
      submitted_at: new Date().toISOString(),
      status: 'submitted',
      score,
      total_marks: totalMarks,
      marks_scored: marksScored,
    })
    .eq('id', attemptId);

  return NextResponse.json({ score });
}