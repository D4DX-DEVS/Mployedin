import Application, { type ApplicationStatus } from "@/models/Application";
import Job from "@/models/Job";
import { jobsExpiringFilter } from "@/lib/admin/queueFilters";
import type { DashboardPeriod } from "./period";
import { countActiveJobs, getJobDemandBuckets } from "./shared.server";
import type { HiringFunnel, JobHealth, PipelineStage, RecruitmentOverview } from "./types";

/** Application statuses in pipeline order, then the two closed outcomes. */
export const PIPELINE_STATUSES: readonly ApplicationStatus[] = [
  "applied",
  "shortlisted",
  "interview_scheduled",
  "selected",
  "offer",
  "hired",
  "rejected",
  "withdrawn",
];

/** Statuses that prove an application got at least as far as an interview / an offer. */
export const INTERVIEW_OR_LATER: readonly ApplicationStatus[] = ["interview_scheduled", "selected", "offer", "hired"];
export const OFFER_OR_LATER: readonly ApplicationStatus[] = ["offer", "hired"];

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

interface FunnelRow {
  total: number;
  interview: number;
  offer: number;
  hired: number;
  reviewMs: number | null;
  hireMs: number | null;
}

/** First `changedAt` in the history whose status matches `cond`, or null. */
function firstChange(cond: Record<string, unknown>) {
  return {
    $min: {
      $map: {
        input: { $filter: { input: { $ifNull: ["$statusHistory", []] }, cond } },
        in: "$$this.changedAt",
      },
    },
  };
}

/** Count of applications whose history or current status includes one of `statuses`. */
function reached(statuses: readonly string[]) {
  return { $sum: { $cond: [{ $gt: [{ $size: { $setIntersection: ["$statuses", [...statuses]] } }, 0] }, 1, 0] } };
}

/** Mean of a duration, ignoring rows without both dates and any negative (mis-dated) gap. */
function meanDuration(field: string) {
  return { $avg: { $cond: [{ $and: [{ $ne: [field, null] }, { $gte: [field, 0] }] }, field, null] } };
}

export async function getHiringFunnel(): Promise<HiringFunnel> {
  const [row] = await Application.aggregate<FunnelRow>([
    {
      $project: {
        statuses: { $concatArrays: [["$status"], { $ifNull: ["$statusHistory.status", []] }] },
        applied: { $ifNull: ["$appliedAt", "$createdAt"] },
        firstReview: firstChange({ $ne: ["$$this.status", "applied"] }),
        hiredAt: firstChange({ $eq: ["$$this.status", "hired"] }),
      },
    },
    {
      $project: {
        statuses: 1,
        reviewGap: { $cond: [{ $and: ["$firstReview", "$applied"] }, { $subtract: ["$firstReview", "$applied"] }, null] },
        hireGap: { $cond: [{ $and: ["$hiredAt", "$applied"] }, { $subtract: ["$hiredAt", "$applied"] }, null] },
      },
    },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        interview: reached(INTERVIEW_OR_LATER),
        offer: reached(OFFER_OR_LATER),
        hired: reached(["hired"]),
        reviewMs: meanDuration("$reviewGap"),
        hireMs: meanDuration("$hireGap"),
      },
    },
  ]);

  return {
    applications: row?.total ?? 0,
    reachedInterview: row?.interview ?? 0,
    reachedOffer: row?.offer ?? 0,
    hired: row?.hired ?? 0,
    avgHoursToFirstReview: row?.reviewMs == null ? null : Math.round((row.reviewMs / HOUR_MS) * 10) / 10,
    avgDaysToHire: row?.hireMs == null ? null : Math.round((row.hireMs / DAY_MS) * 10) / 10,
  };
}

export async function getJobHealth(period: DashboardPeriod): Promise<JobHealth> {
  const { now, start } = period;
  const [activeJobs, demand, expiringSoon, paused, drafts, expiredInPeriod] = await Promise.all([
    countActiveJobs(),
    getJobDemandBuckets(),
    Job.countDocuments(jobsExpiringFilter(7, now)),
    Job.countDocuments({ status: "paused", deletedAt: null }),
    Job.countDocuments({ status: "draft", deletedAt: null }),
    Job.countDocuments({ status: "expired", deletedAt: null, expiresAt: { $gte: start, $lte: now } }),
  ]);
  return { activeJobs, lowVolume: demand.low, expiringSoon, paused, drafts, expiredInPeriod };
}

export async function getRecruitmentOverview(period: DashboardPeriod): Promise<RecruitmentOverview> {
  const [statusRows, jobs, funnel] = await Promise.all([
    Application.aggregate<{ _id: string; count: number }>([{ $group: { _id: "$status", count: { $sum: 1 } } }]),
    getJobHealth(period),
    getHiringFunnel(),
  ]);
  const byStatus = new Map(statusRows.map((row) => [row._id, row.count]));
  const pipeline: PipelineStage[] = PIPELINE_STATUSES.map((status) => ({ status, count: byStatus.get(status) ?? 0 }));
  return { pipeline, jobs, funnel };
}
