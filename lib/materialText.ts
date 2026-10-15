// Combines several uploaded files into one block of source text for question
// generation, giving each file a fair share of the budget so a big first PDF
// can't crowd out the rest. Files shorter than their share keep everything and
// hand the leftover to the longer ones. A file that's still too long is sampled
// from evenly spaced windows across the whole document (not just its opening
// pages), so later chapters get covered too.

export interface SourceMaterial {
  title: string;
  text: string;
}

const WINDOWS = 6;

function sampleEvenly(text: string, budget: number): string {
  if (text.length <= budget) return text;
  const windowSize = Math.floor(budget / WINDOWS);
  const stride = (text.length - windowSize) / (WINDOWS - 1);
  const parts: string[] = [];
  for (let i = 0; i < WINDOWS; i++) {
    const start = Math.floor(i * stride);
    parts.push(text.slice(start, start + windowSize));
  }
  return parts.join('\n[…]\n');
}

export function combineMaterials(materials: SourceMaterial[], totalBudget: number): string {
  const n = materials.length;
  // Water-filling: shortest files first, each gets min(its length, equal share of what's left).
  const order = materials.map((_, i) => i).sort((a, b) => materials[a].text.length - materials[b].text.length);
  const budgets: number[] = new Array(n).fill(0);
  let remaining = totalBudget;
  order.forEach((idx, pos) => {
    const share = Math.floor(remaining / (n - pos));
    budgets[idx] = Math.min(materials[idx].text.length, share);
    remaining -= budgets[idx];
  });

  return materials
    .map((m, i) => `=== SOURCE ${i + 1} of ${n}: ${m.title} ===\n${sampleEvenly(m.text, budgets[i])}`)
    .join('\n\n');
}
