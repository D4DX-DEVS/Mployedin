/**
 * Poster Composer — Credits System
 * Monthly credit quotas for poster generation.
 */

import type { PosterCredits } from "./types";
import { PLAN_CREDIT_LIMITS } from "./types";

/**
 * Cost per generation action in credits.
 * 1 credit = 1 AI image. Initial generation = 2 images.
 */
export const CREDITS_PER_GENERATION = 2;
export const CREDITS_PER_MORE_VARIATIONS = 2;

/**
 * Check if employer has enough credits for a generation.
 */
export function hasCredits(credits: PosterCredits, required: number): boolean {
  return (credits.limit - credits.used) >= required;
}

/**
 * Get remaining credits.
 */
export function remainingCredits(credits: PosterCredits): number {
  return Math.max(0, credits.limit - credits.used);
}

/**
 * Get the credit limit for a subscription plan.
 */
export function getCreditLimitForPlan(plan: string | undefined): number {
  return PLAN_CREDIT_LIMITS[plan || "free"] ?? PLAN_CREDIT_LIMITS.free;
}

/**
 * Calculate the next reset date (1st of next month).
 */
export function getNextResetDate(): Date {
  const now = new Date();
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return nextMonth;
}

/**
 * Check if credits should be reset (past the reset date).
 */
export function shouldResetCredits(credits: PosterCredits): boolean {
  return new Date() >= new Date(credits.resetDate);
}
