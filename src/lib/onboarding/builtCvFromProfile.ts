import type {
  BuiltCertificate,
  BuiltEducation,
  BuiltJob,
  BuiltLink,
  CvBuilderResult,
  LanguageLevel,
} from "@/components/features/job-seeker/cv-wizard/types";
import { qualificationLabel, qualificationValue } from "@/lib/onboarding/qualifications";
import { cleanSocialLinks, toProfileLinkUrl } from "@/lib/jobSeeker/socialLinks";
import { CV_TEMPLATE_IDS } from "@/lib/jobSeeker/cvDesign";
import { DEFAULT_FORMATTING } from "@/app/[locale]/(dashboard)/job-seeker/cv/types";

/*
 * The guided CV builder's answers ⇄ the seeker profile.
 *
 * `builderProfilePayload` is what "Save my CV" PATCHes — and also what the
 * builder's preview renders (through the CV Builder's own profile → CV
 * mapping), so the preview is the CV the seeker gets, not a look-alike.
 * `builtCvFromProfile` reads it back after a reload.
 */

const LEVELS: LanguageLevel[] = ["basic", "conversational", "professional", "native"];
/** A project's "where" is kept in its title: the profile has no field for it. */
const PROJECT_PLACE = " — ";
const DEFAULT_TEMPLATE = "classic";

const month = (value: unknown): string => {
  if (!value) return "";
  const d = new Date(value as string);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 7);
};
const year = (value: unknown): string => {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "number") return String(value);
  const d = new Date(value as string);
  return Number.isNaN(d.getTime()) ? String(value).slice(0, 4) : String(d.getUTCFullYear());
};
const firstOfMonth = (ym: string) => (ym ? `${ym}-01` : undefined);
const str = (v: unknown) => (typeof v === "string" ? v : "");

export function certificateText(c: BuiltCertificate): string {
  return `${c.name.trim()}${c.issuer.trim() ? `${PROJECT_PLACE}${c.issuer.trim()}` : ""}${c.year.trim() ? ` (${c.year.trim()})` : ""}`;
}

export function parseCertificate(text: string): BuiltCertificate {
  const m = /^(.*?)(?: — (.*?))?(?: \((\d{4})\))?$/.exec(text.trim());
  return { name: m?.[1] ?? text, issuer: m?.[2] ?? "", year: m?.[3] ?? "" };
}

const filledJobs = (list: BuiltJob[]) => list.filter((j) => j.title.trim());

/** Links the profile can take; the ones it can't are left out (the links step flags them). */
export function builderLinks(r: Pick<CvBuilderResult, "linkedin" | "portfolio" | "otherLinks">): BuiltLink[] {
  const out: BuiltLink[] = [];
  for (const link of [
    { label: "LinkedIn", url: r.linkedin },
    { label: "Portfolio", url: r.portfolio },
    ...r.otherLinks,
  ]) {
    if (!link.url.trim()) continue;
    const label = link.label.trim() || "Website";
    const url = toProfileLinkUrl(label, link.url);
    if (url) out.push({ label, url });
  }
  return out;
}

/** The profile PATCH for a finished builder run. */
export function builderProfilePayload(r: CvBuilderResult, existingRoles: string[] = []): Record<string, unknown> {
  const roles = [r.targetRole.trim(), ...existingRoles].filter(Boolean);
  const education = r.education.filter((e) => e.level || e.course.trim() || e.institution.trim());
  const projects = filledJobs(r.projects);
  const jobs = r.fresher ? [] : filledJobs(r.jobs);
  return {
    skills: r.skills,
    // The job they want: shown again on edit and used for job matching.
    preferredRoles: roles.filter((x, i) => roles.findIndex((y) => y.toLowerCase() === x.toLowerCase()) === i).slice(0, 20),
    languages: r.languages.map((l) => ({ language: l.language, proficiency: l.proficiency })),
    certifications: r.certificates.filter((c) => c.name.trim()).map(certificateText),
    socialLinks: builderLinks(r),
    // The profile takes the whole design or none of it.
    cvDesign: { templateId: r.templateId || DEFAULT_TEMPLATE, formatting: DEFAULT_FORMATTING, hiddenSections: [] },
    ...(r.summary.trim() ? { summary: r.summary.trim() } : {}),
    ...(jobs.length
      ? {
          experience: jobs.map((j) => ({
            jobTitle: j.title.trim(),
            company: j.organisation.trim() || "—",
            startDate: firstOfMonth(j.start),
            endDate: j.current ? undefined : firstOfMonth(j.end),
            isCurrent: j.current,
            description: j.description.trim() || undefined,
          })),
        }
      : {}),
    ...(projects.length
      ? {
          projects: projects.map((p) => ({
            title: p.organisation.trim() ? `${p.title.trim()}${PROJECT_PLACE}${p.organisation.trim()}` : p.title.trim(),
            description: p.description.trim() || undefined,
            startDate: firstOfMonth(p.start),
            endDate: p.current ? undefined : firstOfMonth(p.end),
            isCurrent: p.current,
          })),
        }
      : {}),
    ...(education.length
      ? {
          // Stored the way onboarding's education step stores it (level label
          // in `degree`), so that step recognises it and does not add a twin.
          education: education.map((e) => ({
            degree: e.level ? qualificationLabel(e.level) : e.course.trim(),
            course: e.course.trim() || undefined,
            field: e.field.trim() || undefined,
            institution: e.institution.trim(),
            startYear: e.startYear ? Number(e.startYear) : undefined,
            graduationDate: !e.studying && e.endYear ? new Date(Date.UTC(Number(e.endYear), 11, 31)).toISOString() : undefined,
            grade: e.grade.trim() || undefined,
          })),
        }
      : {}),
  };
}

/** The parts of the stored seeker profile the guided CV builder wrote. */
export interface BuilderProfileFields {
  workStatus?: string | null;
  cv?: { originalUrl?: string | null } | null;
  summary?: string | null;
  preferredRoles?: string[] | null;
  skills?: unknown[] | null;
  experience?: Array<Record<string, unknown>> | null;
  projects?: Array<Record<string, unknown>> | null;
  education?: Array<Record<string, unknown>> | null;
  languages?: Array<{ language?: string; proficiency?: string }> | null;
  certifications?: string[] | null;
  socialLinks?: unknown;
  cvDesign?: { templateId?: string } | null;
  totalExperienceYears?: number | null;
  totalExperienceMonths?: number | null;
}

const toJob = (e: Record<string, unknown>, title: string, organisation: string): BuiltJob => ({
  title,
  organisation,
  start: month(e.startDate),
  end: e.isCurrent ? "" : month(e.endDate),
  current: e.isCurrent === true,
  description: str(e.description),
});

/**
 * The CV a seeker built in onboarding, read back from their saved profile, so a
 * reload shows "Your CV is ready" (and Edit reopens it filled in) instead of
 * offering to build it again. Null when the profile holds no built CV: an
 * uploaded file counts as a CV of its own, and onboarding's own steps never
 * write a summary, projects, languages or certificates — only the builder
 * (or an import) does.
 */
export function builtCvFromProfile(p: BuilderProfileFields | null | undefined): CvBuilderResult | null {
  if (!p || p.cv?.originalUrl) return null;
  const summary = (p.summary ?? "").trim();
  const projects = p.projects ?? [];
  const languages = p.languages ?? [];
  const certifications = p.certifications ?? [];
  if (!summary && !projects.length && !languages.length && !certifications.length) return null;

  const links = cleanSocialLinks(p.socialLinks);
  const named = (names: string[]) => links.find((l) => names.includes(l.label.toLowerCase()))?.url ?? "";
  const templateId = p.cvDesign?.templateId && (CV_TEMPLATE_IDS as readonly string[]).includes(p.cvDesign.templateId)
    ? p.cvDesign.templateId
    : DEFAULT_TEMPLATE;

  return {
    targetRole: p.preferredRoles?.[0] ?? "",
    fresher: p.workStatus === "fresher",
    jobs: (p.experience ?? [])
      .filter((e) => str(e.jobTitle).trim())
      .map((e) => toJob(e, str(e.jobTitle), str(e.company) === "—" ? "" : str(e.company))),
    projects: projects
      .filter((pr) => str(pr.title).trim())
      .map((pr) => {
        const [title, ...place] = str(pr.title).split(PROJECT_PLACE);
        return toJob(pr, title, place.join(PROJECT_PLACE));
      }),
    education: (p.education ?? []).map(
      (e): BuiltEducation => ({
        level: qualificationValue(str(e.degree)),
        course: str(e.course) || (qualificationValue(str(e.degree)) ? "" : str(e.degree)),
        field: str(e.field),
        institution: str(e.institution),
        startYear: year(e.startYear),
        endYear: year(e.graduationDate),
        studying: !e.graduationDate,
        grade: str(e.grade),
      }),
    ),
    skills: (p.skills ?? []).map((s) => (typeof s === "string" ? s : (s as { name?: string })?.name ?? "")).filter(Boolean),
    languages: languages
      .filter((l) => (l.language ?? "").trim())
      .map((l) => ({
        language: l.language ?? "",
        proficiency: LEVELS.includes(l.proficiency as LanguageLevel) ? (l.proficiency as LanguageLevel) : "conversational",
      })),
    certificates: certifications.map(parseCertificate),
    linkedin: named(["linkedin"]),
    portfolio: named(["portfolio", "website"]),
    otherLinks: links.filter((l) => !["linkedin", "portfolio", "website"].includes(l.label.toLowerCase())),
    summary,
    templateId,
    experienceYears: p.totalExperienceYears ? String(p.totalExperienceYears) : "",
    experienceMonths: p.totalExperienceMonths ? String(p.totalExperienceMonths) : "",
  };
}
