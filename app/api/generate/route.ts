import { NextResponse } from 'next/server';
import { getUserFromRequest, supabaseServer } from '@/lib/supabaseServer';
import { buildGenerationPrompt, Discipline, ExamMode, Difficulty } from '@/lib/promptBuilder';
import { generateWithAI } from '@/lib/aiProvider';

export const maxDuration = 60; // AI generation can take a while for big materials

const FREE_GENERATIONS_LIMIT = parseInt(process.env.FREE_GENERATIONS_LIMIT || '3', 10);
const FREE_MAX_QUESTIONS_PER_SET = parseInt(process.env.FREE_MAX_QUESTIONS_PER_SET || '10', 10);

export async function POST(req: Request) {
  const user = await getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const body = await req.json();
  const {
    materialId,
    discipline,
    examMode,
    difficulty,
    questionCount,
    timeLimitMinutes,
    title,
  }: {
    materialId: string;
    discipline: Discipline;
    examMode: ExamMode;
    difficulty: Difficulty;
    questionCount: number;
    timeLimitMinutes?: number;
    title: string;
  } = body;

  if (!materialId || !discipline || !examMode || !questionCount) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }

  const supa = supabaseServer();

  // ---- Paywall check ----
  const { data: profile } = await supa
    .from('profiles')
    .select('is_premium, free_generations_used, university')
    .eq('id', user.id)
    .single();

  if (!profile?.is_premium && (profile?.free_generations_used || 0) >= FREE_GENERATIONS_LIMIT) {
    return NextResponse.json(
      { error: 'paywall', message: 'Free generation limit reached. Unlock full access to continue.' },
      { status: 402 }
    );
  }

  if (!profile?.is_premium && examMode === 'written') {
    return NextResponse.json(
      {
        error: 'paywall',
        message: 'Written/theory practice is a full-access feature. Unlock full access for ₦3,500 to use it.',
      },
      { status: 402 }
    );
  }

  if (!profile?.is_premium && questionCount > FREE_MAX_QUESTIONS_PER_SET) {
    return NextResponse.json(
      {
        error: 'paywall',
        message: `Free plan is capped at ${FREE_MAX_QUESTIONS_PER_SET} questions per set. Unlock full access for ₦3,500 for up to 50.`,
      },
      { status: 402 }
    );
  }

  // ---- Fetch the extracted material text ----
  const { data: material, error: materialError } = await supa
    .from('materials')
    .select('extracted_text, user_id, course_code')
    .eq('id', materialId)
    .single();

  if (materialError || !material || material.user_id !== user.id) {
    return NextResponse.json({ error: 'Material not found' }, { status: 404 });
  }
  if (!material.extracted_text) {
    return NextResponse.json({ error: 'Material still processing, try again shortly' }, { status: 409 });
  }

  // ---- Build the discipline + exam-mode aware prompt ----
  const { system, user: userPrompt } = buildGenerationPrompt({
    extractedText: material.extracted_text,
    discipline,
    examMode,
    difficulty: difficulty || 'mixed',
    questionCount,
    courseCode: material.course_code,
  });

  // ---- Call the AI provider (Gemini by default, Anthropic if AI_PROVIDER=anthropic) ----
  let rawText: string;
  try {
    rawText = await generateWithAI(system, userPrompt);
  } catch (err) {
    console.error('AI generation error:', err);
    return NextResponse.json({ error: 'Question generation failed, please try again' }, { status: 502 });
  }

  let parsed: { questions: any[] };
  try {
    const cleaned = rawText.replace(/```json|```/g, '').trim();
    parsed = JSON.parse(cleaned);
  } catch (e) {
    console.error('Failed to parse AI response:', rawText);
    return NextResponse.json({ error: 'Could not parse generated questions, please retry' }, { status: 502 });
  }

  if (!parsed.questions || parsed.questions.length === 0) {
    return NextResponse.json(
      { error: 'The uploaded material may be too short to generate quality questions.' },
      { status: 422 }
    );
  }

  // ---- Persist the question set ----
  const { data: questionSet, error: setError } = await supa
    .from('question_sets')
    .insert({
      user_id: user.id,
      material_id: materialId,
      title: title || `${material.course_code || 'Practice'} - ${examMode.toUpperCase()}`,
      exam_mode: examMode,
      discipline,
      course_code: material.course_code || null,
      author_university: profile?.university || null,
      difficulty: difficulty || 'mixed',
      question_count: parsed.questions.length,
      time_limit_minutes: examMode === 'cbt' ? timeLimitMinutes || parsed.questions.length * 1.5 : null,
    })
    .select()
    .single();

  if (setError || !questionSet) {
    console.error(setError);
    return NextResponse.json({ error: 'Failed to save question set' }, { status: 500 });
  }

  const rows = parsed.questions.map((q: any, idx: number) => ({
    question_set_id: questionSet.id,
    order_index: idx,
    question_type: examMode === 'cbt' ? 'mcq' : 'theory',
    prompt: q.prompt,
    topic: q.topic || null,
    options: examMode === 'cbt' ? q.options : null,
    correct_option: examMode === 'cbt' ? q.correct_option : null,
    explanation: examMode === 'cbt' ? q.explanation : null,
    model_answer: examMode === 'written' ? q.model_answer : null,
    marking_points: examMode === 'written' ? q.marking_points : null,
    marks: 1,
  }));

  const { error: questionsError } = await supa.from('questions').insert(rows);
  if (questionsError) {
    console.error(questionsError);
    return NextResponse.json({ error: 'Failed to save generated questions' }, { status: 500 });
  }

  // ---- Increment free-tier usage counter ----
  if (!profile?.is_premium) {
    await supa
      .from('profiles')
      .update({ free_generations_used: (profile?.free_generations_used || 0) + 1 })
      .eq('id', user.id);
  }

  return NextResponse.json({ questionSetId: questionSet.id });
}
