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
}

type Lang = "en" | "ar";

const COPY: Record<Lang, {
  headline: Record<PosterLook, string>;
  cta: string;
  footer: string;
  types: Record<string, string>;
  modes: Record<string, string>;
  period: Record<string, string>;
}> = {
  en: {
    headline: { bold: "We're hiring", clean: "Join our team", urgent: "Urgent hiring" },
    cta: "Scan to apply",
    footer: "Apply via Mployedin",
    types: { full_time: "Full time", part_time: "Part time", contract: "Contract", internship: "Internship", freelance: "Freelance", walk_in: "Walk-in interview" },
    modes: { remote: "Remote", hybrid: "Hybrid", onsite: "On site", on_site: "On site" },
    period: { monthly: "/month", yearly: "/year", lpa: " LPA" },
  },
  ar: {
    headline: { bold: "نحن نوظّف", clean: "انضم إلى فريقنا", urgent: "توظيف عاجل" },
    cta: "امسح للتقديم",
    footer: "قدّم عبر Mployedin",
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

/** Poster text for a job. `headline` overrides the look's default kicker. */
export function buildBrandPosterData(
  job: PosterJobInput,
  opts: { look: PosterLook; locale?: string; headline?: string; companyName?: string; qrDataUrl?: string },
): BrandPosterData {
  const l = lang(opts.locale);
  const copy = COPY[l];
  const place = [job.location?.city, job.location?.country].filter(Boolean).join(", ");
  const type = job.employmentType ? copy.types[job.employmentType] ?? job.employmentType.replace(/_/g, " ") : null;
  const mode = job.workMode && job.workMode !== "onsite" && job.workMode !== "on_site" ? copy.modes[job.workMode] ?? null : null;
  return {
    title: (job.title ?? "").trim() || "Open position",
    companyName: opts.companyName ?? job.companyName ?? "",
    headline: opts.headline?.trim() || copy.headline[opts.look],
    details: [place, [type, mode].filter(Boolean).join(" · "), formatSalary(job, l) ?? ""].filter(Boolean),
    cta: copy.cta,
    footer: copy.footer,
    qrDataUrl: opts.qrDataUrl,
  };
}
