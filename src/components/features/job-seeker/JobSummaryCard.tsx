"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { MapPin, Wallet, Briefcase } from "lucide-react";
import { cn } from "@/lib/utils";
import { PublicImage } from "@/components/shared/PublicImage";
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
  salary?: { min?: number; max?: number; currency?: string; isNegotiable?: boolean } | null;
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
  /** Hide the match ring where no score is meaningful (plain search results). */
  showMatchScore?: boolean;
  /** Extra pill for the job's state, e.g. "New" or "Closed". */
  statusSlot?: ReactNode;
  /**
   * Phones only: the save (bookmark) toggle shown as an icon beside the
   * card's action. Callers keep their own labelled copy in `actions` wrapped
   * in `max-sm:hidden`, so the desktop button order is unchanged.
   */
  bookmark?: ReactNode;
  className?: string;
}

/** Skill chips shown on wider screens before the "+N" overflow. */
export const MAX_VISIBLE_SKILLS = 3;

/**
 * Kept for callers and tests that pinned the old phone cap. Phones now show
 * every chip in a strip that scrolls sideways instead of a fixed two.
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

/** Arc colour of the match ring, same bands as matchToneClass. */
export function matchRingToneClass(score: number) {
  if (score >= 85) return "text-emerald-600";
  if (score >= 70) return "text-blue-600";
  return "text-amber-600";
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
  // One figure when the range is a single amount ("800 KWD", not "800–800 KWD").
  if (salary.min === salary.max) return `${fmt(salary.min)} ${salary.currency}`;
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
  bookmark,
  className,
}: JobSummaryCardProps) {
  const t = useTranslations("jobCard");
  const numberLocale = locale === "ar" ? "ar-SA" : "en-US";
  const companyName = job.company?.name?.trim() || t("company");
  const companyHref = job.company?._id ? `/${locale}/job-seeker/companies/${job.company._id}` : null;
  const palette = logoPalette(companyName);
  const jobHref = `/${locale}/job-seeker/jobs/${job._id}`;

  const salaryFigure = formatSalaryRange(job.salary, numberLocale);
  // Same words as the public job page: the figure, marked negotiable when it is.
  const salaryLabel = salaryFigure && job.salary?.isNegotiable ? t("salaryNegotiable", { amount: salaryFigure }) : salaryFigure;
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
  const score = showMatchScore && typeof job.matchScore === "number" ? job.matchScore : null;

  // Matched skills lead: the seeker should see what they already have first.
  const matchedSet = new Set((job.matchedSkills ?? []).map((s) => s.toLowerCase()));
  const orderedSkills = [...(job.skills ?? [])].sort((a, b) => {
    const am = matchedSet.has(a.toLowerCase()) ? 0 : 1;
    const bm = matchedSet.has(b.toLowerCase()) ? 0 : 1;
    return am - bm;
  });
  // Wider screens show the first few and a "+N"; a phone shows every chip in
  // a strip that scrolls sideways, so the row never wraps or cuts a chip.
  const hiddenSkillCount = Math.max(0, orderedSkills.length - MAX_VISIBLE_SKILLS);

  /*
   * One grid, every element rendered once (no phone/desktop copies of a
   * button). Placement:
   *   phone   r1: mark | title + company | ring
   *           r2: status · location · pay · type · age   (one line, ellipsis)
   *           r3: skill strip ................ | save + action
   *   wider   r1-3 mark; r1 title, r2 meta, r3 skills; r1-2 status/ring/age; r3 actions
   * The owner asked (2026-11-12) for phone cards "more compact, inline": the
   * old phone card stacked the actions under a divider and ran ~300px tall.
   */
  return (
    <article
      data-testid="job-summary-card"
      className={cn(
        "group relative grid grid-cols-[40px_minmax(0,1fr)_auto] items-start gap-x-3 rounded-2xl border border-border/80 bg-card p-3 shadow-[0_2px_8px_-2px_rgba(15,23,42,0.08),0_1px_3px_-1px_rgba(15,23,42,0.06)] transition-all duration-200 hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-[0_12px_24px_-4px_rgba(15,23,42,0.12),0_4px_8px_-2px_rgba(15,23,42,0.06)] sm:grid-cols-[44px_minmax(0,1fr)_auto] sm:gap-x-4 sm:p-4",
        className
      )}
    >
      <div className="col-start-1 row-start-1 sm:row-span-3">
        {companyHref ? (
          <Link href={companyHref} aria-label={t("viewCompany", { company: companyName })} className="block">
            <CompanyMark logo={job.company?.logo} name={companyName} palette={palette} alt={t("companyLogo", { company: companyName })} />
          </Link>
        ) : (
          <CompanyMark logo={job.company?.logo} name={companyName} palette={palette} alt={t("companyLogo", { company: companyName })} />
        )}
      </div>

      <div className="col-start-2 row-start-1 min-w-0">
        <h3 className="min-w-0 text-[15px] font-semibold leading-5 text-foreground sm:text-base">
          <Link href={jobHref} className="line-clamp-2 transition-colors hover:text-primary sm:line-clamp-1">
            {job.title}
          </Link>
        </h3>
        <p className="mt-0.5 truncate text-sm text-muted-foreground">{companyName}</p>
      </div>

      {/* Status, match and age. A phone keeps only the ring here; its status
          and age move into the one-line meta row below. */}
      <div className="col-start-3 row-start-1 flex flex-col items-end gap-1.5 sm:row-span-2">
        {statusSlot && <div className="max-sm:hidden">{statusSlot}</div>}
        {score !== null && (
          <MatchRing
            score={score}
            label={t("matchPercent", { score: score.toLocaleString(numberLocale) })}
            text={`${score.toLocaleString(numberLocale)}%`}
          />
        )}
        {postedLabel && (
          <span className="whitespace-nowrap text-[11px] text-muted-foreground max-sm:hidden">
            {t("posted", { time: postedLabel })}
          </span>
        )}
      </div>

      {/* Meta. Phone: one line joined by dots, cut with an ellipsis. Wider:
          the same facts with icons, still one row. */}
      <div
        data-card-meta
        className="col-span-3 col-start-1 row-start-2 mt-2 text-xs text-muted-foreground max-sm:truncate max-sm:[&>span+span]:before:mx-1.5 max-sm:[&>span+span]:before:content-['·'] sm:col-span-1 sm:col-start-2 sm:flex sm:flex-nowrap sm:items-center sm:gap-x-3 sm:overflow-hidden"
      >
        {statusSlot && <span className="sm:hidden [&>*]:inline-flex [&>*]:align-middle">{statusSlot}</span>}
        <span className="sm:inline-flex sm:shrink-0 sm:items-center sm:gap-1.5">
          <MapPin className="h-3.5 w-3.5 shrink-0 opacity-70 max-sm:hidden" aria-hidden />
          {formatLocalizedLocation(job.location ?? undefined, locale, {
            remoteLabel: t("remote"),
            fallback: t("locationFlexible"),
            includeLocationForRemote: true,
          })}
        </span>
        {salaryLabel && (
          <span className="sm:inline-flex sm:shrink-0 sm:items-center sm:gap-1.5">
            <Wallet className="h-3.5 w-3.5 shrink-0 opacity-70 max-sm:hidden" aria-hidden />
            {salaryLabel}
          </span>
        )}
        {employmentLabel && (
          <span className="sm:inline-flex sm:shrink-0 sm:items-center sm:gap-1.5">
            <Briefcase className="h-3.5 w-3.5 shrink-0 opacity-70 max-sm:hidden" aria-hidden />
            {employmentLabel}
          </span>
        )}
        {postedLabel && <span className="sm:hidden">{postedLabel}</span>}
      </div>

      {orderedSkills.length > 0 && (
        <div className="scrollbar-none col-span-2 col-start-1 row-start-3 mt-2.5 flex min-w-0 flex-nowrap items-center gap-1.5 self-center max-sm:overflow-x-auto max-sm:[mask-image:linear-gradient(to_right,#000_80%,transparent)] max-sm:rtl:[mask-image:linear-gradient(to_left,#000_80%,transparent)] sm:col-span-1 sm:col-start-2 sm:overflow-hidden">
          {orderedSkills.map((skill, index) => {
            const isMatched = matchedSet.has(skill.toLowerCase());
            return (
              <span
                key={skill}
                title={skill}
                className={cn(
                  // `inline-block`, not `inline-flex`: text-overflow needs a
                  // block container (a flex box's bare text gets no ellipsis).
                  "inline-block max-w-[60%] shrink-0 truncate rounded-full border px-2.5 py-0.5 text-[11px] font-medium sm:max-w-[40%]",
                  index >= MAX_VISIBLE_SKILLS && "sm:hidden",
                  isMatched
                    ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                    : "border-border/60 bg-secondary text-secondary-foreground"
                )}
              >
                {skill}
              </span>
            );
          })}
          {hiddenSkillCount > 0 && (
            <span className="hidden shrink-0 text-[11px] font-medium text-muted-foreground sm:inline">
              {t("moreSkills", { count: hiddenSkillCount.toLocaleString(numberLocale) })}
            </span>
          )}
        </div>
      )}

      {(actions || bookmark) && (
        <div
          data-card-footer
          className="col-start-3 row-start-3 mt-2.5 flex items-center justify-end gap-1.5 self-end [&>*]:shrink-0 max-sm:[&_a]:min-h-10 max-sm:[&_button]:min-h-10"
        >
          {/* Phone: the save toggle sits beside the action as an icon. Callers
              keep their own labelled copy in `actions` behind `max-sm:hidden`. */}
          {bookmark && <div className="sm:hidden [&>button]:size-10 [&>button]:px-0">{bookmark}</div>}
          {actions}
        </div>
      )}
    </article>
  );
}

/** Match score as a small ring: the arc fills to the score, coloured by band. */
function MatchRing({ score, label, text }: { score: number; label: string; text: string }) {
  const pct = Math.max(0, Math.min(100, score));
  const r = 17;
  const circumference = 2 * Math.PI * r;
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      data-match-ring
      className="relative inline-flex size-10 shrink-0 items-center justify-center sm:size-11"
    >
      <svg viewBox="0 0 40 40" className="absolute inset-0 size-full -rotate-90" aria-hidden="true">
        <circle cx="20" cy="20" r={r} fill="none" strokeWidth="3.5" className="stroke-muted" />
        <circle
          cx="20"
          cy="20"
          r={r}
          fill="none"
          strokeWidth="3.5"
          strokeLinecap="round"
          stroke="currentColor"
          className={matchRingToneClass(score)}
          strokeDasharray={`${(pct / 100) * circumference} ${circumference}`}
        />
      </svg>
      <span className="relative text-[11px] font-bold tabular-nums text-foreground" aria-hidden="true">
        {text}
      </span>
    </span>
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
        "flex size-10 items-center justify-center overflow-hidden rounded-full text-xs font-semibold sm:size-11",
        palette.bg,
        palette.text
      )}
    >
      <PublicImage src={logo} alt={alt} className="h-full w-full bg-card object-contain p-1" fallback={initialsOf(name)} />
    </div>
  );
}
