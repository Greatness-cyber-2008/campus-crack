// This file is the "secret sauce" of CampusCrack: it tailors question
// generation to (a) the exam format Nigerian university students actually
// sit, and (b) the way each discipline actually examines students.

export type Discipline =
  | 'computing'
  | 'medical'
  | 'commercial'
  | 'science'
  | 'arts'
  | 'law'
  | 'engineering'
  | 'general';

export type ExamMode = 'cbt' | 'written';
export type Difficulty = 'easy' | 'medium' | 'hard' | 'mixed';

interface BuildPromptArgs {
  extractedText: string;
  discipline: Discipline;
  examMode: ExamMode;
  difficulty: Difficulty;
  questionCount: number;
  courseCode?: string;
}

const DISCIPLINE_GUIDANCE: Record<Discipline, string> = {
  computing: `
- Where the material covers algorithms, code, networking, or systems, write questions that require tracing logic,
  predicting output, identifying bugs, or choosing the correct complexity/protocol — not just definitions.
- Include short code or pseudocode snippets in questions where relevant (format as inline monospace text).
- For CBT: distractors should be answers a student gets from a common logic mistake (off-by-one, wrong Big-O, wrong OSI layer), not random wrong facts.`,
  medical: `
- Frame questions as short clinical vignettes or case scenarios where the material supports it (patient presentation,
  then "what is the most likely..." / "what is the next best step..."), mirroring how medical/nursing exams actually test.
- For CBT: distractors should be clinically plausible differentials or adjacent drugs/conditions, not obviously wrong options.
- For written mode: expect answers structured the way clinical answers are graded — definition, mechanism/pathophysiology, then application.`,
  commercial: `
- Where the material includes figures, ratios, or formulas (accounting, economics, finance, business law), include
  calculation-based questions with clean numbers, not just theory recall.
- For written mode: structure model answers the way commercial subjects are marked — state the principle/formula,
  show the working, state the conclusion.
- Balance theory questions (definitions, principles) with applied/calculation questions roughly evenly.`,
  science: `
- Where relevant, include questions that require applying a formula or interpreting a described experiment/graph,
  not only stating facts.
- For written mode, model answers should show working/derivation, not just a final statement.`,
  arts: `
- Favor questions testing comprehension, interpretation, and argument structure over rote recall.
- For written mode, model answers should demonstrate how to build a structured argument with evidence from the material.`,
  law: `
- Where the material covers cases, statutes, or principles, frame questions using short fact patterns ("X does Y — is this...")
  the way law exams test application of a rule, not just naming the rule.
- For written mode, model answers should follow the issue-rule-application-conclusion structure.`,
  engineering: `
- Include questions requiring calculation, unit handling, or diagram/system interpretation where the material supports it.
- For written mode, model answers should show full working with units, not just final numeric answers.`,
  general: `
- Balance recall questions with a few applied "what would happen if..." questions so the set isn't pure memorization.`,
};

const CBT_FORMAT_INSTRUCTIONS = `
Generate CBT-style multiple choice questions, matching the format of computer-based tests used in Nigerian
university and professional exams (JAMB/WAEC/university CBT style):
- Each question has exactly 4 options labeled A, B, C, D.
- Exactly one option is correct.
- Distractors must be plausible — never obviously silly — so the question actually tests understanding.
- Keep each question answerable within roughly 60-90 seconds (CBT time pressure).
- Provide a one-to-two sentence explanation of why the correct answer is right, referencing the source material.`;

const WRITTEN_FORMAT_INSTRUCTIONS = `
Generate written/theory exam-style questions, matching how Nigerian university written exams are actually marked:
- Each question should be answerable in a structured paragraph or short essay, not one line.
- Provide a model answer AND a breakdown of 3-5 discrete "marking points" a student should hit to score full marks —
  this is what the student will use to self-grade, so make the marking points specific and checkable, not vague.
- Vary question command words appropriately (define, explain, discuss, differentiate, analyze, evaluate) rather than
  using "explain" for everything.`;

export function buildStudyPlanPrompt({
  extractedText,
  totalWeeks,
  courseCode,
}: {
  extractedText: string;
  totalWeeks: number;
  courseCode?: string;
}): { system: string; user: string } {
  const system = `You are helping a Nigerian university student break a course's material into a
week-by-week study plan for CampusCrack. The goal is to keep them engaged with the course all
semester, not just before exams. Base the plan strictly on the actual structure and content of the
material provided — its sections, chapters, or topic groupings — not generic filler. You must respond
with ONLY valid JSON — no markdown fences, no preamble, no commentary.`;

  const user = `Course code: ${courseCode || 'Not specified'}
Total weeks in the semester: ${totalWeeks}

Break the study material below into exactly ${totalWeeks} weeks:
- If the material has more distinct sections/topics than weeks, group closely related ones together
  into the same week.
- If it has fewer sections than weeks, split larger sections across multiple weeks rather than
  leaving weeks empty or repeating content.
- Each week needs a short "topic" (3-8 words) and a 1-2 sentence "description" of what it covers.
- Each week also needs a "study_tip": one concrete, actionable sentence telling the student exactly
  what to DO that week — not a restatement of the topic. Examples: "Make flashcards for the five key
  terms in this section before Friday" or "This week builds directly on last week's material — review
  your notes on that first if it felt shaky." Vary the tips; don't make them all the same shape.
- Order weeks the way the material is actually structured (assume it's already in a sensible order).

Respond with ONLY this exact JSON shape:
{
  "weeks": [
    {"week_number": 1, "topic": "string", "description": "string", "study_tip": "string"}
  ]
}

STUDY MATERIAL:
"""
${extractedText.slice(0, 60000)}
"""`;

  return { system, user };
}

export function buildFlashcardPrompt({
  extractedText,
  discipline,
  courseCode,
  cardCount,
}: {
  extractedText: string;
  discipline: Discipline;
  courseCode?: string;
  cardCount: number;
}): { system: string; user: string } {
  const system = `You are creating spaced-repetition flashcards for a Nigerian university student, for an
app called CampusCrack. Flashcards are for daily review across a whole semester, not exam cramming —
each card should isolate ONE clear fact, term, or concept so it's quick to review in a few seconds.
Never invent facts not supported by the material. You must respond with ONLY valid JSON — no markdown
fences, no preamble, no commentary.`;

  const user = `Course code / topic: ${courseCode || 'Not specified'}
Discipline: ${discipline}
Requested card count: ${cardCount}

Generate flashcards from the study material below:
- "front" is a short term, question, or prompt (e.g. "What is a firewall?", "OSI Layer 3")
- "back" is a concise answer — 1-3 sentences, not a paragraph. Long explanations don't work as
  flashcards; if a concept genuinely needs more than that, split it into multiple cards instead.
- Every card needs a short "topic" label (2-5 words), using CONSISTENT names across cards that cover
  the same underlying concept — this is used to track weak topics over time.
- Cover the material's actual range of concepts rather than clustering on one section.

Respond with ONLY this exact JSON shape:
{
  "flashcards": [
    {"front": "string", "back": "string", "topic": "string"}
  ]
}

STUDY MATERIAL (source of truth — base every card on this content):
"""
${extractedText.slice(0, 60000)}
"""`;

  return { system, user };
}

export function buildGenerationPrompt({
  extractedText,
  discipline,
  examMode,
  difficulty,
  questionCount,
  courseCode,
}: BuildPromptArgs): { system: string; user: string } {
  const formatInstructions = examMode === 'cbt' ? CBT_FORMAT_INSTRUCTIONS : WRITTEN_FORMAT_INSTRUCTIONS;
  const disciplineNote = DISCIPLINE_GUIDANCE[discipline] || DISCIPLINE_GUIDANCE.general;

  const difficultyNote =
    difficulty === 'mixed'
      ? 'Mix difficulty: roughly 30% easy/recall, 40% medium/application, 30% hard/analysis.'
      : `All questions should be ${difficulty} difficulty.`;

  const system = `You are an exam-setting assistant for a Nigerian university study app called CampusCrack.
You generate exam-realistic practice questions strictly from the study material a student uploads.
Never invent facts that aren't supported by the material. If the material is too thin to support the
requested number of quality questions, generate fewer rather than padding with filler questions.
You must respond with ONLY valid JSON — no markdown fences, no preamble, no commentary.`;

  const jsonShape =
    examMode === 'cbt'
      ? `{
  "questions": [
    {
      "prompt": "string",
      "topic": "string",
      "options": [{"key":"A","text":"string"}, {"key":"B","text":"string"}, {"key":"C","text":"string"}, {"key":"D","text":"string"}],
      "correct_option": "A",
      "explanation": "string"
    }
  ]
}`
      : `{
  "questions": [
    {
      "prompt": "string",
      "topic": "string",
      "model_answer": "string",
      "marking_points": ["string", "string", "string"]
    }
  ]
}`;

  const topicInstruction = `Every question needs a short "topic" label (2-5 words, e.g. "Network Security - Firewalls",
"OOP - Inheritance", "Cardiac Physiology"). Use CONSISTENT topic names when multiple questions cover
the same underlying concept — this labeling is used to track which topics a student is weak in across
many practice sessions, so consistency matters more than variety. Base topics on the actual structure
of the study material (its sections/subsections), not generic labels.`;

  const user = `Course code / topic: ${courseCode || 'Not specified'}
Discipline: ${discipline}
Requested question count: ${questionCount}
Difficulty: ${difficulty}

${formatInstructions}

${topicInstruction}

Discipline-specific guidance:
${disciplineNote}

${difficultyNote}

Respond with ONLY this exact JSON shape:
${jsonShape}

STUDY MATERIAL (source of truth — base every question on this content):
"""
${extractedText.slice(0, 60000)}
"""`;

  return { system, user };
}
