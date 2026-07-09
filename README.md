# CampusCrack

Upload your notes → generate CBT or written exam-style practice questions, tuned to your
discipline (Computing, Medical, Commercial, Engineering, Law, Science, Arts) → practice under
real exam conditions → see exactly where you lost marks.

Built with Next.js 14 (App Router), Supabase (auth + Postgres + storage), Anthropic Claude for
question generation, and Paystack for payments — same stack pattern as your other projects.

## 1. Supabase setup

1. Create a new Supabase project (or reuse an existing one).
2. Open the SQL editor and run the entire contents of `supabase/schema.sql`. This creates:
   - `profiles`, `materials`, `question_sets`, `questions`, `attempts`, `answers`, `payments` tables
   - Row Level Security policies so users can only ever see their own data
   - A `materials` storage bucket (private) with per-user folder policies
   - A trigger that auto-creates a `profiles` row whenever someone signs up
3. In **Project Settings → API**, copy:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (keep this secret — server only)

## 2. AI provider setup — free option, no card needed

By default this app uses **Google Gemini**, which has a genuinely free tier — no credit card,
no trial period that expires. This is the recommended way to start if you don't want to spend
anything yet:

1. Go to **aistudio.google.com/apikey**, sign in with a Google account, click **Create API key**
2. Copy it into `.env.local` as `GEMINI_API_KEY`
3. Leave `AI_PROVIDER=gemini` as-is (it's the default)

That's it — no billing setup, generation and OCR fallback both work immediately.

**Switching to Claude later** (once the app has revenue and you want Claude's quality on
harder discipline-specific questions): get a key from console.anthropic.com, add billing there,
then just change `AI_PROVIDER=anthropic` in your env vars and fill in `ANTHROPIC_API_KEY`. No
code changes needed — `lib/aiProvider.ts` and `lib/ocrFallback.ts` both read this one variable
to decide which provider to call.

One trade-off to know about: on Gemini's free tier, Google's terms allow using your prompts to
improve their models. Fine for testing; something to revisit once real students' study material
is flowing through the app — Anthropic's paid API does not train on your data by default, nor
does Gemini's *paid* tier.

## 3. Paystack setup

1. Get your test keys from https://dashboard.paystack.com/#/settings/developer
2. Set `NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY` and `PAYSTACK_SECRET_KEY`
3. When ready to go live, swap in your live keys.

Note: payments are verified server-side in `app/api/paystack/verify/route.ts` against Paystack's
API directly — the client-side "success" callback is never trusted on its own. This protects you
from the kind of billing complaints ExamCrush gets in its reviews (unclear/hard-to-cancel charges) —
CampusCrack uses a single one-time unlock, not an auto-renewing subscription, by design.

## 4. Local development

```bash
npm install
cp .env.example .env.local   # fill in the values above
npm run dev
```

## 5. Deploy to Vercel

1. Push this repo to GitHub.
2. Import it in Vercel.
3. Add all variables from `.env.example` in Vercel's Environment Variables settings.
4. Deploy.

### Fixing the OCR timeout on the free Hobby plan (no Vercel Pro needed)

Scanned/image PDFs go through Claude's vision OCR fallback (see below), which can take
20-40 seconds — longer than Vercel's default 10-second Hobby timeout. You do **not** need
Vercel Pro to fix this:

1. In your Vercel project → **Settings → Functions**, turn on **Fluid Compute**. It's free on
   the Hobby plan and raises the max function duration ceiling to 300 seconds.
2. Fluid Compute also only bills/counts *active CPU time* — time your code spends waiting on
   an external API call (like the OCR request to Claude) doesn't count against your usage.
   Since this route is ~95% "waiting for Claude to respond," it stays well within Hobby's free
   allowance even at 30-40 seconds wall-clock time.
3. `app/api/extract/route.ts` already sets `export const maxDuration = 120`, comfortably under
   Fluid Compute's 300s ceiling — you don't need to change anything in code, just flip the
   toggle in the dashboard.
4. As a second safety net, the route also rejects scanned PDFs over 40 pages *before* attempting
   OCR (`MAX_OCR_PAGES` in `app/api/extract/route.ts`), with a message asking the student to
   split the file. This avoids students being stuck on a spinner for a document too long to
   process reliably in one request. Tune this constant if you find 40 is too conservative once
   you see real usage.

If Fluid Compute isn't visible on your account for some reason, the fallback is to cap
`MAX_OCR_PAGES` lower (e.g. 15-20) so any single OCR call reliably finishes inside 10 seconds —
you'll process fewer pages per scanned upload, but nothing times out.

## How the core flow works

1. **Upload** (`/upload`) — file goes to Supabase Storage under `materials/{userId}/...`, a `materials`
   row is created, then `/api/extract` pulls text out of the PDF (via `pdf-parse`) or reads the raw
   text file, and stores it as `extracted_text`.
   - **Scanned/image-only PDFs**: if `pdf-parse` extracts almost nothing (a strong signal the PDF has
     no real text layer — e.g. photographed lecture notes), the route falls back to sending the raw
     PDF bytes to Claude directly (`lib/ocrFallback.ts`), which reads the pages as images and
     transcribes them. No separate OCR service needed. Capped at 40 pages per file (`MAX_OCR_PAGES`)
     to keep each request comfortably inside the Vercel timeout — see the Fluid Compute section above.
2. **Configure** (`/generate`) — user picks CBT or Written, discipline, difficulty, question count
   (and time limit for CBT). This calls `/api/generate`.
3. **Generate** (`/api/generate/route.ts`) — builds a discipline + exam-mode aware prompt
   (see `lib/promptBuilder.ts` — this is the main differentiator vs. generic quiz tools) and calls
   Claude. The response is parsed as strict JSON and saved as `question_sets` + `questions` rows.
4. **Practice**:
   - CBT (`/practice/cbt/[setId]`) — timed, one question at a time, auto-submits when the timer runs out.
   - Written (`/practice/written/[setId]`) — student writes an answer, reveals the model answer +
     marking points, then self-rates (nailed it / close / missed) since AI grading of free-text
     answers is unreliable enough that self-grading against clear marking points is more trustworthy.
5. **Results** (`/results/[attemptId]`) — the stamped score badge, plus a full breakdown per question.
6. **Community sets** (`/browse`) — any student can mark their own generated set "Shared with course"
   from `/library`, which flips `question_sets.is_public = true`. Other students can then browse and
   practice it for free (practicing a public set never touches anyone's free-generation count). The
   original uploader's raw material text stays private — only the generated question set is shared,
   never the source PDF or its extracted text.
7. **Chat** (`/chat/[materialId]` or `/chat/general`) — a conversational tutor, either grounded in a
   specific uploaded material (answers reference that material's actual content) or in "general" mode
   (not tied to any upload, for open-ended questions). Built on `lib/aiProvider.ts`'s `chatWithAI`,
   which is separate from the one-shot JSON generation used for practice sets — chat replies are plain
   conversational text with real multi-turn history.
   - **Voice**: uses the browser's own built-in Web Speech API for both input (microphone → text) and
     output (text → spoken reply). No new API key, no extra cost — it's entirely client-side in
     `app/chat/[materialId]/page.tsx`. Chrome/Android support is solid; Safari/iOS speech-to-text
     support is weak or absent, so the mic button is feature-detected and hidden if unsupported.
   - **Photos/files in chat**: a student can attach an image or PDF directly in the chat input. It's
     converted to base64 client-side and sent to Gemini/Claude as a multimodal message (see
     `ChatAttachment` in `lib/aiProvider.ts`). Important trade-off: attachments are analyzed **in the
     moment only** — the raw file is never uploaded to storage or persisted, only a text placeholder
     ("📎 [attached file]") is saved in `chat_messages`. If a student wants to reference the same photo
     in a future session, they need to re-attach it. Full permanent storage of chat attachments would
     need a new storage bucket + RLS policies (similar to the `materials` bucket) — a reasonable next
     step if this turns out to matter, not included in this pass.
   - Free tier: `FREE_CHAT_MESSAGES_PER_DAY` (default 15) shared across general + material-grounded
     chat combined. Full access is unlimited.
8. **Analytics** (`/analytics`) — a score trend chart across all completed attempts, plus a "weakest
   topics" breakdown. This relies on each generated question having a short `topic` label (see
   `lib/promptBuilder.ts`'s `topicInstruction`), which the AI assigns at generation time based on the
   material's actual structure. Older question sets generated before this feature won't have topics,
   so their answers are silently excluded from the topic breakdown (they still count toward the score
   trend, since that only needs `attempts.score`). Topics need at least 2 answered questions
   (`MIN_QUESTIONS_PER_TOPIC` in `app/analytics/page.tsx`) before they're shown, to avoid drawing
   conclusions from a single question. CBT answers are scored 100/0 (correct/incorrect); written
   answers use the student's own self-rating (nailed it = 100, close = 50, missed = 0) as a proxy,
   since there's no automated grading of free-text answers.
9. **Streaks** — `profiles.current_streak` and `longest_streak` update automatically via a shared
   Postgres function (`bump_streak` in `supabase/schema.sql`), called from triggers on both `attempts`
   (submitting a full CBT/Written set) and `flashcard_progress` (reviewing even a single flashcard).
   This matters because full exam-set completions are rare mid-semester — flashcard reviews are what
   actually keep a streak alive outside exam season. The trigger runs server-side, so it can't be
   bypassed or double-counted from the client. The streak badge shows on the dashboard whenever
   `current_streak > 0`.
10. **Flashcards** (`/flashcards`, `/flashcards/generate`, `/flashcards/[setId]`) — short front/back
    cards for daily spaced-repetition review, deliberately separate from exam practice (CBT/Written).
    This is the main answer to "the app only gets used during exam week" — a student reviews 10-20
    cards a day across the whole semester instead of opening the app only once before an exam.
    - **Generation**: `lib/promptBuilder.ts`'s `buildFlashcardPrompt` asks the AI for short, isolated
      front/back pairs (not paragraphs) tagged with the same `topic` labeling used for analytics.
      Shares the same free-generation counter as practice sets (`FREE_GENERATIONS_LIMIT`) — it's still
      one AI generation call either way.
    - **Spaced repetition**: a simple interval ladder, not full SM-2 — `again` resets to 1 day, `hard`
      multiplies the interval by 1.2x, `good` by 2x, `easy` by 2.5x (see `nextInterval` in
      `app/flashcards/[setId]/page.tsx`). Deliberately simple over "correct" — easy to reason about
      and to tune later if it doesn't feel right in practice.
    - `flashcard_progress` stores one row per (user, flashcard) with `next_review_date` — a card is
      "due" if that date has passed or no progress row exists yet (never reviewed).
    - Not yet integrated into the `/analytics` weak-topics view, even though flashcards use the same
      `topic` tagging as practice questions — combining both into one weak-topics picture is a
      reasonable next step once flashcards have real usage data to justify it.

## Pricing model: free tier vs. ₦3,500 full access

- **Free**: 3 total generations, CBT mode only, capped at 10 questions per set. Practicing
  community-shared sets is always free and unlimited, regardless of plan — this is your growth loop.
- **Full access (₦3,500 one-time)**: unlimited generations, written/theory mode unlocked, up to 50
  questions per set.
- Enforcement lives server-side in `app/api/generate/route.ts` (never trust client-side checks alone) —
  the UI in `/generate` mirrors the same limits so free users see the lock before they hit the API,
  but the API re-checks regardless of what the client sends.
- `profiles.is_premium` is what gates access; it's flipped to `true` in `/api/paystack/verify` only
  after the payment is confirmed server-side against Paystack's API.
- Both `FREE_GENERATIONS_LIMIT` and `FREE_MAX_QUESTIONS_PER_SET` are env vars if you want to tune the
  free tier later without a code change.

## Things worth building next (not in this pass)

- Push/email reminders and streaks
- Per-set unlock pricing for a single set without buying full access (the `payments.purpose =
  'set_unlock'` path and `question_sets.is_locked` column already exist in the schema for this —
  just needs a UI trigger; skipped in favor of the simpler single ₦3,500 unlock for now)
- Reporting/moderation on community-shared sets before they scale
- Analytics dashboard showing weak topics over time across multiple attempts
