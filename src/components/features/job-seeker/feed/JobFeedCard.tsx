"use client";

import { memo } from "react";
import { useTranslations } from "next-intl";
import { EyeOff, CheckCircle, Check, Zap } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ShareJob } from "@/components/shared/ShareJob";
import { JobSummaryCard, type JobSummary } from "@/components/features/job-seeker/JobSummaryCard";

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
  employmentType?: string;
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
  isApplied: boolean;
  onApply: () => void;
  onHide: () => void;
  locale: string;
  showMatchScore?: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isNewJob(createdAt: string) {
  return Date.now() - new Date(createdAt).getTime() < 3 * 24 * 3600_000;
}

function isUrgentJob(expiresAt?: string) {
  if (!expiresAt) return false;
  const remaining = new Date(expiresAt).getTime() - Date.now();
  return remaining > 0 && remaining < 7 * 24 * 3600_000;
}

export function toJobSummary(job: FeedJob): JobSummary {
  return {
    _id: job._id,
    title: job.title,
    createdAt: job.createdAt,
    matchScore: job.matchScore,
    employmentType: job.employmentType,
    location: job.location,
    salary: job.salary,
    skills: job.requirements?.skills ?? [],
    matchedSkills: job.matchedSkills,
    company: job.employerId
      ? { _id: job.employerId._id, name: job.employerId.companyName, logo: job.employerId.logo }
      : null,
  };
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * The feed's job card is the shared seeker card plus the feed's own actions.
 *
 * It used to be a bespoke 420-line card carrying a description, an experience
 * chip, view counters and up to six skill chips, each of them optional — so two
 * jobs in the same list rendered 250px and 487px tall. The scannable fields now
 * live in `JobSummaryCard` and only the buttons stay here.
 */
export const JobFeedCard = memo(function JobFeedCard({
  job,
  isApplied,
  onApply,
  onHide,
  locale,
  showMatchScore = true,
}: JobCardProps) {
  const t = useTranslations("jobFeed.card");
  const urgent = isUrgentJob(job.expiresAt);
  const fresh = isNewJob(job.createdAt);

  return (
    <JobSummaryCard
      job={toJobSummary(job)}
      locale={locale}
      showMatchScore={showMatchScore}
      statusSlot={
        // At most one status pill: two optional pills stacked meant a card grew
        // a row its neighbour did not have.
        urgent ? (
          <Badge variant="destructive" dot className="py-0 text-[11px]">
            {t("urgent")}
          </Badge>
        ) : fresh ? (
          <Badge variant="info" dot className="py-0 text-[11px]">
            {t("new")}
          </Badge>
        ) : null
      }
      actions={
        <>
          <ShareJob
            jobId={job._id}
            jobTitle={job.title}
            companyName={job.employerId?.companyName ?? t("company")}
            locale={locale}
            variant="icon"
          />
          <button
            type="button"
            onClick={onHide}
            className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-border bg-secondary/80 px-3 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <EyeOff className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{t("hide")}</span>
          </button>
          <button
            type="button"
            onClick={onApply}
            disabled={isApplied}
            className={`inline-flex min-h-11 shrink-0 items-center justify-center gap-1.5 rounded-xl px-4 text-xs font-semibold transition-all ${
              isApplied
                ? "cursor-not-allowed bg-muted text-muted-foreground"
                : "bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 hover:shadow-md"
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
        </>
      }
    />
  );
});

/** Kept for the selection checkmark used by the feed's compare mode. */
export { Check as JobFeedCheck };
