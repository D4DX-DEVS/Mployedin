/**
 * The one definition of "how complete is this job seeker's profile".
 *
 * The same nine-field formula used to be pasted into four places
 * (`/api/job-seeker/profile`, `/api/job-seeker/skill-confirmations`,
 * `/api/ai/cv-extract`, and by extension the AI fill routes), and three other
 * endpoints that write seeker fields — `/api/job-seekers/settings`,
 * `/api/job-seekers/profile`, registration — never recomputed it at all. The
 * result was a stored `profileCompleteness` that drifted away from what the
 * profile page shows: 23 live seekers sat at a stored 0 while the page
 * rendered 10–25% for the very same document, and the daily
 * profile-completion email mailed them that stale 0 ("Your profile is 0%
 * complete", "00 actions completed").
 *
 * Read the score with `profileCompletenessScore`; anything that wants to *show*
 * what is still missing (the reminder email) uses `profileCompleteness` and
 * gets the per-field breakdown instead of re-deriving it from the number.
 */

/** A stable id per scored field. Used by the reminder email to pick copy. */
export type ProfileCompletenessKey =
  | "userId"
  | "nationality"
  | "currentLocation"
  | "summary"
  | "skills"
  | "experience"
  | "education"
  | "languages"
  | "linkedin";

export interface ProfileCompletenessItem {
  key: ProfileCompletenessKey;
  /** Points this field contributes to the 0–100 score. */
  weight: number;
  done: boolean;
}

export interface ProfileCompletenessResult {
  /** 0–100, the value persisted to `JobSeeker.profileCompleteness`. */
  score: number;
  items: ProfileCompletenessItem[];
  /** Items already satisfied. Its length is the honest "actions completed". */
  done: ProfileCompletenessItem[];
  /** Items still outstanding, heaviest first — what to actually ask for. */
  missing: ProfileCompletenessItem[];
  /** Total number of scored fields. The honest denominator. */
  total: number;
}

/** The shape this reads. Every field optional — lean docs and plain objects both fit. */
export interface ProfileCompletenessInput {
  userId?: unknown;
  nationality?: unknown;
  currentLocation?: unknown;
  summary?: unknown;
  headline?: unknown;
  skills?: unknown;
  experience?: unknown;
  education?: unknown;
  languages?: unknown;
  linkedin?: unknown;
  socialLinks?: unknown;
}

const WEIGHTS: Array<{ key: ProfileCompletenessKey; weight: number }> = [
  { key: "userId", weight: 10 },
  { key: "nationality", weight: 10 },
  { key: "currentLocation", weight: 5 },
  { key: "summary", weight: 10 },
  { key: "skills", weight: 20 },
  { key: "experience", weight: 20 },
  { key: "education", weight: 15 },
  { key: "languages", weight: 5 },
  { key: "linkedin", weight: 5 },
];

/** Number of scored fields. Exported so callers never hardcode a denominator. */
export const PROFILE_COMPLETENESS_FIELD_COUNT = WEIGHTS.length;

/**
 * Mongo projection covering every field the formula reads. Use it at any call
 * site that scores a *projected* document — a field left out of the projection
 * does not error, it silently scores as missing and drags the figure down.
 * `linkedin` needs `socialLinks` alongside it, and `userId` is what a seeker
 * document is keyed by, so both are included.
 */
export const PROFILE_COMPLETENESS_FIELDS =
  "userId nationality currentLocation summary skills experience education " +
  "languages linkedin socialLinks";

const filled = (v: unknown): boolean => v !== undefined && v !== null && v !== "";
const filledList = (v: unknown): boolean => Array.isArray(v) && v.length > 0;

function hasLinkedin(doc: ProfileCompletenessInput): boolean {
  if (filled(doc.linkedin)) return true;
  if (!Array.isArray(doc.socialLinks)) return false;
  return (doc.socialLinks as Array<{ label?: string }>).some(
    (l) => l?.label?.toLowerCase() === "linkedin",
  );
}

/**
 * Score a seeker document field by field.
 *
 * @param doc       the seeker document (lean, hydrated, or a plain object)
 * @param fallback  values not yet written to `doc` that should still count —
 *                  the CV extractor scores what it is about to save, so its
 *                  freshly parsed `headline` stands in for `summary`.
 */
export function profileCompleteness(
  doc: ProfileCompletenessInput | null | undefined,
  fallback: ProfileCompletenessInput = {},
): ProfileCompletenessResult {
  const d = doc ?? {};

  const pick = (key: ProfileCompletenessKey): unknown => {
    if (key === "summary") return filled(d.summary) ? d.summary : (fallback.summary ?? fallback.headline);
    const own = (d as Record<string, unknown>)[key];
    if (Array.isArray(own) ? own.length > 0 : filled(own)) return own;
    return (fallback as Record<string, unknown>)[key];
  };

  const items = WEIGHTS.map(({ key, weight }): ProfileCompletenessItem => {
    const done =
      key === "linkedin"
        ? hasLinkedin(d) || hasLinkedin(fallback)
        : key === "skills" || key === "experience" || key === "education" || key === "languages"
          ? filledList(pick(key))
          : filled(pick(key));
    return { key, weight, done };
  });

  const score = Math.min(
    100,
    items.reduce((sum, i) => (i.done ? sum + i.weight : sum), 0),
  );

  return {
    score,
    items,
    done: items.filter((i) => i.done),
    missing: items.filter((i) => !i.done).sort((a, b) => b.weight - a.weight),
    total: items.length,
  };
}

/** The 0–100 figure alone — the common case for write paths. */
export function profileCompletenessScore(
  doc: ProfileCompletenessInput | null | undefined,
  fallback: ProfileCompletenessInput = {},
): number {
  return profileCompleteness(doc, fallback).score;
}
