import { NextResponse } from 'next/server';
import { getUserFromRequest, supabaseServer } from '@/lib/supabaseServer';
import { buildFlashcardPrompt, Discipline } from '@/lib/promptBuilder';
import { generateWithAI } from '@/lib/aiProvider';

export const maxDuration = 60;

const FREE_GENERATIONS_LIMIT = parseInt(process.env.FREE_GENERATIONS_LIMIT || '3', 10);

export async function POST(req: Request) {
  const user = await getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { materialId, cardCount, title } = (await req.json()) as {
    materialId: string;
    cardCount: number;
    title?: string;
  };

  if (!materialId || !cardCount) {
    return NextResponse.json({ error: 'materialId and cardCount are required' }, { status: 400 });
  }

  const supa = supabaseServer();

  // Flashcard generation shares the same free-generation counter as practice sets —
  // it's still one AI generation call either way.
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

  const { data: material, error: materialError } = await supa
    .from('materials')
    .select('extracted_text, user_id, course_code, discipline')
    .eq('id', materialId)
    .single();

  if (materialError || !material || material.user_id !== user.id) {
    return NextResponse.json({ error: 'Material not found' }, { status: 404 });
  }
  if (!material.extracted_text) {
    return NextResponse.json({ error: 'Material still processing, try again shortly' }, { status: 409 });
  }

  const { system, user: userPrompt } = buildFlashcardPrompt({
    extractedText: material.extracted_text,
    discipline: (material.discipline as Discipline) || 'general',
    courseCode: material.course_code,
    cardCount,
  });

  let rawText: string;
  try {
    rawText = await generateWithAI(system, userPrompt);
  } catch (err) {
    console.error('Flashcard AI generation error:', err);
    return NextResponse.json({ error: 'Flashcard generation failed, please try again' }, { status: 502 });
  }

  let parsed: { flashcards: any[] };
  try {
    const cleaned = rawText.replace(/```json|```/g, '').trim();
    parsed = JSON.parse(cleaned);
  } catch (e) {
    console.error('Failed to parse flashcard response:', rawText);
    return NextResponse.json({ error: 'Could not parse generated flashcards, please retry' }, { status: 502 });
  }

  if (!parsed.flashcards || parsed.flashcards.length === 0) {
    return NextResponse.json(
      { error: 'The uploaded material may be too short to generate quality flashcards.' },
      { status: 422 }
    );
  }

  const { data: flashcardSet, error: setError } = await supa
    .from('flashcard_sets')
    .insert({
      user_id: user.id,
      material_id: materialId,
      title: title || `${material.course_code || 'Flashcards'}`,
      discipline: material.discipline,
      course_code: material.course_code,
      card_count: parsed.flashcards.length,
    })
    .select()
    .single();

  if (setError || !flashcardSet) {
    console.error(setError);
    return NextResponse.json({ error: 'Failed to save flashcard set' }, { status: 500 });
  }

  const rows = parsed.flashcards.map((c: any, idx: number) => ({
    flashcard_set_id: flashcardSet.id,
    order_index: idx,
    front: c.front,
    back: c.back,
    topic: c.topic || null,
  }));

  const { error: cardsError } = await supa.from('flashcards').insert(rows);
  if (cardsError) {
    console.error(cardsError);
    return NextResponse.json({ error: 'Failed to save flashcards' }, { status: 500 });
  }

  if (!profile?.is_premium) {
    await supa
      .from('profiles')
      .update({ free_generations_used: (profile?.free_generations_used || 0) + 1 })
      .eq('id', user.id);
  }

  return NextResponse.json({ flashcardSetId: flashcardSet.id });
}
