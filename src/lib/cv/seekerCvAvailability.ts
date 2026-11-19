/**
 * Which CVs a seeker has, from what a list row or profile already carries: the
 * one rule behind "View CV" on the staff job-seeker screens.
 *
 * - `hasCv`      an uploaded file (the profile's CV or a resume document).
 * - `canBuildCv` enough profile to draw the Standardised CV, which needs no upload (hasBuiltCvContent).
 */
/** The profile fields a Mployedin-built (Standardised) CV is drawn from. */
export interface BuiltCvSource {
  experience?: readonly unknown[] | null;
  education?: readonly unknown[] | null;
  skills?: readonly unknown[] | null;
  summary?: string | null;
  /**
   * The seeker's saved CV design. Only the sections they hid matter here: the
   * Standardised CV leaves them out (renderBuiltCv.ts), so they cannot be what
   * makes it worth showing. Rows that do not carry it count everything.
   */
  cvDesign?: { hiddenSections?: readonly string[] | null } | null;
}

/**
 * Whether the profile holds anything to draw a CV from: the one rule behind "a
 * Standardised CV exists" for the CV route, the export manifest and the "View CV"
 * buttons (experience, education, skills or a summary; languages alone are not enough).
 * A section the candidate hid does not count: the Standardised CV is drawn without
 * it, so a candidate who hid all of them would otherwise get an empty page. A summary
 * cannot be hidden. Pure and client-safe; lib/cv/cvAccess.ts (server only) re-exports it.
 */
export function hasBuiltCvContent(profile: BuiltCvSource | null | undefined): boolean {
  if (!profile) return false;
  const hidden = new Set(profile.cvDesign?.hiddenSections ?? []);
  const shown = (section: "experience" | "education" | "skills") => !hidden.has(section) && Boolean(profile[section]?.length);
  return Boolean(shown("experience") || shown("education") || shown("skills") || profile.summary);
}

export interface SeekerCvSource extends BuiltCvSource {
  /** Carried by profiles but not a reason to offer a CV: see hasBuiltCvContent. */
  languages?: readonly unknown[] | null;
  cv?: { originalUrl?: string | null } | null;
  documents?: ReadonlyArray<{ category?: string; url?: string }> | null;
}

export interface SeekerCvAvailability {
  hasCv: boolean;
  canBuildCv: boolean;
}

export function seekerCvAvailability(seeker: SeekerCvSource): SeekerCvAvailability {
  return {
    hasCv: Boolean(seeker.cv?.originalUrl || seeker.documents?.some((d) => d.category === "resume" && d.url)),
    canBuildCv: hasBuiltCvContent(seeker),
  };
}
