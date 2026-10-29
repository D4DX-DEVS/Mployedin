/**
 * Owner decision 2026-10-28: job seekers must be 16 or over (UK: the age a
 * person can consent to information society services themselves is 13, but
 * work and recruitment rules make 16 the floor we accept). Client-safe.
 */
export const MIN_SEEKER_AGE = 16;
/** Anything older is a typing mistake, not a person. */
const MAX_AGE = 100;

/** Whole years between a YYYY-MM-DD (or ISO) birth date and `now`; null when it isn't a real date. */
export function ageOn(dateOfBirth: string, now: Date = new Date()): number | null {
  const dob = new Date(dateOfBirth);
  if (Number.isNaN(dob.getTime())) return null;
  let age = now.getUTCFullYear() - dob.getUTCFullYear();
  const beforeBirthday =
    now.getUTCMonth() < dob.getUTCMonth() ||
    (now.getUTCMonth() === dob.getUTCMonth() && now.getUTCDate() < dob.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}

export type DateOfBirthProblem = "invalid" | "tooYoung";

/** Why a birth date can't be saved, or null when it can. */
export function dateOfBirthProblem(dateOfBirth: string, now: Date = new Date()): DateOfBirthProblem | null {
  const age = ageOn(dateOfBirth, now);
  if (age === null || age < 0 || age > MAX_AGE) return "invalid";
  if (age < MIN_SEEKER_AGE) return "tooYoung";
  return null;
}

/** The latest birth date allowed today, as YYYY-MM-DD (for a date input's `max`). */
export function latestAllowedDateOfBirth(now: Date = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear() - MIN_SEEKER_AGE, now.getUTCMonth(), now.getUTCDate()));
  return d.toISOString().slice(0, 10);
}
