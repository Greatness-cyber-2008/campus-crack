// The AI tends to put the correct answer in A or B far more often than C or D, which
// lets students guess by pattern. This runs after generation and rearranges each
// question's options so the correct answers are spread evenly across A-D.

type Option = { key: string; text: string };
type Q = { options?: Option[] | null; correct_option?: string | null; [k: string]: any };

const KEYS = ['A', 'B', 'C', 'D'];

// Options like "All of the above", "Both A and B" or "None of the above" only make sense in
// their original position, so those questions are left exactly as written.
const POSITIONAL = /(all|none|both|neither)\b.*\b(of the above|of these|of them)|\b(both|either|neither)\s+\(?[a-d]\)?\s+(and|or|nor)\s+\(?[a-d]\)?|\b[a-d]\s*(,|and|&)\s*[a-d]\b.*\b(only|above)|\b(options?|answers?)\s+\(?[a-d]\)?/i;

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function isMovable(q: Q): boolean {
  if (!q.options || q.options.length !== 4 || !q.correct_option) return false;
  if (!q.options.some((o) => o.key === q.correct_option)) return false;
  return !q.options.some((o) => POSITIONAL.test(o.text || ''));
}

export function balanceCorrectAnswers<T extends Q>(questions: T[]): T[] {
  const movable = questions.map((q, i) => (isMovable(q) ? i : -1)).filter((i) => i >= 0);
  if (movable.length === 0) return questions;

  // A balanced, shuffled list of target positions: A,B,C,D,A,B,C,D... then shuffled, so every
  // letter appears (almost) equally often but the order is unpredictable.
  const targets = shuffle(movable.map((_, i) => i % 4));

  const out = [...questions];
  movable.forEach((qi, n) => {
    const q = questions[qi];
    const options = q.options as Option[];
    const correct = options.find((o) => o.key === q.correct_option) as Option;
    const others = shuffle(options.filter((o) => o !== correct));
    const arranged: Option[] = [];
    let oi = 0;
    for (let pos = 0; pos < 4; pos++) {
      arranged.push(pos === targets[n] ? correct : others[oi++]);
    }
    out[qi] = {
      ...q,
      options: arranged.map((o, pos) => ({ key: KEYS[pos], text: o.text })),
      correct_option: KEYS[targets[n]],
    };
  });
  return out;
}
