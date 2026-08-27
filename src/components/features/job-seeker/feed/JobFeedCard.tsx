"use client";

import { memo, useMemo } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  MapPin,
  Briefcase,
  DollarSign,
  EyeOff,
  Bookmark,
  BookmarkCheck,
  CheckCircle,
  Eye,
  Users,
  Check,
  Zap,
  Loader2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ShareJob } from "@/components/shared/ShareJob";
import { formatLocalizedLocation } from "@/lib/i18n/locations";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface FeedJob {
  _id: string;
  title: string;
  description?: string;
  requirements: {
    skills: string[];
    experienceMin?: number;
    experienceMax?: number;
  };
  salary: { min: number; max: number; currency: string; period?: string };
  location: { country: string; city: string; isRemote: boolean };
  employerId: { _id: string; companyName: string; logo?: string } | null;
  tags?: string[];
  createdAt: string;
  expiresAt?: string;
  matchScore: number;
  matchedSkills?: string[];
  views?: number;
  uniqueViews?: number;
}

interface JobCardProps {
  job: FeedJob;
  isSaved: boolean;
  isApplied: boolean;
  onSave: () => void;
  onApply: () => void;
  onHide: () => void;
  locale: string;
  showMatchScore?: boolean;
  /** Save request in flight for THIS job — disables the button so a double
   *  click cannot fire the mutation twice. */
  savePending?: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const LOGO_PALETTES = [
  { bg: "bg-blue-100", text: "text-blue-700" },
  { bg: "bg-emerald-100", text: "text-emerald-700" },
  { bg: "bg-violet-100", text: "text-violet-700" },
  { bg: "bg-amber-100", text: "text-amber-700" },
  { bg: "bg-rose-100", text: "text-rose-700" },
  { bg: "bg-cyan-100", text: "text-cyan-700" },
];

function logoPalette(name: string) {
  const hash = name.split("").reduce((a, c) => a + c.charCodeAt(0), 0);
  return LOGO_PALETTES[hash % LOGO_PALETTES.length];
}

function initials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function matchColor(score: number) {
  if (score >= 85) return "bg-emerald-600 text-white border-emerald-700";
  if (score >= 70) return "bg-blue-600 text-white border-blue-700";
  return "bg-amber-500 text-white border-amber-600";
}

function relativeTime(iso: string): { key: "justNow" | "hoursAgo" | "daysAgo" | "weeksAgo" | "monthsAgo"; value?: number } {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return { key: "justNow" };
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return { key: "hoursAgo", value: hrs };
  const days = Math.floor(hrs / 24);
  if (days < 7) return { key: "daysAgo", value: days };
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return { key: "weeksAgo", value: weeks };
  return { key: "monthsAgo", value: Math.floor(days / 30) };
}

function isNewJob(createdAt: string) {
  return Date.now() - new Date(createdAt).getTime() < 3 * 24 * 3600_000;
}

function isUrgentJob(expiresAt?: string) {
  if (!expiresAt) return false;
  const remaining = new Date(expiresAt).getTime() - Date.now();
  return remaining > 0 && remaining < 7 * 24 * 3600_000;
}

function fmtSalary(s: { min: number; max: number; currency: string }, numberLocale: string) {
  const fmt = (n: number) => {
    if (n >= 1_000) {
      return new Intl.NumberFormat(numberLocale, {
        notation: "compact",
        maximumFractionDigits: 1,
      }).format(n);
    }

    return n.toLocaleString(numberLocale);
  };
  return `${fmt(s.min)}–${fmt(s.max)} ${s.currency}`;
}

function fmtCount(n: number, numberLocale: string) {
  if (n >= 1000) {
    return new Intl.NumberFormat(numberLocale, {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(n);
  }

  return n.toLocaleString(numberLocale);
}

/**
 * Strips markdown syntax to clean plain text for the compact 2-line preview.
 * AI-generated descriptions contain markdown (**bold**, ### headers, ---, lists)
 * which would otherwise render as raw symbols in the clamped card.
 */
function stripMarkdown(text: string) {
  return text
    .replace(/```[\s\S]*?```/g, " ") // fenced code blocks
    .replace(/`([^`]+)`/g, "$1") // inline code
    .replace(/^\s*#{1,6}\s+/gm, "") // headers
    .replace(/^\s*(?:[-*+]|\d+\.)\s+/gm, "") // list markers
    .replace(/^\s*(?:---+|\*\*\*+|___+)\s*$/gm, " ") // horizontal rules
    .replace(/\*\*([^*]+)\*\*/g, "$1") // bold
    .replace(/\*([^*]+)\*/g, "$1") // italic
    .replace(/__([^_]+)__/g, "$1") // bold (underscore)
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // links → text
    .replace(/^\s*>\s?/gm, "") // blockquotes
    .replace(/\s+/g, " ") // collapse whitespace
    .trim();
}

// ── Component ─────────────────────────────────────────────────────────────────

export const JobFeedCard = memo(function JobFeedCard({
  job,
  isSaved,
  isApplied,
  onSave,
  onApply,
  onHide,
  locale,
  showMatchScore = true,
  savePending = false,
}: JobCardProps) {
  const t = useTranslations("jobFeed.card");
  const numberLocale = locale === "ar" ? "ar-SA" : "en-US";
  const company = job.employerId?.companyName ?? t("company");
  const companyHref = job.employerId?._id
    ? `/${locale}/job-seeker/companies/${job.employerId._id}`
    : null;
  const palette = logoPalette(company);
  const logo = initials(company);
  const urgent = isUrgentJob(job.expiresAt);
  const fresh = isNewJob(job.createdAt);
  const remote = job.location.isRemote;
  const posted = relativeTime(job.createdAt);

  const matchedSet = useMemo(
    () => new Set((job.matchedSkills ?? []).map((s) => s.toLowerCase())),
    [job.matchedSkills],
  );

  return (
    <div
      className="card-base group relative overflow-hidden rounded-lg sm:rounded-3xl border border-border/70 bg-[linear-gradient(135deg,_rgba(255,255,255,0.98),_rgba(248,250,252,0.96))] transition-all duration-200 shadow-[0_18px_48px_-38px_rgba(15,23,42,0.35)] hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-[0_24px_60px_-38px_rgba(37,99,235,0.18)]"
    >
      <div className="flex gap-2 sm:gap-4">
        {/* Card body */}
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 flex-col gap-3 min-[420px]:flex-row min-[420px]:items-start min-[420px]:justify-between">
            <div className="min-w-0 flex-1">
              <div className="hidden text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground sm:block">
                {remote ? t("remoteReady") : t("recommendedRole")}
              </div>
              <Link
                href={`/${locale}/job-seeker/jobs/${job._id}`}
                className="block line-clamp-2 text-base font-semibold text-foreground transition-colors hover:text-primary sm:mt-1 sm:text-[17px]"
              >
                {job.title}
              </Link>
              {companyHref ? (
                <Link
                  href={companyHref}
                  className="mt-1 inline-flex max-w-full text-sm font-medium text-muted-foreground transition-colors hover:text-primary"
                >
                  <span className="truncate">{company}</span>
                </Link>
              ) : (
                <p className="mt-1 text-sm text-muted-foreground truncate">
                  {company}
                </p>
              )}
            </div>

            <div className="flex max-w-full shrink-0 flex-wrap items-start gap-2 min-[420px]:gap-3">
              {showMatchScore && (
                <span
                  className={`inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-semibold ${matchColor(job.matchScore)}`}
                >
                  {t("matchPercent", { score: job.matchScore.toLocaleString(numberLocale) })}
                </span>
              )}

              {companyHref ? (
                <Link
                  href={companyHref}
                  aria-label={t("viewCompany", { company })}
                  className="transition-transform hover:scale-[1.02]"
                >
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-2xl text-xs font-semibold shadow-sm sm:h-12 sm:w-12 ${palette.bg} ${palette.text}`}
                  >
                    {job.employerId?.logo ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={job.employerId.logo} alt={t("companyLogo", { company })} className="h-full w-full rounded-2xl object-cover" />
                    ) : (
                      logo
                    )}
                  </div>
                </Link>
              ) : (
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-2xl text-xs font-semibold shadow-sm sm:h-12 sm:w-12 ${palette.bg} ${palette.text}`}
                >
                  {job.employerId?.logo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={job.employerId.logo} alt={t("companyLogo", { company })} className="h-full w-full rounded-2xl object-cover" />
                  ) : (
                    logo
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Tags row */}
          {(urgent || remote || fresh) && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {urgent && (
                <Badge variant="destructive" dot className="text-[10px] py-0">
                  {t("urgent")}
                </Badge>
              )}
              {remote && (
                <Badge variant="success" dot className="text-[10px] py-0">
                  {t("remote")}
                </Badge>
              )}
              {fresh && (
                <Badge variant="info" dot className="text-[10px] py-0">
                  {t("new")}
                </Badge>
              )}
            </div>
          )}

          {/* Meta: experience · location · salary */}
          {/* One scrollable line on phones instead of two wrapped rows of chips. */}
          <div className="scrollbar-none mt-2 flex flex-nowrap gap-1.5 overflow-x-auto text-xs font-medium text-muted-foreground sm:mt-3 sm:flex-wrap sm:gap-2 sm:overflow-visible">
            {(job.requirements?.experienceMin != null || job.requirements?.experienceMax != null) && (
              <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-border/60 bg-muted/20 px-2.5 py-1">
                <Briefcase className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
                {t("yearsRange", {
                  min: (job.requirements.experienceMin ?? 0).toLocaleString(numberLocale),
                  max: (job.requirements.experienceMax ?? 0).toLocaleString(numberLocale),
                })}
              </span>
            )}
            <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-border/60 bg-muted/20 px-2.5 py-1">
              <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
              {formatLocalizedLocation(job.location, locale, {
                remoteLabel: t("remote"),
                includeLocationForRemote: true,
              })}
            </span>
            {job.salary?.min > 0 && (
              <span className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border border-border/60 bg-muted/20 px-2.5 py-1">
                <DollarSign className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
                {fmtSalary(job.salary, numberLocale)}
              </span>
            )}
          </div>

          {/* Description — hidden on phones: costs 2 lines per card and the full
              text is one tap away on the job detail page. */}
          {job.description && (
            <p className="mt-2 hidden text-xs text-muted-foreground leading-relaxed line-clamp-2 sm:block">
              {stripMarkdown(job.description)}
            </p>
          )}

          {/* Skill tags with match indicators — clamped to one chip row on phones
              so a long skill list can't stretch the card. */}
          {job.requirements?.skills?.length > 0 && (
            <div className="mt-2 flex max-h-7 flex-wrap gap-1.5 overflow-hidden sm:mt-2.5 sm:max-h-none">
              {job.requirements.skills.slice(0, 6).map((skill) => {
                const isMatched = matchedSet.has(skill.toLowerCase());
                return (
                  <span
                    key={skill}
                    className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                      isMatched
                        ? "border-emerald-300 bg-emerald-100 text-emerald-800"
                        : "border-border/60 bg-secondary text-secondary-foreground"
                    }`}
                  >
                    {isMatched && <Check className="h-2.5 w-2.5" />}
                    {skill}
                  </span>
                );
              })}
              {job.requirements.skills.length > 6 && (
                <span className="text-[11px] px-2 py-0.5 text-muted-foreground">
                  +{(job.requirements.skills.length - 6).toLocaleString(numberLocale)}
                </span>
              )}
            </div>
          )}

          {/* Bottom: posted date + stats + actions */}
          <div className="mt-2.5 flex flex-row items-center justify-between gap-2 border-t border-border/40 pt-2.5 sm:mt-4 sm:gap-3 sm:pt-3">
            <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-3 text-[11px] text-muted-foreground">
              <span>{posted.value == null ? t(`time.${posted.key}`) : t(`time.${posted.key}`, { value: posted.value.toLocaleString(numberLocale) })}</span>
              {(job.views ?? 0) > 0 && (
                <span className="hidden items-center gap-1 sm:flex">
                  <Eye className="h-3 w-3" />
                  {fmtCount(job.views!, numberLocale)}
                </span>
              )}
              {(job.uniqueViews ?? 0) > 0 && (
                <span className="hidden items-center gap-1 sm:flex">
                  <Users className="h-3 w-3" />
                  {t("viewers", { count: fmtCount(job.uniqueViews!, numberLocale) })}
                </span>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1.5 sm:gap-2 sm:justify-end">
              <ShareJob
                jobId={job._id}
                jobTitle={job.title}
                companyName={job.employerId?.companyName ?? t("company")}
                locale={locale}
                variant="icon"
              />
              <button
                onClick={onHide}
                className="inline-flex items-center gap-1 rounded-xl border border-border bg-secondary/80 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground chip-pad"
              >
                <EyeOff className="h-3 w-3" />
                <span className="hidden sm:inline">{t("hide")}</span>
              </button>
              <button
                onClick={onSave}
                disabled={savePending}
                className={`inline-flex items-center gap-1 rounded-xl border text-xs transition-colors disabled:opacity-60 ${ isSaved ? "border-amber-300 bg-amber-50 text-amber-700" : "border-border bg-secondary/80 text-muted-foreground hover:bg-accent hover:text-foreground" } chip-pad`}
              >
                {savePending
                  ? <Loader2 className="h-3 w-3 animate-spin" />
                  : isSaved ? <BookmarkCheck className="h-3 w-3" /> : <Bookmark className="h-3 w-3" />}
                <span className="hidden sm:inline">{isSaved ? t("saved") : t("save")}</span>
              </button>
              <button
                onClick={onApply}
                disabled={isApplied}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all sm:px-4 sm:py-2 ${
                  isApplied
                    ? "bg-muted text-muted-foreground cursor-not-allowed"
                    : "bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm hover:shadow-md"
                }`}
              >
                {isApplied ? (
                  <>
                    <CheckCircle className="h-3.5 w-3.5" />
                    {t("applied")}
                  </>
                ) : (
                  <>
                    <Zap className="h-3.5 w-3.5" />
                    {t("easyApply")}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});
