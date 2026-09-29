import { NextResponse } from 'next/server';
import { getUserFromRequest, supabaseServer } from '@/lib/supabaseServer';
import { chatWithAI, ChatTurn, ChatAttachment } from '@/lib/aiProvider';

export const maxDuration = 60;

const FREE_CHAT_MESSAGES_PER_DAY = parseInt(process.env.FREE_CHAT_MESSAGES_PER_DAY || '15', 10);
const MAX_HISTORY_TURNS = 20;

// Gives the model the real current date. Computed on every request so it never goes stale.
function getDateContext() {
  const now = new Date().toLocaleString('en-NG', {
    timeZone: 'Africa/Lagos',
    dateStyle: 'full',
    timeStyle: 'short',
  });
  return `Today's date and time is ${now} (Nigeria time). Treat this as the real current date. Never say it is 2024 and never call dates up to today "the future". If asked about news or recent events you have no reliable information on, say so honestly instead of guessing or inventing headlines.`;
}

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
  currentWeekContext: string | null,
  remediationContext: string | null = null
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
${currentWeekContext ? `\n${currentWeekContext}\n` : ''}${remediationContext ? `\n${remediationContext}\n` : ''}
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

async function buildRemediationContext(
  supa: ReturnType<typeof supabaseServer>,
  userId: string,
  materialId: string,
  questionId: string,
  attemptId: string
): Promise<string | null> {
  const { data: attempt } = await supa
    .from('attempts')
    .select('id, user_id, question_set_id')
    .eq('id', attemptId)
    .single();
  if (!attempt || attempt.user_id !== userId) return null;

  const { data: qset } = await supa
    .from('question_sets')
    .select('id, material_id, exam_mode')
    .eq('id', attempt.question_set_id)
    .single();
  if (!qset || qset.material_id !== materialId) return null;

  const { data: q } = await supa
    .from('questions')
    .select('prompt, options, correct_option, explanation, model_answer, marking_points, topic, question_set_id')
    .eq('id', questionId)
    .single();
  if (!q || q.question_set_id !== attempt.question_set_id) return null;

  const { data: a } = await supa
    .from('answers')
    .select('selected_option, is_correct, self_rating, written_response')
    .eq('attempt_id', attemptId)
    .eq('question_id', questionId)
    .maybeSingle();

  let details = `Question: ${q.prompt}\n`;
  if (q.topic) details += `Topic: ${q.topic}\n`;

  if (qset.exam_mode === 'cbt') {
    const options: { key: string; text: string }[] = q.options || [];
    details += `Options:\n${options.map((o) => `${o.key}) ${o.text}`).join('\n')}\n`;
    const chosen = options.find((o) => o.key === a?.selected_option);
    const correct = options.find((o) => o.key === q.correct_option);
    details += chosen
      ? `The student chose: ${chosen.key}) ${chosen.text}\n`
      : `The student did not answer this question.\n`;
    if (correct) details += `The correct answer: ${correct.key}) ${correct.text}\n`;
    if (q.explanation) details += `Explanation already shown to the student: ${q.explanation}\n`;
  } else {
    details += `The student wrote: ${a?.written_response || '(nothing)'}\n`;
    if (q.model_answer) details += `Model answer: ${q.model_answer}\n`;
    if (q.marking_points?.length) details += `Marking points: ${q.marking_points.join('; ')}\n`;
    if (a?.self_rating) details += `The student rated their own answer: ${a.self_rating.replace('_', ' ')}\n`;
  }

  return `REMEDIATION CONTEXT \u2014 the student opened this chat from their Results screen because they want help with one specific question they got wrong or only partly right:

${details}
How to respond: explain the underlying concept AND the most likely misconception that led to this mistake \u2014 do not just restate which option was correct. Base your explanation on the study material below wherever it covers this topic. If the material does not clearly cover it, say so plainly instead of guessing or inventing a source. Keep it short enough to read comfortably on a phone.`;
}

export async function POST(req: Request) {
  const user = await getUserFromRequest(req);
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { materialId, message, attachment, requestId, remediationQuestionId, remediationAttemptId } = (await req.json()) as {
    materialId?: string | null;
    message: string;
    attachment?: ChatAttachment;
    requestId?: string;
    remediationQuestionId?: string;
    remediationAttemptId?: string;
  };

  const isGeneral = !materialId || materialId === 'general';

  if (!message?.trim() && !attachment) {
    return NextResponse.json({ error: 'message or attachment is required' }, { status: 400 });
  }

  const supa = supabaseServer();

  // A retry can arrive after the first request finished but before the browser
  // received its response. Return the original reply instead of creating a duplicate.
  if (requestId) {
    const { data: previousReply } = await supa
      .from('chat_messages')
      .select('content')
      .eq('user_id', user.id)
      .eq('request_id', requestId)
      .eq('role', 'assistant')
      .maybeSingle();

    if (previousReply) return NextResponse.json({ reply: previousReply.content });
  }

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
    // Midnight in Nigeria (UTC+1, no daylight saving)
    const lagosNow = new Date(Date.now() + 60 * 60 * 1000);
    lagosNow.setUTCHours(0, 0, 0, 0);
    const startOfToday = new Date(lagosNow.getTime() - 60 * 60 * 1000);

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

  let remediationContext: string | null = null;
  if (!isGeneral && remediationQuestionId && remediationAttemptId) {
    remediationContext = await buildRemediationContext(supa, user.id, materialId as string, remediationQuestionId, remediationAttemptId);
  }

  const basePrompt = isGeneral
    ? GENERAL_TUTOR_SYSTEM_PROMPT
    : buildMaterialSystemPrompt(material!.extracted_text, material!.course_code, material!.discipline, currentWeekContext, remediationContext);
  const system = `${getDateContext()}\n\n${basePrompt}`;

  let reply: string;
  try {
    reply = await chatWithAI(system, history, { webSearch: isGeneral });
  } catch (err) {
    console.error('Chat AI error:', err);
    return NextResponse.json({ error: 'Could not get a reply, please try again' }, { status: 502 });
  }

  const { error: saveError } = await supa.from('chat_messages').insert([
    {
      user_id: user.id,
      material_id: isGeneral ? null : materialId,
      role: 'user',
      content: attachment ? `${userMessageText} [attached file]` : userMessageText,
      request_id: requestId || null,
    },
    {
      user_id: user.id,
      material_id: isGeneral ? null : materialId,
      role: 'assistant',
      content: reply,
      request_id: requestId || null,
    },
  ]);

  if (saveError) {
    // A concurrent retry may have saved the answer first. Return it if so.
    if (requestId) {
      const { data: previousReply } = await supa
        .from('chat_messages')
        .select('content')
        .eq('user_id', user.id)
        .eq('request_id', requestId)
        .eq('role', 'assistant')
        .maybeSingle();
      if (previousReply) return NextResponse.json({ reply: previousReply.content });
    }

    console.error('Chat save error:', saveError);
    return NextResponse.json({ error: 'Could not save this chat message, please try again' }, { status: 500 });
  }

  return NextResponse.json({ reply });
}