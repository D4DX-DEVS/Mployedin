"use client";

import { memo, useMemo } from "react";
import Link from "next/link";
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
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";

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
  isSelected: boolean;
  isSaved: boolean;
  isApplied: boolean;
  onToggleSelect: () => void;
  onSave: () => void;
  onApply: () => void;
  onHide: () => void;
  locale: string;
  showMatchScore?: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const LOGO_PALETTES = [
  { bg: "bg-blue-100 dark:bg-blue-900/40", text: "text-blue-700 dark:text-blue-300" },
  { bg: "bg-emerald-100 dark:bg-emerald-900/40", text: "text-emerald-700 dark:text-emerald-300" },
  { bg: "bg-violet-100 dark:bg-violet-900/40", text: "text-violet-700 dark:text-violet-300" },
  { bg: "bg-amber-100 dark:bg-amber-900/40", text: "text-amber-700 dark:text-amber-300" },
  { bg: "bg-rose-100 dark:bg-rose-900/40", text: "text-rose-700 dark:text-rose-300" },
  { bg: "bg-cyan-100 dark:bg-cyan-900/40", text: "text-cyan-700 dark:text-cyan-300" },
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
  if (score >= 85) return "bg-emerald-600 text-white border-emerald-700 dark:bg-emerald-600 dark:text-white dark:border-emerald-500";
  if (score >= 70) return "bg-blue-600 text-white border-blue-700 dark:bg-blue-600 dark:text-white dark:border-blue-500";
  return "bg-amber-500 text-white border-amber-600 dark:bg-amber-500 dark:text-white dark:border-amber-400";
}

function relativeTime(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return "just now";
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return "1 day ago";
  if (days < 7) return `${days} days ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function isNewJob(createdAt: string) {
  return Date.now() - new Date(createdAt).getTime() < 3 * 24 * 3600_000;
}

function isUrgentJob(expiresAt?: string) {
  if (!expiresAt) return false;
  const remaining = new Date(expiresAt).getTime() - Date.now();
  return remaining > 0 && remaining < 7 * 24 * 3600_000;
}

function fmtSalary(s: { min: number; max: number; currency: string }) {
  const fmt = (n: number) => {
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
    return n.toString();
  };
  return `${fmt(s.min)}–${fmt(s.max)} ${s.currency}`;
}

function fmtCount(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toString();
}

// ── Component ─────────────────────────────────────────────────────────────────

export const JobFeedCard = memo(function JobFeedCard({
  job,
  isSelected,
  isSaved,
  isApplied,
  onToggleSelect,
  onSave,
  onApply,
  onHide,
  locale,
  showMatchScore = true,
}: JobCardProps) {
  const company = job.employerId?.companyName ?? "Company";
  const palette = logoPalette(company);
  const logo = initials(company);
  const urgent = isUrgentJob(job.expiresAt);
  const fresh = isNewJob(job.createdAt);
  const remote = job.location.isRemote;

  const matchedSet = useMemo(
    () => new Set((job.matchedSkills ?? []).map((s) => s.toLowerCase())),
    [job.matchedSkills],
  );

  return (
    <div
      className={`card-base group relative overflow-hidden rounded-[26px] border border-border/70 bg-[linear-gradient(135deg,_rgba(255,255,255,0.98),_rgba(248,250,252,0.96))] transition-all duration-200 shadow-[0_18px_48px_-38px_rgba(15,23,42,0.35)] hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-[0_24px_60px_-38px_rgba(37,99,235,0.18)] ${
        isSelected
          ? "border-primary/60 bg-primary/[0.04] ring-1 ring-primary/20"
          : ""
      }`}
    >
      <div className="flex gap-2 sm:gap-3.5">
        {/* Bulk-select checkbox */}
        <div className="pt-0.5">
          <Checkbox
            checked={isSelected}
            onCheckedChange={() => onToggleSelect()}
            aria-label={isSelected ? "Deselect job" : "Select job"}
          />
        </div>

        {/* Card body */}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {remote ? "Remote-ready" : "Recommended role"}
              </div>
              <Link
                href={`/${locale}/job-seeker/jobs/${job._id}`}
                className="mt-1 block line-clamp-2 text-base font-semibold text-foreground transition-colors hover:text-primary sm:text-[17px]"
              >
                {job.title}
              </Link>
              <p className="mt-1 text-sm text-muted-foreground truncate">
                {company}
              </p>
            </div>

            <div className="flex shrink-0 items-start gap-3">
              {showMatchScore && (
                <span
                  className={`inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 text-[11px] font-semibold ${matchColor(job.matchScore)}`}
                >
                  {job.matchScore}% match
                </span>
              )}

              <div
                className={`flex h-12 w-12 items-center justify-center rounded-2xl text-xs font-semibold shadow-sm ${palette.bg} ${palette.text}`}
              >
                {job.employerId?.logo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={job.employerId.logo} alt={`${company} logo`} className="h-full w-full rounded-2xl object-cover" />
                ) : (
                  logo
                )}
              </div>
            </div>
          </div>

          {/* Tags row */}
          {(urgent || remote || fresh) && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {urgent && (
                <Badge variant="destructive" dot className="text-[10px] py-0">
                  Urgent
                </Badge>
              )}
              {remote && (
                <Badge variant="success" dot className="text-[10px] py-0">
                  Remote
                </Badge>
              )}
              {fresh && (
                <Badge variant="info" dot className="text-[10px] py-0">
                  New
                </Badge>
              )}
            </div>
          )}

          {/* Meta: experience · location · salary */}
          <div className="mt-3 flex flex-wrap gap-2 text-xs font-medium text-muted-foreground">
            {(job.requirements?.experienceMin != null || job.requirements?.experienceMax != null) && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/20 px-2.5 py-1">
                <Briefcase className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
                {job.requirements.experienceMin ?? 0}–{job.requirements.experienceMax ?? 0} yrs
              </span>
            )}
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/20 px-2.5 py-1">
              <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
              {job.location.city}
              {remote && job.location.city ? " · Remote" : ""}
              {!remote && job.location.country ? `, ${job.location.country}` : ""}
              {remote && !job.location.city ? "Remote" : ""}
            </span>
            {job.salary?.min > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-muted/20 px-2.5 py-1">
                <DollarSign className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
                {fmtSalary(job.salary)}
              </span>
            )}
          </div>

          {/* Description */}
          {job.description && (
            <p className="mt-2 text-xs text-muted-foreground leading-relaxed line-clamp-2">
              {job.description}
            </p>
          )}

          {/* Skill tags with match indicators */}
          {job.requirements?.skills?.length > 0 && (
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {job.requirements.skills.slice(0, 6).map((skill) => {
                const isMatched = matchedSet.has(skill.toLowerCase());
                return (
                  <span
                    key={skill}
                    className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                      isMatched
                        ? "border-emerald-300 bg-emerald-100 text-emerald-800 dark:border-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200"
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
                  +{job.requirements.skills.length - 6}
                </span>
              )}
            </div>
          )}

          {/* Bottom: posted date + stats + actions */}
          <div className="mt-4 flex flex-col gap-3 border-t border-border/40 pt-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
              <span>{relativeTime(job.createdAt)}</span>
              {(job.views ?? 0) > 0 && (
                <span className="flex items-center gap-1">
                  <Eye className="h-3 w-3" />
                  {fmtCount(job.views!)}
                </span>
              )}
              {(job.uniqueViews ?? 0) > 0 && (
                <span className="flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  {fmtCount(job.uniqueViews!)} viewers
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 sm:justify-end">
              <button
                onClick={onHide}
                className="inline-flex items-center gap-1 rounded-xl border border-border bg-secondary/80 px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <EyeOff className="h-3 w-3" />
                <span className="hidden sm:inline">Hide</span>
              </button>
              <button
                onClick={onSave}
                className={`inline-flex items-center gap-1 rounded-xl border px-3 py-2 text-xs transition-colors ${
                  isSaved
                    ? "border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-400"
                    : "border-border bg-secondary/80 text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                {isSaved ? <BookmarkCheck className="h-3 w-3" /> : <Bookmark className="h-3 w-3" />}
                <span className="hidden sm:inline">{isSaved ? "Saved" : "Save"}</span>
              </button>
              <button
                onClick={onApply}
                disabled={isApplied}
                className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold transition-all ${
                  isApplied
                    ? "bg-muted text-muted-foreground cursor-not-allowed"
                    : "bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm hover:shadow-md"
                }`}
              >
                {isApplied ? (
                  <>
                    <CheckCircle className="h-3.5 w-3.5" />
                    Applied
                  </>
                ) : (
                  <>
                    <Zap className="h-3.5 w-3.5" />
                    Easy Apply
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
