// Per-student daily limits for PREMIUM users. Free users already have their own limits.
// Premium means "unlimited" for normal studying, but every AI call costs real money from one shared
// budget, so a generous daily cap stops one heavy account from using it all up.

export const PREMIUM_MAX_GENERATIONS_PER_DAY = parseInt(process.env.PREMIUM_MAX_GENERATIONS_PER_DAY || '15', 10);
export const PREMIUM_CHAT_MESSAGES_PER_DAY = parseInt(process.env.PREMIUM_CHAT_MESSAGES_PER_DAY || '100', 10);

// Midnight in Nigeria (UTC+1, no daylight saving), as an ISO string.
export function startOfLagosDayISO(): string {
  const lagosNow = new Date(Date.now() + 60 * 60 * 1000);
  lagosNow.setUTCHours(0, 0, 0, 0);
  return new Date(lagosNow.getTime() - 60 * 60 * 1000).toISOString();
}
