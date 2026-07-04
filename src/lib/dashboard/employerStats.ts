import connectDB from "@/lib/db/mongoose";
import { AI_MATCH_HIGH_THRESHOLD } from "@/lib/constants";
import { Employer } from "@/models/Employer";
import Job from "@/models/Job";
import { Application } from "@/models/Application";
import { Interview } from "@/models/Interview";
import { Placement } from "@/models/Placement";
import { Offer } from "@/models/Offer";

export interface EmployerDashboardStats {
  companyName?: string;
  activeJobCount: number;
  draftJobCount: number;
  pausedJobCount: number;
  totalApplications: number;
  newApplications: number;
  inReview: number;
  scheduledInterviews: number;
  /** Interviews scheduled for today (server-local day) — powers the
   *  "Today's Interviews" KPI card + hero chip. Distinct from
   *  scheduledInterviews (all-time), which feeds the pipeline funnel. */
  interviewsToday: number;
  placements: number;
  offerCount: number;
  offersSent: number;
  avgMatchScore: number;
  highMatchCount: number;
  band90PlusCount: number;
  band80to89Count: number;
  needsReviewCount: number;
  lowMatchCount: number;
  avgTimeToHire: number | null;
  lastActivityMinutes: number | null;
}

interface CacheEntry {
  value: EmployerDashboardStats;
  expiresAt: number;
}

// Short TTL: keeps the dashboard responsive during rapid navigation and dev
// Fast Refresh reloads (which re-run the server component) without re-issuing
// ~11 MongoDB queries every time, while staying near-live in production.
const STATS_TTL_MS = 10_000;
const MAX_CACHE_ENTRIES = 200;

const statsCache = new Map<string, CacheEntry>();

function readCache(key: string): EmployerDashboardStats | undefined {
  const entry = statsCache.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    statsCache.delete(key);
    return undefined;
  }
  return entry.value;
}

function writeCache(key: string, value: EmployerDashboardStats): void {
  if (statsCache.has(key)) statsCache.delete(key);
  statsCache.set(key, { value, expiresAt: Date.now() + STATS_TTL_MS });
  if (statsCache.size > MAX_CACHE_ENTRIES) {
    const oldestKey = statsCache.keys().next().value;
    if (oldestKey) statsCache.delete(oldestKey);
  }
}

const EMPTY_STATS: EmployerDashboardStats = {
  companyName: undefined,
  activeJobCount: 0,
  draftJobCount: 0,
  pausedJobCount: 0,
  totalApplications: 0,
  newApplications: 0,
  inReview: 0,
  scheduledInterviews: 0,
  interviewsToday: 0,
  placements: 0,
  offerCount: 0,
  offersSent: 0,
  avgMatchScore: 0,
  highMatchCount: 0,
  band90PlusCount: 0,
  band80to89Count: 0,
  needsReviewCount: 0,
  lowMatchCount: 0,
  avgTimeToHire: null,
  lastActivityMinutes: null,
};

export async function getEmployerDashboardStats(
  userId: string
): Promise<EmployerDashboardStats> {
  const cached = readCache(userId);
  if (cached) return cached;

  await connectDB();

  const employer = await Employer.findOne({ userId }).select("_id companyName").lean();
  const employerId = employer?._id;

  if (!employerId) {
    const empty = { ...EMPTY_STATS };
    writeCache(userId, empty);
    return empty;
  }

  // "Today" = server-local calendar day. ponytail: single-timezone approximation;
  // switch to per-employer TZ if the product ever spans regions where midnight matters.
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfTomorrow = new Date(startOfToday);
  startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);

  const [
    activeJobCount,
    draftJobCount,
    pausedJobCount,
    totalApplications,
    newApplications,
    inReview,
    scheduledInterviews,
    interviewsToday,
    placements,
    offerCount,
    offersSent,
    matchStats,
    timeToHireResult,
    lastActivity,
  ] = await Promise.all([
    Job.countDocuments({ employerId, status: "active", deletedAt: null }),
    Job.countDocuments({ employerId, status: "draft", deletedAt: null }),
    Job.countDocuments({ employerId, status: "paused", deletedAt: null }),
    Application.countDocuments({ employerId }),
    Application.countDocuments({ employerId, status: "applied" }),
    Application.countDocuments({ employerId, status: "shortlisted" }),
    Interview.countDocuments({ employerId, status: "scheduled" }),
    // Interviews scheduled for today only — backs the "Today's Interviews" card.
    Interview.countDocuments({
      employerId,
      status: "scheduled",
      scheduledAt: { $gte: startOfToday, $lt: startOfTomorrow },
    }),
    Placement.countDocuments({ employerId }),
    // Total offers created
    Offer.countDocuments({ employerId }),
    // Offers sent (pending = recently sent, not yet responded)
    Offer.countDocuments({ employerId, status: "pending" }),
    // Global match stats for Candidate Quality chart + AI Recommended Candidates card
    Application.aggregate([
      { $match: { employerId, aiMatchScore: { $gt: 0 } } },
      {
        $group: {
          _id: null,
          avg: { $avg: "$aiMatchScore" },
          max: { $max: "$aiMatchScore" },
          highCount: { $sum: { $cond: [{ $gte: ["$aiMatchScore", AI_MATCH_HIGH_THRESHOLD] }, 1, 0] } },
          band90Plus: { $sum: { $cond: [{ $gte: ["$aiMatchScore", 90] }, 1, 0] } },
          band80to89: {
            $sum: {
              $cond: [
                { $and: [{ $gte: ["$aiMatchScore", 80] }, { $lt: ["$aiMatchScore", 90] }] },
                1,
                0,
              ],
            },
          },
          needsReview: {
            $sum: {
              $cond: [
                { $and: [{ $gte: ["$aiMatchScore", 1] }, { $lt: ["$aiMatchScore", 80] }] },
                1,
                0,
              ],
            },
          },
          lowCount: { $sum: { $cond: [{ $lt: ["$aiMatchScore", 50] }, 1, 0] } },
        },
      },
    ]),
    // Time to hire: avg days from application to placement
    Placement.aggregate([
      { $match: { employerId } },
      {
        $lookup: {
          from: "applications",
          localField: "applicationId",
          foreignField: "_id",
          as: "app",
        },
      },
      { $unwind: { path: "$app", preserveNullAndEmptyArrays: false } },
      {
        $project: {
          days: {
            $divide: [
              { $subtract: ["$placedAt", "$app.createdAt"] },
              1000 * 60 * 60 * 24,
            ],
          },
        },
      },
      { $group: { _id: null, avgDays: { $avg: "$days" } } },
    ]),
    // Last application activity (time context)
    Application.findOne({ employerId }).sort({ updatedAt: -1 }).select("updatedAt").lean(),
  ]);

  const stats = (matchStats as Array<{ avg: number; max: number; highCount: number; band90Plus: number; band80to89: number; needsReview: number; lowCount: number }>)[0];
  const avgTimeToHire = (timeToHireResult as Array<{ avgDays: number }>)[0]?.avgDays ?? null;
  const lastActivityMinutes = lastActivity?.updatedAt
    ? Math.round((Date.now() - new Date(lastActivity.updatedAt as Date).getTime()) / 60000)
    : null;

  const value: EmployerDashboardStats = {
    companyName: (employer as { companyName?: string } | null)?.companyName,
    activeJobCount,
    draftJobCount,
    pausedJobCount,
    totalApplications,
    newApplications,
    inReview,
    scheduledInterviews,
    interviewsToday,
    placements,
    offerCount,
    offersSent,
    avgMatchScore: stats?.avg ?? 0,
    highMatchCount: stats?.highCount ?? 0,
    band90PlusCount: stats?.band90Plus ?? 0,
    band80to89Count: stats?.band80to89 ?? 0,
    needsReviewCount: stats?.needsReview ?? 0,
    lowMatchCount: stats?.lowCount ?? 0,
    avgTimeToHire,
    lastActivityMinutes,
  };

  writeCache(userId, value);
  return value;
}

export function clearEmployerDashboardStatsCache(): void {
  statsCache.clear();
}
