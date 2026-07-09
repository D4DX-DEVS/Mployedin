/**
 * Central color maps for status/role badges. Use these instead of
 * per-page hardcoded palette maps so theme + dark mode stay consistent.
 * Application statuses use the --status-* theme tokens from tailwind.config.ts.
 */

export const APPLICATION_STATUS_COLORS: Record<string, string> = {
  applied: "bg-status-applied-bg text-status-applied border-status-applied/30",
  shortlisted:
    "bg-status-shortlisted-bg text-status-shortlisted border-status-shortlisted/30",
  interview:
    "bg-status-interview-bg text-status-interview border-status-interview/30",
  selected: "bg-status-selected-bg text-status-selected border-status-selected/30",
  rejected: "bg-status-rejected-bg text-status-rejected border-status-rejected/30",
  pending: "bg-status-pending-bg text-status-pending border-status-pending/30",
};

export const ROLE_COLORS: Record<string, string> = {
  admin: "bg-red-100 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900/60",
  super_agent:
    "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-900/60",
  agent:
    "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900/60",
  employer:
    "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/60",
  job_seeker:
    "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/60",
};

/** Generic good/warn/bad tier — match scores, health, completeness. */
export const TIER_COLORS = {
  good: "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300",
  warn: "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-300",
  bad: "border-border/70 bg-muted/20 text-muted-foreground",
} as const;

/** Score (0-100) → tier classes. Thresholds match existing AI match-score UI. */
export function scoreTier(score: number): string {
  if (score >= 70) return TIER_COLORS.good;
  if (score >= 50) return TIER_COLORS.warn;
  return TIER_COLORS.bad;
}
