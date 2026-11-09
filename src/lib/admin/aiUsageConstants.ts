/** Shared by the AI usage page and its API. No server imports: client components read this. */
export const AI_USAGE_GROUPS = ["employer", "super_agent", "agent", "jobseeker"] as const;
export type AiUsageGroup = (typeof AI_USAGE_GROUPS)[number];

export const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
