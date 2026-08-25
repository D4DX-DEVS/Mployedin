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
  admin: "bg-red-100 text-red-700 border-red-200",
  super_agent:
    "bg-purple-100 text-purple-700 border-purple-200",
  agent:
    "bg-blue-100 text-blue-700 border-blue-200",
  employer:
    "bg-amber-100 text-amber-700 border-amber-200",
  job_seeker:
    "bg-emerald-100 text-emerald-700 border-emerald-200",
};

/** Generic good/warn/bad tier — match scores, health, completeness. */
export const TIER_COLORS = {
  good: "border-emerald-200 bg-emerald-50 text-emerald-700",
  warn: "border-amber-200 bg-amber-50 text-amber-700",
  bad: "border-border/70 bg-muted/20 text-muted-foreground",
} as const;

/** Score (0-100) → tier classes. Thresholds match existing AI match-score UI. */
export function scoreTier(score: number): string {
  if (score >= 70) return TIER_COLORS.good;
  if (score >= 50) return TIER_COLORS.warn;
  return TIER_COLORS.bad;
}
