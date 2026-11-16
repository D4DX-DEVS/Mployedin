import type { SeekerProfileData } from "@/app/[locale]/(dashboard)/job-seeker/cv/built-cv";
import { DEFAULT_FORMATTING } from "@/app/[locale]/(dashboard)/job-seeker/cv/types";

/** Kept apart from the editor so the job page can save without loading it. */

export const MAX_SKILLS = 50;

export function str(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function skillNames(skills: unknown[] | undefined): string[] {
  return (skills ?? [])
    .map((s) => (typeof s === "string" ? s : str((s as { name?: unknown } | null)?.name)).trim())
    .filter(Boolean);
}

/**
 * What the window saves for the CV's content, or null when nothing changed.
 * Jobs without a title and company, and education without a qualification,
 * are left out: the profile cannot store them.
 */
export function cvEditsBody(edited: SeekerProfileData | null, original: SeekerProfileData | null): Record<string, unknown> | null {
  if (!edited || !original || edited === original) return null;
  return {
    summary: str(edited.summary).trim().slice(0, 5000),
    skills: skillNames(edited.skills).slice(0, MAX_SKILLS),
    experience: (edited.experience ?? []).filter((e) => str(e.jobTitle).trim() && str(e.company).trim()),
    education: (edited.education ?? []).filter((e) => str(e.degree).trim()),
  };
}


/** Designs offered in the review window; the CV Builder has every other one. */
export const REVIEW_TEMPLATES = ["classic", "modern", "professional", "minimal"] as const;

/** The saved design of the Mployedin CV, as the CV Builder stores it. */
export function cvDesignFor(templateId: string) {
  return { templateId, formatting: DEFAULT_FORMATTING, hiddenSections: [] as string[] };
}
