import { NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import Job from "@/models/Job";
import Application from "@/models/Application";
import Placement from "@/models/Placement";
import Commission from "@/models/Commission";
import Interview from "@/models/Interview";
import Agent from "@/models/Agent";
import logger from "@/lib/logger";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000;
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const STATUS_GROUPS = [
  { key: "pending", label: "Pending", statuses: ["applied"], toneKey: "sky" },
  { key: "shortlisted", label: "Shortlisted", statuses: ["shortlisted"], toneKey: "violet" },
  { key: "interviewed", label: "Interviewed", statuses: ["interview_scheduled"], toneKey: "amber" },
  { key: "selected", label: "Selected", statuses: ["selected"], toneKey: "emerald" },
  { key: "offered", label: "Offered", statuses: ["offer"], toneKey: "sky" },
  { key: "hired", label: "Hired", statuses: ["hired"], toneKey: "emerald" },
  { key: "rejected", label: "Rejected", statuses: ["rejected"], toneKey: "rose" },
  { key: "withdrawn", label: "Withdrawn", statuses: ["withdrawn"], toneKey: "slate" },
] as const;

type AggregateMonthRow = {
  _id: {
    year: number;
    month: number;
  };
  count: number;
};

function buildTrend(current: number, previous: number) {
  const delta = previous === 0
    ? current === 0
      ? 0
      : 100
    : Number((((current - previous) / previous) * 100).toFixed(1));

  return {
    current,
    previous,
    delta,
    direction: delta > 0 ? "up" : delta < 0 ? "down" : "flat",
  } as const;
}

function buildMonthlySeed(now: Date, months = 6) {
  return Array.from({ length: months }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (months - index - 1), 1);
    return {
      key: `${date.getFullYear()}-${date.getMonth() + 1}`,
      label: `${MONTH_NAMES[date.getMonth()]} ${String(date.getFullYear()).slice(-2)}`,
    };
  });
}

function buildMonthlySeries(now: Date, jobsRows: AggregateMonthRow[], applicationRows: AggregateMonthRow[]) {
  const seed = buildMonthlySeed(now);
  const jobsMap = new Map(jobsRows.map((row) => [`${row._id.year}-${row._id.month}`, row.count]));
  const applicationsMap = new Map(applicationRows.map((row) => [`${row._id.year}-${row._id.month}`, row.count]));

  return seed.map((month) => ({
    label: month.label,
    jobs: jobsMap.get(month.key) ?? 0,
    applications: applicationsMap.get(month.key) ?? 0,
  }));
}

function formatStatus(status: string) {
  return status.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

export const GET = withAuth(async () => {
  try {
    await connectDB();

    const now = new Date();
    const currentPeriodStart = new Date(now.getTime() - THIRTY_DAYS_MS);
    const previousPeriodStart = new Date(now.getTime() - (THIRTY_DAYS_MS * 2));
    const monthlyWindowStart = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const staleThreshold = new Date(now.getTime() - FORTY_EIGHT_HOURS_MS);

    const [
      totalJobs,
      totalApplications,
      totalPlacements,
      totalInterviews,
      revenueAgg,
      currentJobs,
      previousJobs,
      currentApplications,
      previousApplications,
      currentPlacements,
      previousPlacements,
      currentRevenueAgg,
      previousRevenueAgg,
      appsByStatus,
      jobsByMonth,
      applicationsByMonth,
      jobsWithoutApplicationsAgg,
      staleOpenApplications,
      recentJobs,
      recentApplications,
      topAgents,
    ] = await Promise.all([
    Job.countDocuments({ deletedAt: null }),
    Application.countDocuments(),
    Placement.countDocuments(),
    Interview.countDocuments({ status: { $in: ["scheduled", "confirmed", "completed", "rescheduled"] } }),
    Commission.aggregate([
      { $match: { status: "paid" } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]),
    Job.countDocuments({ deletedAt: null, createdAt: { $gte: currentPeriodStart } }),
    Job.countDocuments({ deletedAt: null, createdAt: { $gte: previousPeriodStart, $lt: currentPeriodStart } }),
    Application.countDocuments({ appliedAt: { $gte: currentPeriodStart } }),
    Application.countDocuments({ appliedAt: { $gte: previousPeriodStart, $lt: currentPeriodStart } }),
    Placement.countDocuments({ placedAt: { $gte: currentPeriodStart } }),
    Placement.countDocuments({ placedAt: { $gte: previousPeriodStart, $lt: currentPeriodStart } }),
    Commission.aggregate([
      { $match: { status: "paid", paidAt: { $gte: currentPeriodStart } } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]),
    Commission.aggregate([
      { $match: { status: "paid", paidAt: { $gte: previousPeriodStart, $lt: currentPeriodStart } } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]),
    Application.aggregate<{ _id: string; count: number }>([
      { $group: { _id: "$status", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
    Job.aggregate<AggregateMonthRow>([
      { $match: { deletedAt: null, createdAt: { $gte: monthlyWindowStart } } },
      {
        $group: {
          _id: {
            year: { $year: "$createdAt" },
            month: { $month: "$createdAt" },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } },
    ]),
    Application.aggregate<AggregateMonthRow>([
      {
        $project: {
          bucketDate: { $ifNull: ["$appliedAt", "$createdAt"] },
        },
      },
      { $match: { bucketDate: { $gte: monthlyWindowStart } } },
      {
        $group: {
          _id: {
            year: { $year: "$bucketDate" },
            month: { $month: "$bucketDate" },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } },
    ]),
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
      status: { $in: ["applied", "shortlisted", "interview_scheduled", "selected", "offer"] },
      appliedAt: { $lte: staleThreshold },
    }),
    Job.aggregate<{
      _id: string;
      title: string;
      status: string;
      createdAt: string;
      employerName: string;
      applicationCount: number;
    }>([
      { $match: { deletedAt: null } },
      { $sort: { createdAt: -1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: "employers",
          localField: "employerId",
          foreignField: "_id",
          as: "employer",
        },
      },
      {
        $lookup: {
          from: "applications",
          let: { jobId: "$_id" },
          pipeline: [
            { $match: { $expr: { $eq: ["$jobId", "$$jobId"] } } },
            { $count: "count" },
          ],
          as: "applicationStats",
        },
      },
      {
        $project: {
          title: 1,
          status: 1,
          createdAt: 1,
          employerName: { $ifNull: [{ $arrayElemAt: ["$employer.companyName", 0] }, "Unknown employer"] },
          applicationCount: { $ifNull: [{ $arrayElemAt: ["$applicationStats.count", 0] }, 0] },
        },
      },
    ]),
    Application.aggregate<{
      _id: string;
      status: string;
      appliedAt: string;
      jobTitle: string;
      employerName: string;
    }>([
      { $sort: { appliedAt: -1, createdAt: -1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: "jobs",
          localField: "jobId",
          foreignField: "_id",
          as: "job",
        },
      },
      {
        $lookup: {
          from: "employers",
          localField: "employerId",
          foreignField: "_id",
          as: "employer",
        },
      },
      {
        $project: {
          status: 1,
          appliedAt: { $ifNull: ["$appliedAt", "$createdAt"] },
          jobTitle: { $ifNull: [{ $arrayElemAt: ["$job.title", 0] }, "Unknown role"] },
          employerName: { $ifNull: [{ $arrayElemAt: ["$employer.companyName", 0] }, "Unknown employer"] },
        },
      },
    ]),
    Agent.aggregate<{
      _id: string;
      name: string;
      jobs: number;
      applications: number;
      placements: number;
      revenue: number;
    }>([
      {
        $lookup: {
          from: "users",
          localField: "userId",
          foreignField: "_id",
          as: "user",
        },
      },
      {
        $lookup: {
          from: "jobs",
          let: { agentId: "$_id" },
          pipeline: [
            { $match: { $expr: { $eq: ["$agentId", "$$agentId"] } } },
            { $count: "count" },
          ],
          as: "jobsStats",
        },
      },
      {
        $lookup: {
          from: "applications",
          let: { agentId: "$_id" },
          pipeline: [
            { $match: { $expr: { $eq: ["$agentId", "$$agentId"] } } },
            { $count: "count" },
          ],
          as: "applicationStats",
        },
      },
      {
        $lookup: {
          from: "placements",
          let: { agentId: "$_id" },
          pipeline: [
            { $match: { $expr: { $eq: ["$agentId", "$$agentId"] } } },
            { $count: "count" },
          ],
          as: "placementStats",
        },
      },
      {
        $lookup: {
          from: "commissions",
          let: { agentId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: {
                  $and: [
                    { $eq: ["$agentId", "$$agentId"] },
                    { $eq: ["$status", "paid"] },
                  ],
                },
              },
            },
            { $group: { _id: null, total: { $sum: "$amount" } } },
          ],
          as: "revenueStats",
        },
      },
      {
        $project: {
          name: { $ifNull: [{ $arrayElemAt: ["$user.name", 0] }, "Unassigned agent"] },
          jobs: { $ifNull: [{ $arrayElemAt: ["$jobsStats.count", 0] }, 0] },
          applications: { $ifNull: [{ $arrayElemAt: ["$applicationStats.count", 0] }, 0] },
          placements: { $ifNull: [{ $arrayElemAt: ["$placementStats.count", 0] }, 0] },
          revenue: { $ifNull: [{ $arrayElemAt: ["$revenueStats.total", 0] }, 0] },
        },
      },
      {
        $match: {
          $or: [
            { jobs: { $gt: 0 } },
            { applications: { $gt: 0 } },
            { placements: { $gt: 0 } },
            { revenue: { $gt: 0 } },
          ],
        },
      },
      { $sort: { placements: -1, revenue: -1, applications: -1, jobs: -1, name: 1 } },
      { $limit: 5 },
    ]),
    ]);

    const totalRevenue = revenueAgg[0]?.total ?? 0;
    const currentRevenue = currentRevenueAgg[0]?.total ?? 0;
    const previousRevenue = previousRevenueAgg[0]?.total ?? 0;

    const statusMap = new Map(appsByStatus.map((row) => [row._id ?? "unknown", row.count]));
    const applicationsByStatus = STATUS_GROUPS.map((group) => {
      const count = group.statuses.reduce((sum, status) => sum + (statusMap.get(status) ?? 0), 0);

      return {
        key: group.key,
        label: group.label,
        count,
        percent: totalApplications > 0 ? Number(((count / totalApplications) * 100).toFixed(1)) : 0,
        toneKey: group.toneKey,
      };
    }).filter((row) => row.count > 0 || ["pending", "shortlisted", "interviewed", "rejected"].includes(row.key));

    const activitySeries = buildMonthlySeries(now, jobsByMonth as AggregateMonthRow[], applicationsByMonth as AggregateMonthRow[]);
    const funnel = [
      { key: "jobs", label: "Jobs", count: totalJobs },
      { key: "applications", label: "Applications", count: totalApplications },
      { key: "interviews", label: "Interviews", count: totalInterviews },
      { key: "placements", label: "Placements", count: totalPlacements },
    ];

    const jobsWithoutApplications = jobsWithoutApplicationsAgg[0]?.count ?? 0;
    const applicationRate = totalJobs > 0 ? totalApplications / totalJobs : 0;
    const placementRate = totalApplications > 0 ? totalPlacements / totalApplications : 0;
    // Alerts carry an id and the numbers behind them, never rendered copy: this
    // route has no locale, so composing the sentence here would print English
    // into an Arabic admin's dashboard. The reports page maps each id to its
    // message keys and interpolates `values`.
    const alerts: Array<{
      id: string;
      level: "critical" | "warning" | "positive";
      values: Record<string, number>;
    }> = [];

    if (jobsWithoutApplications > 0) {
      alerts.push({
        id: "jobs-without-applications",
        level: jobsWithoutApplications >= 5 ? "critical" : "warning",
        values: { count: jobsWithoutApplications },
      });
    }

    if (staleOpenApplications > 0) {
      alerts.push({
        id: "stale-open-applications",
        level: staleOpenApplications >= 3 ? "critical" : "warning",
        values: { count: staleOpenApplications },
      });
    }

    if (currentPlacements === 0 && currentApplications > 0) {
      alerts.push({
        id: "zero-placement-momentum",
        level: "critical",
        values: { count: currentApplications },
      });
    }

    if (currentApplications < previousApplications && currentJobs >= previousJobs) {
      alerts.push({
        id: "demand-softening",
        level: "warning",
        values: { delta: buildTrend(currentApplications, previousApplications).delta },
      });
    }

    if (alerts.length === 0) {
      alerts.push({
        id: "platform-stable",
        level: "positive",
        values: { rate: Math.round(placementRate * 100) },
      });
    }

    return NextResponse.json({
      totalJobs,
      totalApplications,
      totalPlacements,
      totalRevenue,
      trends: {
        jobs: buildTrend(currentJobs, previousJobs),
        applications: buildTrend(currentApplications, previousApplications),
        placements: buildTrend(currentPlacements, previousPlacements),
        revenue: buildTrend(currentRevenue, previousRevenue),
      },
      activitySeries,
      jobsByMonth: activitySeries.map((row) => ({ month: row.label, count: row.jobs })),
      applicationsByStatus,
      funnel,
      alerts,
      recentJobs: recentJobs.map((job) => ({
        id: String(job._id),
        title: job.title,
        status: formatStatus(job.status),
        createdAt: job.createdAt,
        employerName: job.employerName,
        applicationCount: job.applicationCount,
      })),
      recentApplications: recentApplications.map((application) => ({
        id: String(application._id),
        status: formatStatus(application.status),
        appliedAt: application.appliedAt,
        jobTitle: application.jobTitle,
        employerName: application.employerName,
      })),
      topAgents: topAgents.map((agent) => ({
        id: String(agent._id),
        name: agent.name,
        jobs: agent.jobs,
        applications: agent.applications,
        placements: agent.placements,
        revenue: agent.revenue,
      })),
      summary: {
        jobsWithoutApplications,
        staleOpenApplications,
        applicationRate: Number(applicationRate.toFixed(2)),
        placementRate: Number(placementRate.toFixed(2)),
      },
    });
  } catch (error: unknown) {
    logger.error({ error }, "[Admin Analytics Route] Failed to build analytics payload");

    return NextResponse.json(
      { error: "Failed to load analytics data." },
      { status: 500 }
    );
  }
}, { resource: "users", action: "read" });

