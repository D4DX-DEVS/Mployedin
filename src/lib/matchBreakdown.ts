/**
 * Tells a real component breakdown apart from the legacy placeholder.
 *
 * Before the scoring fix, `/api/ai/match` persisted `{ skills: 0, experience: 0,
 * overall: <real score> }` — hardcoded zeroes beside a genuine headline score.
 * Those documents are still in the database, and they render as "Skills 0% /
 * Experience 0%" under an "85% Excellent" badge: two numbers that cannot both
 * be true. A row like that was never measured, so it is shown as unmeasured
 * and offered a re-score instead.
 */
export interface MatchBreakdown {
  skills?: number;
  experience?: number;
  location?: number;
  salary?: number;
  overall?: number;
}

/** The component keys shown to users — `overall` only repeats the headline. */
export const MATCH_COMPONENT_KEYS = ["skills", "experience", "location", "salary"] as const;

/**
 * True when the breakdown carries at least one recorded component score.
 *
 * An all-zero breakdown under a non-zero headline score is the legacy
 * placeholder, not a candidate who scored zero on everything.
 */
export function isBreakdownMeasured(breakdown?: MatchBreakdown | null, score?: number | null): boolean {
  if (!breakdown) return false;
  const values = MATCH_COMPONENT_KEYS
    .map((key) => breakdown[key])
    .filter((value): value is number => typeof value === "number");
  if (values.length === 0) return false;
  if (values.some((value) => value > 0)) return true;
  // Every component is zero: real only if the headline agrees it is a zero match.
  return !score;
}
