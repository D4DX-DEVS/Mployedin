import type { ProfileData } from "./types";

/**
 * Completeness uses the same weights as the profile page. It is kept as a list
 * rather than a sum so the header can say how many details are missing without
 * a second, drifting definition of "done".
 */
const CHECKS: Array<{ key: string; weight: number; done: (p: ProfileData) => boolean }> = [
  { key: "account", weight: 10, done: (p) => Boolean(p.userId) },
  { key: "nationality", weight: 10, done: (p) => Boolean(p.nationality) },
  { key: "location", weight: 5, done: (p) => Boolean(p.currentLocation) },
  { key: "summary", weight: 10, done: (p) => Boolean(p.summary) },
  { key: "skills", weight: 20, done: (p) => (p.skills?.length ?? 0) > 0 },
  { key: "experience", weight: 20, done: (p) => (p.experience?.length ?? 0) > 0 },
  { key: "education", weight: 15, done: (p) => (p.education?.length ?? 0) > 0 },
  { key: "languages", weight: 5, done: (p) => (p.languages?.length ?? 0) > 0 },
  {
    key: "linkedin",
    weight: 5,
    done: (p) => Boolean(p.linkedin || p.socialLinks?.some((l) => l.label?.toLowerCase() === "linkedin")),
  },
];

export function profileCompletion(profile: ProfileData | null | undefined): { completion: number; missing: number } {
  if (!profile) return { completion: 0, missing: 0 };
  const done = CHECKS.reduce((sum, c) => sum + (c.done(profile) ? c.weight : 0), 0);
  return { completion: Math.min(100, done), missing: CHECKS.filter((c) => !c.done(profile)).length };
}

export type BoostTip = "resume" | "summary" | "skills" | "experience" | "education" | "languages" | "preferences" | "linkedin";

/** Where each tip is fixed. */
export const BOOST_PATHS: Record<BoostTip, string> = {
  resume: "/job-seeker/cv",
  summary: "/job-seeker/profile",
  skills: "/job-seeker/skills",
  experience: "/job-seeker/profile",
  education: "/job-seeker/profile",
  languages: "/job-seeker/profile",
  preferences: "/job-seeker/preferences",
  linkedin: "/job-seeker/profile",
};

/** The gaps that hold matches or recruiter attention back, biggest lever first. */
export function profileBoostTips(profile: ProfileData | null | undefined): BoostTip[] {
  if (!profile) return [];
  const tips: BoostTip[] = [];
  if (!profile.cvFileUrl && !profile.cv?.originalUrl) tips.push("resume");
  if ((profile.skills?.length ?? 0) === 0) tips.push("skills");
  if (!(profile.preferredRoles?.length || profile.preferredCountries?.length)) tips.push("preferences");
  if ((profile.experience?.length ?? 0) === 0) tips.push("experience");
  if (!profile.summary) tips.push("summary");
  if ((profile.education?.length ?? 0) === 0) tips.push("education");
  if ((profile.languages?.length ?? 0) === 0) tips.push("languages");
  if (!(profile.linkedin || profile.socialLinks?.some((l) => l.label?.toLowerCase() === "linkedin"))) tips.push("linkedin");
  return tips;
}

export function hasJobPreferences(profile: ProfileData | null | undefined): boolean {
  return Boolean(
    profile?.preferredRoles?.length || profile?.preferredCountries?.length || profile?.preferredJobType || profile?.preferredSalary?.min,
  );
}
