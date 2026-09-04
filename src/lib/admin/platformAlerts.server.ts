import { connectDB } from "@/lib/db/mongoose";
import Job from "@/models/Job";
import Application from "@/models/Application";
import Placement from "@/models/Placement";
import {
  buildPlatformAlerts,
  OPEN_APPLICATION_STATUSES,
  STALE_APPLICATION_MS,
  type PlatformAlert,
} from "./platformAlerts";

/**
 * Runs the queries the alerts need. Deliberately narrow — the dashboard should
 * not pay for the full analytics aggregation to learn what needs attention.
 * `periodDays` matches the analytics route's default comparison window.
 */
export async function getPlatformAlerts(periodDays = 30): Promise<PlatformAlert[]> {
  await connectDB();

  const now = new Date();
  const periodMs = periodDays * 24 * 60 * 60 * 1000;
  const currentPeriodStart = new Date(now.getTime() - periodMs);
  const previousPeriodStart = new Date(now.getTime() - periodMs * 2);
  const staleThreshold = new Date(now.getTime() - STALE_APPLICATION_MS);

  const [
    jobsWithoutApplicationsAgg,
    staleOpenApplications,
    currentApplications,
    previousApplications,
    currentPlacements,
    currentJobs,
    previousJobs,
    totalApplications,
    totalPlacements,
  ] = await Promise.all([
    Job.aggregate<{ count: number }>([
      { $match: { deletedAt: null } },
      {
        $lookup: {
          from: "applications",
          let: { jobId: "$_id" },
          pipeline: [
            { $match: { $expr: { $eq: ["$jobId", "$$jobId"] } } },
            { $limit: 1 },
          ],
          as: "applications",
        },
      },
      { $match: { "applications.0": { $exists: false } } },
      { $count: "count" },
    ]),
    Application.countDocuments({
      status: { $in: OPEN_APPLICATION_STATUSES },
      appliedAt: { $lte: staleThreshold },
    }),
    Application.countDocuments({ appliedAt: { $gte: currentPeriodStart } }),
    Application.countDocuments({ appliedAt: { $gte: previousPeriodStart, $lt: currentPeriodStart } }),
    Placement.countDocuments({ placedAt: { $gte: currentPeriodStart } }),
    Job.countDocuments({ deletedAt: null, createdAt: { $gte: currentPeriodStart } }),
    Job.countDocuments({ deletedAt: null, createdAt: { $gte: previousPeriodStart, $lt: currentPeriodStart } }),
    Application.countDocuments(),
    Placement.countDocuments(),
  ]);

  return buildPlatformAlerts({
    jobsWithoutApplications: jobsWithoutApplicationsAgg[0]?.count ?? 0,
    staleOpenApplications,
    currentApplications,
    previousApplications,
    currentPlacements,
    currentJobs,
    previousJobs,
    placementRatePercent:
      totalApplications > 0 ? Math.round((totalPlacements / totalApplications) * 100) : 0,
  });
}
