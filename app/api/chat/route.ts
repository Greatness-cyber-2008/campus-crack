import { NextResponse } from 'next/server';
import { getUserFromRequest, supabaseServer } from '@/lib/supabaseServer';
import { chatWithAI, ChatTurn, ChatAttachment } from '@/lib/aiProvider';

export const maxDuration = 60;

const FREE_CHAT_MESSAGES_PER_DAY = parseInt(process.env.FREE_CHAT_MESSAGES_PER_DAY || '15', 10);
const MAX_HISTORY_TURNS = 20;

const NO_MARKDOWN_INSTRUCTION = `Write in plain conversational sentences and paragraphs only. Do NOT
use markdown formatting of any kind - no asterisks for bold or italics, no "#" headers, no markdown
bullet lists, no backticks. This chat displays plain text and also gets read aloud by text-to-speech,
so any formatting symbols would show up as literal characters or get read out loud. If you need to
list steps, just write "First, ... Then, ... Finally, ..." in plain sentences, or use plain numbers
like "1)" "2)" instead of markdown bullets.`;

const GENERAL_TUTOR_SYSTEM_PROMPT = `You are a patient, encouraging study tutor for Nigerian university
students, inside an app called CampusCrack. You are not tied to any specific uploaded material here -
students can ask about any topic, any course, any concept. Explain things simply, use examples where
helpful, and check understanding where it helps. If a student shares a photo of a textbook page,
handwritten notes, or a document, read it and help them with exactly what they're asking about it.
Keep answers conversational and not overly long - this is a chat, not an essay.

${NO_MARKDOWN_INSTRUCTION}`;

function buildMaterialSystemPrompt(
  materialText: string,
  courseCode: string | null,
  discipline: string | null,
  currentWeekContext: string | null
) {
  return `You are a patient, encouraging study tutor helping a Nigerian university student understand
their own course material inside an app called CampusCrack. ${courseCode ? `The course is ${courseCode}. ` : ''}${
    discipline ? `Discipline: ${discipline}. ` : ''
  }

Ground your answers in the study material below whenever the question relates to it - quote or
paraphrase the relevant part, then explain it simply, using examples where helpful. If the student
asks something the material doesn't cover, say so honestly before answering from general knowledge,
so they know when they're outside their own notes. If they share a photo or file in this chat, read
it and help with exactly what they're asking. Keep answers conversational and not overly long - this
is a chat, not an essay.
${currentWeekContext ? `\n${currentWeekContext}\n` : ''}
${NO_MARKDOWN_INSTRUCTION}

STUDY MATERIAL:
"""
${materialText.slice(0, 60000)}
"""`;
}

// If this material has a study plan, work out which week the student is
// currently on, so the tutor can proactively reference "this week's" focus
// even if the student didn't arrive here via the plan's "ask about this" link.
function getCurrentWeekNumber(startDate: string): number {
  const start = new Date(startDate);
  const today = new Date();
  const diffMs = today.getTime() - start.getTime();
  return Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000)) + 1;
}

export async function POST(req: Request) {
  const user = await getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { materialId, message, attachment } = (await req.json()) as {
    materialId?: string | null;
    message: string;
    attachment?: ChatAttachment;
  };

  const isGeneral = !materialId || materialId === 'general';

  if (!message?.trim() && !attachment) {
    return NextResponse.json({ error: 'message or attachment is required' }, { status: 400 });
  }

  const supa = supabaseServer();

  let material: { extracted_text: string; course_code: string | null; discipline: string | null } | null = null;
  let currentWeekContext: string | null = null;

  if (!isGeneral) {
    const { data, error: materialError } = await supa
      .from('materials')
      .select('id, user_id, extracted_text, course_code, discipline')
      .eq('id', materialId)
      .single();

    if (materialError || !data || data.user_id !== user.id) {
      return NextResponse.json({ error: 'Material not found' }, { status: 404 });
    }
    if (!data.extracted_text) {
      return NextResponse.json({ error: 'This material is still processing, try again shortly' }, { status: 409 });
    }
    material = data;

    // If this material has a study plan, work out the current week so the tutor can
    // reference it proactively, even without arriving via the plan's "ask about this" link.
    const { data: plan } = await supa
      .from('study_plans')
      .select('id, start_date, total_weeks')
      .eq('material_id', materialId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (plan) {
      const weekNum = getCurrentWeekNumber(plan.start_date);
      if (weekNum >= 1 && weekNum <= plan.total_weeks) {
        const { data: week } = await supa
          .from('study_plan_weeks')
          .select('topic, description, study_tip')
          .eq('study_plan_id', plan.id)
          .eq('week_number', weekNum)
          .maybeSingle();

        if (week) {
          currentWeekContext = `According to the student's study plan, this week's focus is: "${week.topic}".${
            week.description ? ` ${week.description}` : ''
          }${week.study_tip ? ` Suggested this week: ${week.study_tip}` : ''} Feel free to reference this if it's relevant to what they ask, without forcing it into every reply.`;
        }
      }
    }
  }

  const { data: profile } = await supa.from('profiles').select('is_premium').eq('id', user.id).single();

  if (!profile?.is_premium) {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const { count } = await supa
      .from('chat_messages')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('role', 'user')
      .gte('created_at', startOfToday.toISOString());

    if ((count || 0) >= FREE_CHAT_MESSAGES_PER_DAY) {
      return NextResponse.json(
        {
          error: 'paywall',
          message: `Free plan is capped at ${FREE_CHAT_MESSAGES_PER_DAY} chat messages a day. Unlock full access for ₦3,500 for unlimited chat.`,
        },
        { status: 402 }
      );
    }
  }

  let historyQuery = supa
    .from('chat_messages')
    .select('role, content')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(MAX_HISTORY_TURNS);

  historyQuery = isGeneral ? historyQuery.is('material_id', null) : historyQuery.eq('material_id', materialId as string);

  const { data: pastMessages } = await historyQuery;

  const history: ChatTurn[] = (pastMessages || [])
    .reverse()
    .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));

  const userMessageText = message?.trim() || (attachment ? '(shared a file)' : '');
  history.push({ role: 'user', content: userMessageText, attachment });

  await supa.from('chat_messages').insert({
    user_id: user.id,
    material_id: isGeneral ? null : materialId,
    role: 'user',
    content: attachment ? `${userMessageText} [attached file]` : userMessageText,
  });

  const system = isGeneral
    ? GENERAL_TUTOR_SYSTEM_PROMPT
    : buildMaterialSystemPrompt(material!.extracted_text, material!.course_code, material!.discipline, currentWeekContext);

  let reply: string;
  try {
    reply = await chatWithAI(system, history);
  } catch (err) {
    console.error('Chat AI error:', err);
    return NextResponse.json({ error: 'Could not get a reply, please try again' }, { status: 502 });
  }

  await supa.from('chat_messages').insert({
    user_id: user.id,
    material_id: isGeneral ? null : materialId,
    role: 'assistant',
    content: reply,
  });

  return NextResponse.json({ reply });
}
