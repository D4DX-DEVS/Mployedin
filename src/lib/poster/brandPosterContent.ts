import type { BrandPosterData, PosterLook } from "@/components/features/poster/BrandPoster";

/** The job fields a poster reads. Matches both the job API and a lean Job document. */
export interface PosterJobInput {
  title?: string;
  companyName?: string;
  location?: { city?: string; country?: string } | null;
  employmentType?: string | null;
  workMode?: string | null;
  salary?: { min?: number; max?: number; currency?: string; period?: string } | null;
  showSalary?: boolean;
  /** The employer's own requirement lines (the job page's "Qualifications"). */
  qualifications?: string[] | null;
  qualificationsAr?: string[] | null;
  requirements?: {
    skills?: string[];
    aiSkills?: string[];
    experienceMin?: number;
    experienceMax?: number;
    education?: string;
    languages?: string[];
  } | null;
  createdAt?: string | Date | null;
}

/** Mployedin's contact line on every poster (owner decision 2026-11-09). */
export interface PosterContactInput {
  email?: string;
  phone?: string;
}

type Lang = "en" | "ar";

/** Requirement lines on a poster: enough to judge fit, short enough to read on a phone. */
export const MAX_POSTER_REQUIREMENTS = 4;
const MAX_REQUIREMENT_CHARS = 90;

const COPY: Record<Lang, {
  headline: Record<PosterLook, string>;
  cta: string;
  footer: string;
  requirements: string;
  apply: string;
  enquiries: string;
  posted: string;
  years: (min: number, max: number) => string;
  education: string;
  skills: string;
  languages: string;
  types: Record<string, string>;
  modes: Record<string, string>;
  period: Record<string, string>;
}> = {
  en: {
    headline: { bold: "We're hiring", clean: "Join our team", urgent: "Urgent hiring" },
    cta: "Scan & apply now",
    footer: "Apply via Mployedin",
    requirements: "Requirements",
    apply: "Apply now",
    enquiries: "For enquiries",
    posted: "Posted",
    years: (min, max) => (max > min ? `${min}–${max} years of experience` : `${min}+ years of experience`),
    education: "Education",
    skills: "Skills",
    languages: "Languages",
    types: { full_time: "Full time", part_time: "Part time", contract: "Contract", internship: "Internship", freelance: "Freelance", walk_in: "Walk-in interview" },
    modes: { remote: "Remote", hybrid: "Hybrid", onsite: "On site", on_site: "On site" },
    period: { monthly: "/month", yearly: "/year", lpa: " LPA" },
  },
  ar: {
    headline: { bold: "نحن نوظّف", clean: "انضم إلى فريقنا", urgent: "توظيف عاجل" },
    cta: "امسح وقدّم الآن",
    footer: "قدّم عبر Mployedin",
    requirements: "المتطلبات",
    apply: "قدّم الآن",
    enquiries: "للاستفسارات",
    posted: "تاريخ النشر",
    years: (min, max) => (max > min ? `خبرة ${min}–${max} سنوات` : `خبرة ${min}+ سنوات`),
    education: "التعليم",
    skills: "المهارات",
    languages: "اللغات",
    types: { full_time: "دوام كامل", part_time: "دوام جزئي", contract: "عقد", internship: "تدريب", freelance: "عمل حر", walk_in: "مقابلة مباشرة" },
    modes: { remote: "عن بُعد", hybrid: "هجين", onsite: "في الموقع", on_site: "في الموقع" },
    period: { monthly: "/شهر", yearly: "/سنة", lpa: " LPA" },
  },
};

function lang(locale?: string): Lang {
  return locale === "ar" ? "ar" : "en";
}

export function defaultHeadline(look: PosterLook, locale?: string): string {
  return COPY[lang(locale)].headline[look];
}

function formatSalary(job: PosterJobInput, l: Lang): string | null {
  const s = job.salary;
  if (job.showSalary === false || !s || (!s.min && !s.max)) return null;
  const fmt = (n: number) => n.toLocaleString(l === "ar" ? "ar-AE" : "en-US", { maximumFractionDigits: 0 });
  const range = s.min && s.max && s.min !== s.max ? `${fmt(s.min)}–${fmt(s.max)}` : fmt((s.max || s.min) as number);
  return `${s.currency ?? "AED"} ${range}${COPY[l].period[s.period ?? "monthly"] ?? ""}`;
}

function clip(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim().replace(/[.;]$/, "");
  return clean.length > MAX_REQUIREMENT_CHARS ? `${clean.slice(0, MAX_REQUIREMENT_CHARS - 1).trimEnd()}…` : clean;
}

const titleCase = (s: string) => s.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

/**
 * Up to four requirement lines. The employer's own written qualifications come
 * first (that is what the job page shows); when there are fewer than four, the
 * structured fields fill in: experience, education, skills, languages.
 */
export function posterRequirements(job: PosterJobInput, locale?: string): string[] {
  const l = lang(locale);
  const copy = COPY[l];
  const written = (l === "ar" && job.qualificationsAr?.length ? job.qualificationsAr : job.qualifications) ?? [];
  const lines = written.map((q) => (typeof q === "string" ? clip(q) : "")).filter(Boolean);

  const r = job.requirements ?? {};
  const min = r.experienceMin ?? 0;
  const max = r.experienceMax ?? 0;
  const skills = (r.skills?.length ? r.skills : r.aiSkills ?? []).filter(Boolean);
  const derived = [
    // 0–N is the schema default ("any"), not a requirement.
    min > 0 ? copy.years(min, max) : "",
    r.education ? `${copy.education}: ${titleCase(r.education)}` : "",
    skills.length ? `${copy.skills}: ${skills.slice(0, 4).join(", ")}` : "",
    r.languages?.length ? `${copy.languages}: ${r.languages.slice(0, 3).join(", ")}` : "",
  ].filter(Boolean).map(clip);

  const seen = new Set<string>();
  return [...lines, ...derived]
    .filter((line) => {
      const key = line.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_POSTER_REQUIREMENTS);
}

function formatPosted(value: PosterJobInput["createdAt"], l: Lang): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  const text = date.toLocaleDateString(l === "ar" ? "ar-AE" : "en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  return `${COPY[l].posted}: ${text}`;
}

/** Poster text for a job. `headline` overrides the look's default kicker. */
export function buildBrandPosterData(
  job: PosterJobInput,
  opts: {
    look: PosterLook;
    locale?: string;
    headline?: string;
    companyName?: string;
    qrDataUrl?: string;
    contact?: PosterContactInput | null;
  },
): BrandPosterData {
  const l = lang(opts.locale);
  const copy = COPY[l];
  const place = [job.location?.city, job.location?.country].filter(Boolean).join(", ");
  const type = job.employmentType ? copy.types[job.employmentType] ?? job.employmentType.replace(/_/g, " ") : null;
  const mode = job.workMode && job.workMode !== "onsite" && job.workMode !== "on_site" ? copy.modes[job.workMode] ?? null : null;
  const email = opts.contact?.email?.trim() || undefined;
  const phone = opts.contact?.phone?.trim() || undefined;
  return {
    title: (job.title ?? "").trim() || "Open position",
    companyName: opts.companyName ?? job.companyName ?? "",
    headline: opts.headline?.trim() || copy.headline[opts.look],
    location: place || undefined,
    details: [[type, mode].filter(Boolean).join(" · "), formatSalary(job, l) ?? ""].filter(Boolean),
    posted: formatPosted(job.createdAt, l),
    requirementsTitle: copy.requirements,
    requirements: posterRequirements(job, l),
    cta: copy.cta,
    applyLabel: copy.apply,
    contact: email || phone ? { label: copy.enquiries, email, phone } : undefined,
    footer: copy.footer,
    qrDataUrl: opts.qrDataUrl,
  };
}
