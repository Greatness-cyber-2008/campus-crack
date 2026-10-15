import { NextResponse } from 'next/server';
import { getUserFromRequest, supabaseServer } from '@/lib/supabaseServer';
import { buildGenerationPrompt, Discipline, ExamMode, Difficulty } from '@/lib/promptBuilder';
import { generateWithAI } from '@/lib/aiProvider';
import { combineMaterials } from '@/lib/materialText';

export const maxDuration = 60; // AI generation can take a while for big materials

const FREE_GENERATIONS_LIMIT = parseInt(process.env.FREE_GENERATIONS_LIMIT || '3', 10);
const FREE_MAX_QUESTIONS_PER_SET = parseInt(process.env.FREE_MAX_QUESTIONS_PER_SET || '10', 10);
// Mixed sets built from several files: total source text across all files, and a sane cap on file count.
const MAX_COMBINED_CHARS = 120000;
const MAX_MIXED_FILES = 8;

export async function POST(req: Request) {
  const user = await getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const body = await req.json();
  const {
    materialId,
    materialIds,
    discipline,
    examMode,
    difficulty,
    questionCount,
    timeLimitMinutes,
    title,
  }: {
    materialId?: string;
    materialIds?: string[]; // several files → one mixed set
    discipline: Discipline;
    examMode: ExamMode;
    difficulty: Difficulty;
    questionCount: number;
    timeLimitMinutes?: number;
    title: string;
  } = body;

  const requestedIds = Array.from(new Set((materialIds && materialIds.length > 0 ? materialIds : materialId ? [materialId] : []).filter(Boolean)));

  if (requestedIds.length === 0 || !discipline || !examMode || !questionCount) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
  }
  if (requestedIds.length > MAX_MIXED_FILES) {
    return NextResponse.json({ error: `Pick up to ${MAX_MIXED_FILES} files for one mixed set.` }, { status: 400 });
  }
  const isMixed = requestedIds.length > 1;

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

  // ---- Fetch the extracted material text (one file, or several combined) ----
  const { data: materialRows, error: materialError } = await supa
    .from('materials')
    .select('id, title, extracted_text, user_id, course_code')
    .in('id', requestedIds);

  const materials = (materialRows || []).filter((m) => m.user_id === user.id);
  if (materialError || materials.length !== requestedIds.length) {
    return NextResponse.json({ error: 'Material not found' }, { status: 404 });
  }
  if (materials.some((m) => !m.extracted_text)) {
    return NextResponse.json(
      { error: isMixed ? 'One of the files is still processing, try again shortly' : 'Material still processing, try again shortly' },
      { status: 409 }
    );
  }

  // Keep the order the student picked them in.
  const ordered = requestedIds.map((id) => materials.find((m) => m.id === id)!);
  const material = { course_code: ordered.find((m) => m.course_code)?.course_code || null };
  const sourceText = isMixed
    ? combineMaterials(ordered.map((m) => ({ title: m.title, text: m.extracted_text as string })), MAX_COMBINED_CHARS)
    : (ordered[0].extracted_text as string);

  // ---- Build the discipline + exam-mode aware prompt ----
  const { system, user: userPrompt } = buildGenerationPrompt({
    extractedText: sourceText,
    discipline,
    examMode,
    difficulty: difficulty || 'mixed',
    questionCount,
    courseCode: material.course_code,
    sourceCount: isMixed ? ordered.length : undefined,
    maxChars: isMixed ? MAX_COMBINED_CHARS + 2000 : undefined,
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

  // Belt-and-braces: the AI is instructed never to exceed questionCount, but prompt
  // adherence isn't guaranteed — never let a set be saved with more than the student asked for.
  if (parsed.questions.length > questionCount) {
    parsed.questions = parsed.questions.slice(0, questionCount);
  }

  // ---- Persist the question set ----
  const { data: questionSet, error: setError } = await supa
    .from('question_sets')
    .insert({
      user_id: user.id,
      // A mixed set has no single source file, so no per-file tutor/chat link.
      material_id: isMixed ? null : requestedIds[0],
      title: title || `${material.course_code || 'Practice'} - ${isMixed ? `Mixed (${ordered.length} files)` : examMode.toUpperCase()}`,
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
