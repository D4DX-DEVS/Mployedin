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
