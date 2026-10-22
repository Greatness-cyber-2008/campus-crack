import { NextResponse } from 'next/server';
import { BudgetError } from '@/lib/openAIBudget';

// One place that decides what a student sees when the AI call fails. If we deliberately paused
// the AI to protect the budget, say so (and use 503) instead of a generic "please try again",
// which just makes students retry over and over.
export function aiFailureResponse(err: unknown, genericMessage: string) {
  if (err instanceof BudgetError) {
    return NextResponse.json(
      {
        error: 'CampusCrack is catching its breath — AI features are temporarily paused. Please try again later today or tomorrow. Your work and access are safe.',
        code: 'ai_unavailable',
      },
      { status: 503 }
    );
  }
  return NextResponse.json({ error: genericMessage }, { status: 502 });
}
