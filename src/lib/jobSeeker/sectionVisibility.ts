/**
 * The eye toggles on a job seeker's profile (JobSeeker.sectionVisibility).
 * A hidden section is left out wherever an employer sees the profile without
 * a relationship to the person (talent search, a discoverable profile they
 * have not applied to). Employers the person applied to, or who pooled them,
 * still see everything — the application itself shares it.
 */
const SECTION_FIELDS: Record<string, readonly string[]> = {
  experience: ["experience"],
  skills: ["skills"],
  education: ["education"],
  projects: ["projects"],
  accomplishments: ["accomplishments", "certifications"],
};

/** Lean docs carry the Map as a plain object; a hydrated doc as a Map. */
function hiddenSections(visibility: unknown): string[] {
  if (!visibility) return [];
  const entries = visibility instanceof Map ? [...visibility.entries()] : Object.entries(visibility as Record<string, unknown>);
  return entries.filter(([key, shown]) => shown === false && key in SECTION_FIELDS).map(([key]) => key);
}

/** A copy of the seeker record without the sections the person hid. */
export function withoutHiddenSections<T extends Record<string, unknown>>(seeker: T): Omit<T, "sectionVisibility"> {
  const { sectionVisibility, ...rest } = seeker;
  const out: Record<string, unknown> = { ...rest };
  for (const section of hiddenSections(sectionVisibility)) {
    for (const field of SECTION_FIELDS[section]) delete out[field];
  }
  return out as Omit<T, "sectionVisibility">;
}
