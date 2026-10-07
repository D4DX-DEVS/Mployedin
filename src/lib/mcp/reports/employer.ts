import Application from "@/models/Application";
import Employer from "@/models/Employer";
import Job from "@/models/Job";
import type { DashboardPeriod } from "@/lib/admin/dashboard/period";
import { getEmployerDashboardStats } from "@/lib/dashboard/employerStats";
import { countsByKey, windowCount, windowRanges } from "./period";

/** Jobs listed one by one; newest first. More would bloat the AI's context. */
const JOB_BREAKDOWN_LIMIT = 25;

/**
 * The employer's own company: the employer dashboard's figures plus period
 * counts and a per-job breakdown. Job titles are the only names in it (owner
 * decision 2026-10-07) — no company name, no candidate names.
 * Returns null when the user owns no Employer profile.
 */
export async function buildEmployerReport(userId: string, period: DashboardPeriod) {
  const employer = await Employer.findOne({ userId }).select("_id").lean<{ _id: unknown } | null>();
  if (!employer) return null;

  const employerId = employer._id;
  const range = windowRanges(period);
  const [stats, received, receivedBefore, hired, hiredBefore, jobs] = await Promise.all([
    getEmployerDashboardStats(userId),
    Application.countDocuments({ employerId, createdAt: range.current }),
    Application.countDocuments({ employerId, createdAt: range.previous }),
    Application.countDocuments({ employerId, statusHistory: { $elemMatch: { status: "hired", changedAt: range.current } } }),
    Application.countDocuments({ employerId, statusHistory: { $elemMatch: { status: "hired", changedAt: range.previous } } }),
    Job.find({ employerId, deletedAt: null })
      .select("title status createdAt")
      .sort({ createdAt: -1 })
      .limit(JOB_BREAKDOWN_LIMIT)
      .lean<Array<{ _id: unknown; title: string; status: string; createdAt: Date }>>(),
  ]);

  const perJobRows = jobs.length
    ? await Application.aggregate<{ _id: { job: unknown; status: string }; count: number }>([
        { $match: { jobId: { $in: jobs.map((job) => job._id) } } },
        { $group: { _id: { job: "$jobId", status: "$status" }, count: { $sum: 1 } } },
      ])
    : [];
  const byJob = new Map<string, Record<string, number>>();
  for (const row of perJobRows) {
    const key = String(row._id.job);
    const statuses = byJob.get(key) ?? {};
    statuses[row._id.status] = row.count;
    byJob.set(key, statuses);
  }

  return {
    scope: "Your company",
    jobs: {
      active: stats.activeJobCount,
      drafts: stats.draftJobCount,
      paused: stats.pausedJobCount,
    },
    applications: {
      total: stats.totalApplications,
      new: stats.newApplications,
      inReview: stats.inReview,
      hired: stats.hiredCount,
      offersSent: stats.offersSent,
      offers: stats.offerCount,
      placements: stats.placements,
    },
    interviews: { scheduled: stats.scheduledInterviews, today: stats.interviewsToday },
    matchQuality: {
      avgMatchScore: Math.round(stats.avgMatchScore),
      band90Plus: stats.band90PlusCount,
      band80to89: stats.band80to89Count,
      needsReview: stats.needsReviewCount,
      lowMatch: stats.lowMatchCount,
    },
    avgDaysToHire: stats.avgTimeToHire,
    inPeriod: {
      applicationsReceived: windowCount(received, receivedBefore),
      hires: windowCount(hired, hiredBefore),
    },
    byJob: jobs.map((job) => {
      const statuses = byJob.get(String(job._id)) ?? {};
      return {
        jobTitle: job.title,
        jobStatus: job.status,
        postedAt: job.createdAt,
        applicants: Object.values(statuses).reduce((sum, count) => sum + count, 0),
        applicantsByStatus: countsByKey(Object.entries(statuses).map(([status, count]) => ({ _id: status, count }))),
      };
    }),
    byJobNote: `Newest ${JOB_BREAKDOWN_LIMIT} jobs at most.`,
  };
}
