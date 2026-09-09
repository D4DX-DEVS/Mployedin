"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { MapPin, Wallet, Briefcase } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatLocalizedLocation } from "@/lib/i18n/locations";

/**
 * The one job card the seeker ever sees.
 *
 * Every surface that lists a job — the feed, the home recommendations, saved
 * jobs, a company's open roles — renders this. Before it existed each surface
 * hand-rolled its own card, so the same job looked different depending on where
 * it was found, and the feed's cards ranged from 250px to 487px tall on one
 * screen because the description was effectively unclamped: `line-clamp-2` sets
 * `display:-webkit-box`, and the `sm:block` beside it overrode that display at
 * every width the description was actually visible at, so the clamp never
 * applied and a 1,752-character description rendered 195px of body text.
 *
 * The fix is structural rather than another clamp: a job card carries only what
 * a seeker scans on — title, company, match, location, pay, contract type and a
 * few skills. Prose belongs on the job detail page. Every row here is either
 * fixed-height or capped to one line, so cards differ only by whether a title
 * wraps.
 */

export interface JobSummary {
  _id: string;
  title: string;
  createdAt?: string;
  matchScore?: number;
  employmentType?: string;
  location?: { city?: string; country?: string; isRemote?: boolean } | null;
  salary?: { min?: number; max?: number; currency?: string } | null;
  skills?: string[];
  /** Skills the seeker already has — rendered first and marked. */
  matchedSkills?: string[];
  company?: { _id?: string; name?: string; logo?: string } | null;
}

interface JobSummaryCardProps {
  job: JobSummary;
  locale: string;
  /** Buttons for this surface (apply/hide, or just view). */
  actions?: ReactNode;
  /** Hide the match chip where no score is meaningful (plain search results). */
  showMatchScore?: boolean;
  /** Extra pill rendered next to the title, e.g. an application status. */
  statusSlot?: ReactNode;
  className?: string;
}

/** Skill chips shown before the "+N" overflow. Three keeps the row to one line. */
export const MAX_VISIBLE_SKILLS = 3;

/**
 * Phones only fit two. Three chips at 390px overflowed the card: each chip is
 * `shrink-0` inside a `flex-nowrap` row, so the third was amputated by the
 * row's `overflow-hidden` with no ellipsis and no "+N" — the label simply ran
 * off the edge and the seeker never learned it existed.
 */
export const MOBILE_VISIBLE_SKILLS = 2;

const LOGO_PALETTES = [
  { bg: "bg-blue-100", text: "text-blue-700" },
  { bg: "bg-emerald-100", text: "text-emerald-700" },
  { bg: "bg-violet-100", text: "text-violet-700" },
  { bg: "bg-amber-100", text: "text-amber-700" },
  { bg: "bg-rose-100", text: "text-rose-700" },
  { bg: "bg-cyan-100", text: "text-cyan-700" },
];

export function logoPalette(name: string) {
  const hash = name.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return LOGO_PALETTES[hash % LOGO_PALETTES.length];
}

export function initialsOf(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function matchToneClass(score: number) {
  if (score >= 85) return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (score >= 70) return "border-blue-200 bg-blue-50 text-blue-700";
  return "border-amber-200 bg-amber-50 text-amber-700";
}

export function relativeTimeParts(iso: string): {
  key: "justNow" | "hoursAgo" | "daysAgo" | "weeksAgo" | "monthsAgo";
  value?: number;
} {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return { key: "justNow" };
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return { key: "hoursAgo", value: hrs };
  const days = Math.floor(hrs / 24);
  if (days < 7) return { key: "daysAgo", value: days };
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return { key: "weeksAgo", value: weeks };
  return { key: "monthsAgo", value: Math.max(1, Math.floor(days / 30)) };
}

export function formatSalaryRange(
  salary: { min?: number; max?: number; currency?: string } | null | undefined,
  numberLocale: string
) {
  if (!salary?.min || !salary?.max || !salary.currency) return null;
  const fmt = (n: number) =>
    n >= 1000
      ? new Intl.NumberFormat(numberLocale, { notation: "compact", maximumFractionDigits: 1 }).format(n)
      : n.toLocaleString(numberLocale);
  return `${fmt(salary.min)}–${fmt(salary.max)} ${salary.currency}`;
}

/** Employment types the Job model accepts. Anything else renders no chip. */
const EMPLOYMENT_TYPES = new Set([
  "full_time",
  "part_time",
  "contract",
  "internship",
  "freelance",
  "walk_in",
]);

export function JobSummaryCard({
  job,
  locale,
  actions,
  showMatchScore = true,
  statusSlot,
  className,
}: JobSummaryCardProps) {
  const t = useTranslations("jobCard");
  const numberLocale = locale === "ar" ? "ar-SA" : "en-US";
  const companyName = job.company?.name?.trim() || t("company");
  const companyHref = job.company?._id ? `/${locale}/job-seeker/companies/${job.company._id}` : null;
  const palette = logoPalette(companyName);
  const jobHref = `/${locale}/job-seeker/jobs/${job._id}`;

  const salaryLabel = formatSalaryRange(job.salary, numberLocale);
  const employmentLabel =
    job.employmentType && EMPLOYMENT_TYPES.has(job.employmentType)
      ? t(`employment.${job.employmentType}` as "employment.full_time")
      : null;
  const posted = job.createdAt ? relativeTimeParts(job.createdAt) : null;
  const postedLabel = posted
    ? posted.value == null
      ? t(`time.${posted.key}` as "time.justNow")
      : t(`time.${posted.key}` as "time.hoursAgo", { value: posted.value.toLocaleString(numberLocale) })
    : null;

  // Matched skills lead: the seeker should see what they already have first.
  const matchedSet = new Set((job.matchedSkills ?? []).map((s) => s.toLowerCase()));
  const orderedSkills = [...(job.skills ?? [])].sort((a, b) => {
    const am = matchedSet.has(a.toLowerCase()) ? 0 : 1;
    const bm = matchedSet.has(b.toLowerCase()) ? 0 : 1;
    return am - bm;
  });
  const visibleSkills = orderedSkills.slice(0, MAX_VISIBLE_SKILLS);
  const hiddenSkillCount = Math.max(0, orderedSkills.length - visibleSkills.length);
  // The phone hides one more chip than the desktop, so it needs its own count.
  // Both counters render and CSS picks one: resolving the width in JS would
  // mismatch the server render.
  const mobileHiddenSkillCount = Math.max(0, orderedSkills.length - MOBILE_VISIBLE_SKILLS);

  return (
    <article
      data-testid="job-summary-card"
      className={cn(
        "group relative rounded-2xl border border-border/80 bg-card p-3 shadow-[0_2px_8px_-2px_rgba(15,23,42,0.08),0_1px_3px_-1px_rgba(15,23,42,0.06)] transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[0_12px_24px_-4px_rgba(15,23,42,0.12),0_4px_8px_-2px_rgba(15,23,42,0.06)] sm:p-4",
        className
      )}
    >
      <div className="flex min-w-0 items-start gap-3">
        {companyHref ? (
          <Link href={companyHref} aria-label={t("viewCompany", { company: companyName })} className="shrink-0">
            <CompanyMark logo={job.company?.logo} name={companyName} palette={palette} alt={t("companyLogo", { company: companyName })} />
          </Link>
        ) : (
          <CompanyMark logo={job.company?.logo} name={companyName} palette={palette} alt={t("companyLogo", { company: companyName })} />
        )}

        {/* Content and controls sit side by side rather than stacked: the
            actions used to be a full-width row under a divider, which cost
            every card ~64px of height for four buttons that fit beside the
            match score. */}
        <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="min-w-0 flex-1">
            <h3 className="min-w-0 text-[15px] font-semibold leading-5 text-foreground sm:text-base">
              <Link href={jobHref} className="line-clamp-1 transition-colors hover:text-primary">
                {job.title}
              </Link>
            </h3>
            <p className="mt-0.5 truncate text-sm text-muted-foreground">{companyName}</p>

          {/* Meta — always one line. Phones scroll it rather than wrapping to a
              second row, which is what made cards different heights. */}
          <div className="scrollbar-none mt-2 flex flex-nowrap items-center gap-x-3 gap-y-1 overflow-x-auto text-xs text-muted-foreground">
            <span className="inline-flex shrink-0 items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
              {formatLocalizedLocation(job.location ?? undefined, locale, {
                remoteLabel: t("remote"),
                fallback: t("locationFlexible"),
                includeLocationForRemote: true,
              })}
            </span>
            {salaryLabel && (
              <span className="inline-flex shrink-0 items-center gap-1.5">
                <Wallet className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
                {salaryLabel}
              </span>
            )}
            {employmentLabel && (
              <span className="inline-flex shrink-0 items-center gap-1.5">
                <Briefcase className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
                {employmentLabel}
              </span>
            )}
          </div>

          {/* Skills — capped to one row at every width. */}
          {visibleSkills.length > 0 && (
            <div className="mt-2 flex flex-nowrap items-center gap-1.5 overflow-hidden">
              {visibleSkills.map((skill, index) => {
                const isMatched = matchedSet.has(skill.toLowerCase());
                return (
                  <span
                    key={skill}
                    title={skill}
                    className={cn(
                      // `inline-block`, not `inline-flex`: text-overflow needs a
                      // block container, and a flex box's bare text is an
                      // anonymous flex item, so `truncate` painted no ellipsis
                      // and long skills were cut mid-glyph instead.
                      "max-w-[45%] shrink-0 truncate rounded-full border px-2.5 py-0.5 text-[11px] font-medium sm:max-w-[40%]",
                      index < MOBILE_VISIBLE_SKILLS ? "inline-block" : "hidden sm:inline-block",
                      isMatched
                        ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                        : "border-border/60 bg-secondary text-secondary-foreground"
                    )}
                  >
                    {skill}
                  </span>
                );
              })}
              {mobileHiddenSkillCount > 0 && (
                <span className="shrink-0 text-[11px] font-medium text-muted-foreground sm:hidden">
                  {t("moreSkills", { count: mobileHiddenSkillCount.toLocaleString(numberLocale) })}
                </span>
              )}
              {hiddenSkillCount > 0 && (
                <span className="hidden shrink-0 text-[11px] font-medium text-muted-foreground sm:inline">
                  {t("moreSkills", { count: hiddenSkillCount.toLocaleString(numberLocale) })}
                </span>
              )}
            </div>
          )}
          </div>

          {/* Match, age and the surface's own buttons — one column on a wide
              screen, one wrapped row on a phone. */}
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 sm:flex-col sm:items-end sm:justify-start">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 sm:flex-col sm:items-end">
              {statusSlot}
              {showMatchScore && typeof job.matchScore === "number" && (
                <span
                  className={cn(
                    "inline-flex whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                    matchToneClass(job.matchScore)
                  )}
                >
                  {t("matchPercent", { score: job.matchScore.toLocaleString(numberLocale) })}
                </span>
              )}
              {postedLabel && (
                <span className="whitespace-nowrap text-[11px] text-muted-foreground">
                  {t("posted", { time: postedLabel })}
                </span>
              )}
            </div>

            {actions && <div className="flex items-center gap-1.5 sm:mt-1">{actions}</div>}
          </div>
        </div>
      </div>
    </article>
  );
}

function CompanyMark({
  logo,
  name,
  palette,
  alt,
}: {
  logo?: string;
  name: string;
  palette: { bg: string; text: string };
  alt: string;
}) {
  return (
    <div
      className={cn(
        "flex h-11 w-11 items-center justify-center overflow-hidden rounded-xl text-xs font-semibold",
        palette.bg,
        palette.text
      )}
    >
      {logo ? (
         
        <img src={logo} alt={alt} className="h-full w-full object-cover" />
      ) : (
        initialsOf(name)
      )}
    </div>
  );
}
