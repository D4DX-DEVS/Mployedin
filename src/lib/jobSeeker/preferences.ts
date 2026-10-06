/**
 * The job-seeker Preferences form, read from a stored profile.
 *
 * The page sends this whole shape back to PATCH /api/job-seeker/profile, so it
 * must always satisfy `jobSeekerProfileUpdateSchema` — otherwise a seeker who
 * only changed a country got "couldn't save". Two stored shapes broke that:
 * the model's `preferredSalary.currency` default leaves `{ currency }` with no
 * min/max, and the 2026-06-02 bulk import joined whole experience lines with
 * ";" into a single "role" longer than the validator allows.
 */

import { cleanTagList } from "./tagList";

export const MAX_PREFERRED_ROLE_LENGTH = 100;
const MAX_PREFERRED_ROLES = 20;

export interface PreferencesData {
  preferredRoles: string[];
  preferredCountries: string[];
  preferredSalary: { min: number; max: number; currency: string };
  preferredJobType: string;
  availabilityStatus: string;
  noticePeriod: number;
}

interface StoredPreferences {
  preferredRoles?: unknown;
  preferredCountries?: unknown;
  preferredSalary?: { min?: unknown; max?: unknown; currency?: unknown } | null;
  preferredJobType?: unknown;
  availabilityStatus?: unknown;
  noticePeriod?: unknown;
}

const nonNegative = (value: unknown): number =>
  typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;

const strings = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];

/** One tag per role: split imported "A; B • C" lines, drop bullets, clip to the limit. */
function cleanRoles(value: unknown): string[] {
  return cleanTagList(value, { maxLength: MAX_PREFERRED_ROLE_LENGTH, maxCount: MAX_PREFERRED_ROLES });
}

export function preferencesFromProfile(profile: StoredPreferences | null | undefined): PreferencesData {
  const p = profile ?? {};
  const salary = p.preferredSalary ?? {};
  return {
    preferredRoles: cleanRoles(p.preferredRoles),
    preferredCountries: strings(p.preferredCountries),
    preferredSalary: {
      min: nonNegative(salary.min),
      max: nonNegative(salary.max),
      currency: typeof salary.currency === "string" && salary.currency ? salary.currency : "USD",
    },
    preferredJobType: typeof p.preferredJobType === "string" ? p.preferredJobType : "any",
    availabilityStatus: typeof p.availabilityStatus === "string" ? p.availabilityStatus : "immediately",
    noticePeriod: Math.round(nonNegative(p.noticePeriod)),
  };
}

// ── Validation ───────────────────────────────────────────────────────────────
// The same limits jobSeekerProfileUpdateSchema enforces, checked before the
// request so the page can say which field is wrong (QA 2026-10-06: a notice
// period of -5 came back as a bare "We couldn't save.").

export const MAX_NOTICE_PERIOD_DAYS = 365;
const MAX_PREFERRED_COUNTRY_LENGTH = 100;

export type PreferenceField = "preferredRoles" | "preferredCountries" | "preferredSalary" | "noticePeriod";
export type PreferenceErrorCode =
  | "roleTooLong"
  | "tooManyRoles"
  | "countryTooLong"
  | "tooManyCountries"
  | "salaryNegative"
  | "salaryOrder"
  | "noticeRange"
  | "invalid";
export interface PreferenceError {
  code: PreferenceErrorCode;
  /** The offending entry, for messages that name it. */
  value?: string;
}
export type PreferenceErrors = Partial<Record<PreferenceField, PreferenceError>>;

export function validatePreferences(prefs: PreferencesData): PreferenceErrors {
  const errors: PreferenceErrors = {};

  const longRole = prefs.preferredRoles.find((r) => r.trim().length > MAX_PREFERRED_ROLE_LENGTH);
  if (longRole !== undefined) errors.preferredRoles = { code: "roleTooLong", value: longRole.trim() };
  else if (prefs.preferredRoles.length > MAX_PREFERRED_ROLES) errors.preferredRoles = { code: "tooManyRoles" };

  const longCountry = prefs.preferredCountries.find((c) => c.trim().length > MAX_PREFERRED_COUNTRY_LENGTH);
  if (longCountry !== undefined) errors.preferredCountries = { code: "countryTooLong", value: longCountry.trim() };
  else if (prefs.preferredCountries.length > MAX_PREFERRED_ROLES) errors.preferredCountries = { code: "tooManyCountries" };

  const { min, max } = prefs.preferredSalary;
  if (min < 0 || max < 0) errors.preferredSalary = { code: "salaryNegative" };
  // 0 is "no bound" (the "150k+" preset stores max 0), so only two real bounds can clash.
  else if (min > 0 && max > 0 && min > max) errors.preferredSalary = { code: "salaryOrder" };

  const notice = prefs.noticePeriod;
  if (!Number.isInteger(notice) || notice < 0 || notice > MAX_NOTICE_PERIOD_DAYS) {
    errors.noticePeriod = { code: "noticeRange" };
  }

  return errors;
}

const FORM_FIELDS: readonly PreferenceField[] = ["preferredRoles", "preferredCountries", "preferredSalary", "noticePeriod"];

/**
 * A 400 from validateBody carries `details: [{ path: "preferredRoles.3", … }]`.
 * Point each one at its form field, reusing the local message where the form
 * shows the same problem, so the seeker never sees zod's English wording.
 */
export function preferenceErrorsFromServer(details: unknown, prefs: PreferencesData): PreferenceErrors {
  if (!Array.isArray(details)) return {};
  const local = validatePreferences(prefs);
  const errors: PreferenceErrors = {};
  for (const detail of details) {
    const path = typeof detail?.path === "string" ? detail.path : "";
    const field = FORM_FIELDS.find((f) => path === f || path.startsWith(`${f}.`));
    if (field && !errors[field]) errors[field] = local[field] ?? { code: "invalid" };
  }
  return errors;
}
