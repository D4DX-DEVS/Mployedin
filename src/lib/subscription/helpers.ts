/**
 * Shared helpers for subscription lifecycle operations.
 */

import type { AIFeatureKey } from "@/models/SubscriptionPlan";
import type { ISubscriptionPlan } from "@/models/SubscriptionPlan";

// ── Billing cycle to duration map ────────────────────────────────────────────

const CYCLE_MS: Record<string, number> = {
  monthly: 30 * 24 * 60 * 60 * 1000,
  quarterly: 91 * 24 * 60 * 60 * 1000,
  yearly: 365 * 24 * 60 * 60 * 1000,
};

/** Calculate endDate from startDate + billingCycle. */
export function calcEndDate(startDate: Date, billingCycle: string): Date {
  const ms = CYCLE_MS[billingCycle] ?? CYCLE_MS.monthly;
  return new Date(startDate.getTime() + ms);
}

/** Next monthly usage-reset date (1st of next month). */
export function nextUsageReset(from: Date): Date {
  const d = new Date(from);
  d.setUTCMonth(d.getUTCMonth() + 1, 1);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/** Initialise aiUsage counters with 0 for every AI feature key. */
export function initAiUsage(): Record<string, number> {
  const keys: AIFeatureKey[] = [
    "ai_chat", "ai_daily_insights", "ai_job_matching", "ai_cv_extraction",
    "ai_interview_questions", "ai_skills_gap", "ai_candidate_screening",
    "ai_salary_benchmark", "ai_job_description", "ai_hiring_reports",
    "ai_voice_input", "ai_skills_suggest", "ai_profile_fill",
    "ai_enhance_text", "ai_generate_summary",
  ];
  return Object.fromEntries(keys.map((k) => [k, 0]));
}

/** Build a frozen planSnapshot from a SubscriptionPlan document. */
export function buildPlanSnapshot(plan: ISubscriptionPlan) {
  return {
    name: plan.name,
    tier: plan.tier,
    price: plan.price,
    currency: plan.currency,
    billingCycle: plan.billingCycle,
    employerLimits: plan.employerLimits ? JSON.parse(JSON.stringify(plan.employerLimits)) : undefined,
    jobSeekerLimits: plan.jobSeekerLimits ? JSON.parse(JSON.stringify(plan.jobSeekerLimits)) : undefined,
  };
}

/** Map subscription tier to legacy Employer.subscriptionType. */
export function tierToLegacyType(tier: number): "basic" | "premium" {
  return tier >= 2 ? "premium" : "basic";
}
