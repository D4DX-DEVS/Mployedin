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

/**
 * Is a boolean-style plan toggle switched on?
 *
 * Most toggles are real booleans, but a few are graded strings — `analyticsLevel`
 * is "none" | "basic" | "advanced". A plain truthiness test treated the string
 * "none" as enabled, so the analytics gate passed on every plan. Grade strings
 * explicitly; anything else falls back to truthiness.
 */
export function isToggleEnabled(value: unknown): boolean {
  if (typeof value === "string") return value !== "" && value !== "none";
  return !!value;
}

/**
 * Which customer role each numeric limit belongs to. The plan schema keeps
 * employer and job-seeker limits in separate objects, so a limit is only ever
 * meaningful for one of them: a job seeker listing their own applications is
 * not "viewing applications" against an employer cap, and must not have that
 * counter reserved on their subscription. Staff roles never reach a gate.
 */
export const LIMIT_FEATURE_ROLE = {
  activeJobs: "employer",
  applicationsViewed: "employer",
  teamMembers: "employer",
  applicationsSubmitted: "job_seeker",
} as const satisfies Record<string, "employer" | "job_seeker">;

export type LimitFeature = keyof typeof LIMIT_FEATURE_ROLE;

/** True when `feature` is a numeric limit that applies to `targetRole`. */
export function isLimitFeatureForRole(feature: string, targetRole: "employer" | "job_seeker"): boolean {
  return (LIMIT_FEATURE_ROLE as Record<string, string>)[feature] === targetRole;
}

/** Map subscription tier to legacy Employer.subscriptionType. */
export function tierToLegacyType(tier: number): "basic" | "premium" {
  return tier >= 2 ? "premium" : "basic";
}
