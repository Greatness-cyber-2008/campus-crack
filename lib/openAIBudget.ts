import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

/**
 * Server-side, application-wide OpenAI budget. Requires migration_018_openai_budget.sql.
 *
 * This is an ESTIMATE of what OpenAI will bill, kept by us. It is not the invoice. Always also
 * set a hard monthly limit in the OpenAI dashboard.
 */
const configuredCap = Number(process.env.OPENAI_MONTHLY_BUDGET_USD || '5.00');
const CONFIGURED_CAP_USD = Number.isFinite(configuredCap) ? Math.max(0.25, configuredCap) : 5.0;
// Held back from the cap, because our estimate can be a little low (rounding, tool charges, price changes).
const configuredMargin = Number(process.env.OPENAI_BUDGET_SAFETY_MARGIN_USD || '0.50');
const SAFETY_MARGIN_USD = Number.isFinite(configuredMargin) ? Math.max(0, configuredMargin) : 0.5;
const EFFECTIVE_CAP_USD = Math.max(0.1, CONFIGURED_CAP_USD - SAFETY_MARGIN_USD);

const configuredBaseline = Number(process.env.OPENAI_MONTHLY_SPEND_BASELINE_USD || '0');
const MONTHLY_SPEND_BASELINE_USD = Number.isFinite(configuredBaseline) ? Math.max(0, configuredBaseline) : 0;
const MONTHLY_SPEND_BASELINE_MONTH = process.env.OPENAI_MONTHLY_SPEND_BASELINE_MONTH || '';
const SAFETY_FACTOR = 1.25;
// Vercel kills the function at maxDuration (60s). Give up first so we can still record the cost.
const OPENAI_TIMEOUT_MS = 52_000;

export type BudgetErrorCode = 'budget_exhausted' | 'guard_unavailable';

/** Thrown when we refuse to call OpenAI. Routes turn this into a friendly "temporarily unavailable" reply. */
export class BudgetError extends Error {
  code: BudgetErrorCode;
  constructor(code: BudgetErrorCode, message: string) {
    super(message);
    this.name = 'BudgetError';
    this.code = code;
  }
}

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new BudgetError('guard_unavailable', 'OpenAI budget guard requires Supabase server configuration');
  return createClient(url, key, { auth: { persistSession: false } });
}

// USD per million tokens. Verified against OpenAI's pricing page for the gpt-6 family.
// Unknown models use deliberately high rates so a typo can't make spending look cheap.
function rates(model: string) {
  const m = model.toLowerCase();
  if (m === 'gpt-6-luna') return { input: 0.1, cached: 0.01, cacheWrite: 0.125, output: 0.5 };
  if (m === 'gpt-6.1-sol') return { input: 2, cached: 0.1, cacheWrite: 2.5, output: 10 };
  if (m === 'gpt-6-astra') return { input: 10, cached: 1, cacheWrite: 12.5, output: 50 };
  // Not on OpenAI's current pricing page — rates below are old/unverified, so treated as estimates.
  if (m === 'gpt-6-sol') return { input: 2, cached: 0.1, cacheWrite: 2.5, output: 10 };
  if (m === 'gpt-5.6-terra') return { input: 2, cached: 0.2, cacheWrite: 2.5, output: 12 };
  return { input: 20, cached: 2, cacheWrite: 25, output: 100 };
}

function estimateUsd(model: string, inputChars: number, maxOutputTokens: number) {
  const r = rates(model);
  const inputTokens = Math.ceil(Math.max(0, inputChars) / 3);
  return (((inputTokens * r.input) + (Math.max(1, maxOutputTokens) * r.output)) / 1_000_000) * SAFETY_FACTOR;
}

export function calculateOpenAICost(model: string, usage: any): number {
  const r = rates(model);
  const input = Number(usage?.input_tokens || 0);
  const output = Number(usage?.output_tokens || 0); // includes hidden reasoning tokens
  const cached = Math.min(input, Number(usage?.input_tokens_details?.cached_tokens || 0));
  const written = Math.min(Math.max(0, input - cached), Number(usage?.input_tokens_details?.cache_write_tokens || 0));
  const plain = Math.max(0, input - cached - written);
  return (plain * r.input + cached * r.cached + written * r.cacheWrite + output * r.output) / 1_000_000;
}

export async function callOpenAIWithBudget(args: {
  model: string;
  feature: string;
  inputChars: number;
  maxOutputTokens: number;
  body: Record<string, unknown>;
}): Promise<any> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is missing');
  const supa = getAdminClient();
  const requestId = randomUUID();
  // Web search is billed per call on top of tokens; reserve a little extra for it.
  const toolReserveUsd = Array.isArray(args.body.tools) && args.body.tools.length > 0 ? 0.02 : 0;
  const reserveUsd = estimateUsd(args.model, args.inputChars, args.maxOutputTokens) + toolReserveUsd;

  const { data: allowed, error: reserveError } = await supa.rpc('reserve_openai_budget', {
    p_request_id: requestId,
    p_reserve_usd: reserveUsd,
    p_monthly_cap_usd: EFFECTIVE_CAP_USD,
    p_monthly_spend_baseline_usd: MONTHLY_SPEND_BASELINE_USD,
    p_monthly_spend_baseline_month: MONTHLY_SPEND_BASELINE_MONTH,
    p_feature: args.feature,
  });
  if (reserveError) {
    // Fail closed: if we can't check the budget, we don't spend.
    console.error('OPENAI BUDGET GUARD UNAVAILABLE (is migration_018 applied?):', reserveError.message);
    throw new BudgetError('guard_unavailable', 'AI spending protection is temporarily unavailable.');
  }
  if (allowed !== true) {
    console.error('OPENAI BUDGET EXHAUSTED — new AI requests are blocked until next month or the cap is raised.');
    throw new BudgetError('budget_exhausted', 'The monthly AI budget has been reached.');
  }

  let response: Response;
  try {
    response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(args.body),
      signal: AbortSignal.timeout(OPENAI_TIMEOUT_MS),
    });
  } catch (error) {
    // We don't know whether OpenAI billed this call, so keep the full reservation as spent.
    await supa.rpc('settle_openai_budget', {
      p_request_id: requestId,
      p_actual_usd: reserveUsd,
      p_model: args.model,
      p_input_tokens: 0,
      p_cached_tokens: 0,
      p_output_tokens: 0,
      p_status: 'unknown_failure',
    });
    throw error;
  }

  const raw = await response.text();
  let data: any;
  try { data = raw ? JSON.parse(raw) : {}; } catch { data = {}; }
  const usage = data?.usage;

  let actualUsd: number;
  if (usage) {
    actualUsd = calculateOpenAICost(args.model, usage) + toolReserveUsd;
  } else if (response.ok || response.status >= 500) {
    actualUsd = reserveUsd; // can't tell what it cost → count the full reservation
  } else {
    actualUsd = 0; // 4xx rejected before running (bad request, rate limit): OpenAI doesn't bill these
  }

  const { error: settleError } = await supa.rpc('settle_openai_budget', {
    p_request_id: requestId,
    p_actual_usd: actualUsd,
    p_model: args.model,
    p_input_tokens: Number(usage?.input_tokens || 0),
    p_cached_tokens: Number(usage?.input_tokens_details?.cached_tokens || 0),
    p_output_tokens: Number(usage?.output_tokens || 0),
    p_status: response.ok ? 'succeeded' : 'failed',
  });
  if (settleError) console.error('OpenAI budget settlement failed:', settleError.message);
  if (!response.ok) {
    console.error(`OpenAI ${args.feature} error:`, raw.slice(0, 1500));
    throw new Error(`OpenAI ${args.feature} request failed`);
  }
  return data;
}
