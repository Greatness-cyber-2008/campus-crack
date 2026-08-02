import { NextResponse } from 'next/server';
import { getUserFromRequest, supabaseServer } from '@/lib/supabaseServer';
import { buildStudyPlanPrompt } from '@/lib/promptBuilder';
import { generateWithAI } from '@/lib/aiProvider';

export const maxDuration = 60;

const FREE_GENERATIONS_LIMIT = parseInt(process.env.FREE_GENERATIONS_LIMIT || '3', 10);
// Cap combined text across all materials in a course — keeps the prompt within a sane size
// even if a student has uploaded many files (notes + past questions + slides) for one course.
const MAX_COMBINED_CHARS = 90000;

export async function POST(req: Request) {
  const user = await getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { materialId, courseId, totalWeeks, startDate, title } = (await req.json()) as {
    materialId?: string;
    courseId?: string;
    totalWeeks: number;
    startDate: string;
    title?: string;
  };

  if ((!materialId && !courseId) || !totalWeeks || !startDate) {
    return NextResponse.json(
      { error: 'Either materialId or courseId is required, along with totalWeeks and startDate' },
      { status: 400 }
    );
  }

  const supa = supabaseServer();

  const { data: profile } = await supa
    .from('profiles')
    .select('is_premium, free_generations_used')
    .eq('id', user.id)
    .single();

  if (!profile?.is_premium && (profile?.free_generations_used || 0) >= FREE_GENERATIONS_LIMIT) {
    return NextResponse.json(
      { error: 'paywall', message: 'Free generation limit reached. Unlock full access to continue.' },
      { status: 402 }
    );
  }

  // Free users get 1 study plan. Full access unlocks unlimited plans — this matters because a student
  // takes 5-8 courses a semester, so this wall hits right after they've already seen the first plan work.
  if (!profile?.is_premium) {
    const { count } = await supa
      .from('study_plans')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id);

    if ((count || 0) >= 1) {
      return NextResponse.json(
        {
          error: 'paywall',
          message: 'Free plan is limited to 1 study plan. Unlock full access for ₦3,500 for unlimited plans.',
        },
        { status: 402 }
      );
    }
  }

  // ---- Gather the source text: either one material, or every material in a course combined ----
  let combinedText = '';
  let resolvedCourseCode: string | null = null;
  let resolvedDiscipline: string | null = null;
  let resolvedTitle: string | null = null;

  if (courseId) {
    const { data: course, error: courseError } = await supa
      .from('courses')
      .select('id, user_id, title, course_code, discipline')
      .eq('id', courseId)
      .single();

    if (courseError || !course || course.user_id !== user.id) {
      return NextResponse.json({ error: 'Course not found' }, { status: 404 });
    }

    const { data: materials, error: materialsError } = await supa
      .from('materials')
      .select('title, extracted_text, status')
      .eq('course_id', courseId)
      .eq('user_id', user.id);

    if (materialsError || !materials || materials.length === 0) {
      return NextResponse.json({ error: 'No materials found in this course yet' }, { status: 404 });
    }

    const readyMaterials = materials.filter((m) => m.status === 'ready' && m.extracted_text);
    if (readyMaterials.length === 0) {
      return NextResponse.json({ error: 'Materials in this course are still processing, try again shortly' }, { status: 409 });
    }

    combinedText = readyMaterials
      .map((m) => `--- ${m.title} ---\n${m.extracted_text}`)
      .join('\n\n')
      .slice(0, MAX_COMBINED_CHARS);

    resolvedCourseCode = course.course_code;
    resolvedDiscipline = course.discipline;
    resolvedTitle = title || `${course.title} Study Plan`;
  } else {
    const { data: material, error: materialError } = await supa
      .from('materials')
      .select('extracted_text, user_id, course_code, discipline, title')
      .eq('id', materialId)
      .single();

    if (materialError || !material || material.user_id !== user.id) {
      return NextResponse.json({ error: 'Material not found' }, { status: 404 });
    }
    if (!material.extracted_text) {
      return NextResponse.json({ error: 'Material still processing, try again shortly' }, { status: 409 });
    }

    combinedText = material.extracted_text;
    resolvedCourseCode = material.course_code;
    resolvedDiscipline = material.discipline;
    resolvedTitle = title || `${material.course_code || 'Course'} Study Plan`;
  }

  const { system, user: userPrompt } = buildStudyPlanPrompt({
    extractedText: combinedText,
    totalWeeks,
    courseCode: resolvedCourseCode || undefined,
  });

  let rawText: string;
  try {
    rawText = await generateWithAI(system, userPrompt);
  } catch (err) {
    console.error('Study plan AI generation error:', err);
    return NextResponse.json({ error: 'Study plan generation failed, please try again' }, { status: 502 });
  }

  let parsed: { weeks: any[] };
  try {
    const cleaned = rawText.replace(/```json|```/g, '').trim();
    parsed = JSON.parse(cleaned);
  } catch (e) {
    console.error('Failed to parse study plan response:', rawText);
    return NextResponse.json({ error: 'Could not parse generated study plan, please retry' }, { status: 502 });
  }

  if (!parsed.weeks || parsed.weeks.length === 0) {
    return NextResponse.json(
      { error: 'The uploaded material may be too short to build a study plan from.' },
      { status: 422 }
    );
  }

  const { data: plan, error: planError } = await supa
    .from('study_plans')
    .insert({
      user_id: user.id,
      material_id: courseId ? null : materialId,
      course_id: courseId || null,
      title: resolvedTitle,
      course_code: resolvedCourseCode,
      discipline: resolvedDiscipline,
      start_date: startDate,
      total_weeks: totalWeeks,
    })
    .select()
    .single();

  if (planError || !plan) {
    console.error(planError);
    return NextResponse.json({ error: 'Failed to save study plan' }, { status: 500 });
  }

  const rows = parsed.weeks.map((w: any) => ({
    study_plan_id: plan.id,
    week_number: w.week_number,
    topic: w.topic,
    description: w.description || null,
    study_tip: w.study_tip || null,
  }));

  const { error: weeksError } = await supa.from('study_plan_weeks').insert(rows);
  if (weeksError) {
    console.error(weeksError);
    return NextResponse.json({ error: 'Failed to save study plan weeks' }, { status: 500 });
  }

  if (!profile?.is_premium) {
    await supa
      .from('profiles')
      .update({ free_generations_used: (profile?.free_generations_used || 0) + 1 })
      .eq('id', user.id);
  }

  return NextResponse.json({ planId: plan.id });
}
