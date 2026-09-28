import type { Model, Types } from "mongoose";
import connectDB from "@/lib/db/mongoose";
import { AI_MATCH_HIGH_THRESHOLD } from "@/lib/constants";
import { getEmployerSetupStatus } from "@/lib/employers/setupStatus";
import { Employer } from "@/models/Employer";
import Job from "@/models/Job";
import { Application } from "@/models/Application";
import { Interview } from "@/models/Interview";
import { Placement } from "@/models/Placement";
import { Offer } from "@/models/Offer";
import { CompanyProfileView } from "@/models/CompanyProfileView";

/** Length of the trailing window behind the "last 30 days" figures and sparklines. */
export const EMPLOYER_DASHBOARD_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

/** One point per UTC day of the window, oldest first. */
export interface EmployerDailyPoint {
  /** ISO date ("2026-09-12"). */
  day: string;
  /** Applications received. */
  applications: number;
  /** Applications received that scored at or above the high-match threshold. */
  highMatches: number;
  /** Interviews scheduled for that day. */
  interviews: number;
  /** Jobs posted. */
  jobs: number;
  /** Offers created. */
  offers: number;
  /** Company profile views. */
  views: number;
  /** Placements made. */
  hires: number;
}

/** A count over the current window and the same-length window before it. */
export interface WindowedCount {
  current: number;
  previous: number;
}

export interface EmployerStatusCount {
  status: string;
  count: number;
}

export interface EmployerTopJob {
  id: string;
  title: string;
  status: string;
  /** Applications received in the window. */
  applications: number;
}

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

  /* ── Window figures (last EMPLOYER_DASHBOARD_DAYS days vs the days before) ── */
  /** Length of the window in days. */
  windowDays: number;
  applicationsWindow: WindowedCount;
  highMatchesWindow: WindowedCount;
  jobsPostedWindow: WindowedCount;
  offersWindow: WindowedCount;
  viewsWindow: WindowedCount;
  hiresWindow: WindowedCount;
  /** Daily series for the window, one point per day. */
  daily: EmployerDailyPoint[];

  /* ── Attention signals ── */
  /** Interviews still ahead (scheduled or confirmed, not yet started). */
  upcomingInterviews: number;
  /** Applications still in "applied" that arrived more than 48 hours ago. */
  unreviewedOver48h: number;
  /** Offers the candidate has not answered yet (pending or countered). */
  offersAwaitingResponse: number;
  /** Active jobs whose expiry falls within the next 7 days. */
  expiringJobs7d: number;
  /** Active jobs that have never received an application. */
  jobsWithoutApplications: number;
  /** Onboarding steps still open; 0 when setup is complete. */
  setupStepsRemaining: number;

  /* ── Breakdowns ── */
  /** Applications by status, every status present in the data. */
  pipelineByStatus: EmployerStatusCount[];
  /** Jobs ranked by applications received in the window. */
  topJobs: EmployerTopJob[];
}

interface CacheEntry {
  value: EmployerDashboardStats;
  expiresAt: number;
}

// Short TTL: keeps the dashboard responsive during rapid navigation and dev
// Fast Refresh reloads (which re-run the server component) without re-issuing
// ~25 MongoDB queries every time, while staying near-live in production.
const STATS_TTL_MS = 10_000;
const MAX_CACHE_ENTRIES = 200;

const statsCache = new Map<string, CacheEntry>();
// The dashboard streams several sections that each ask for the stats; while
// the first call is in flight the others share its promise instead of each
// issuing the whole query batch.
const inFlight = new Map<string, Promise<EmployerDashboardStats>>();

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

const EMPTY_WINDOW: WindowedCount = { current: 0, previous: 0 };

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
  windowDays: EMPLOYER_DASHBOARD_DAYS,
  applicationsWindow: EMPTY_WINDOW,
  highMatchesWindow: EMPTY_WINDOW,
  jobsPostedWindow: EMPTY_WINDOW,
  offersWindow: EMPTY_WINDOW,
  viewsWindow: EMPTY_WINDOW,
  hiresWindow: EMPTY_WINDOW,
  daily: [],
  upcomingInterviews: 0,
  unreviewedOver48h: 0,
  offersAwaitingResponse: 0,
  expiringJobs7d: 0,
  jobsWithoutApplications: 0,
  setupStepsRemaining: 0,
  pipelineByStatus: [],
  topJobs: [],
};

const dayKey = (date: Date) => date.toISOString().slice(0, 10);

/**
 * Counts of `dateExpr` per UTC day for the current window and a single count
 * for the previous window, in one aggregation.
 */
async function windowedDaily(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  model: Model<any>,
  match: Record<string, unknown>,
  dateField: string,
  windowStart: Date,
  previousStart: Date,
  extraCondition?: unknown
): Promise<{ daily: Map<string, number>; previous: number }> {
  const dateExpr = `$${dateField}`;
  const rows = await model.aggregate<{ _id: string | null; count: number }>([
    { $match: { ...match, [dateField]: { $gte: previousStart } } },
    ...(extraCondition ? [{ $match: { $expr: extraCondition } }] : []),
    {
      $group: {
        // Days before the window collapse into one "previous" bucket.
        _id: {
          $cond: [{ $gte: [dateExpr, windowStart] }, { $dateToString: { format: "%Y-%m-%d", date: dateExpr } }, null],
        },
        count: { $sum: 1 },
      },
    },
  ]);
  const daily = new Map<string, number>();
  let previous = 0;
  for (const row of rows) {
    if (row._id === null) previous = row.count;
    else daily.set(row._id, row.count);
  }
  return { daily, previous };
}

const sum = (map: Map<string, number>) => [...map.values()].reduce((acc, n) => acc + n, 0);

export async function getEmployerDashboardStats(userId: string): Promise<EmployerDashboardStats> {
  const cached = readCache(userId);
  if (cached) return cached;

  const pending = inFlight.get(userId);
  if (pending) return pending;

  const promise = loadStats(userId).finally(() => inFlight.delete(userId));
  inFlight.set(userId, promise);
  return promise;
}

async function loadStats(userId: string): Promise<EmployerDashboardStats> {
  await connectDB();

  const employer = await Employer.findOne({ userId }).select("_id companyName").lean();
  const employerId = employer?._id as Types.ObjectId | undefined;

  if (!employerId) {
    const empty = { ...EMPTY_STATS };
    writeCache(userId, empty);
    return empty;
  }

  // "Today" = server-local calendar day. ponytail: single-timezone approximation;
  // switch to per-employer TZ if the product ever spans regions where midnight matters.
  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const startOfTomorrow = new Date(startOfToday);
  startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);

  // Window: the last N UTC days including today; the previous window is the N days before.
  const windowStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - (EMPLOYER_DASHBOARD_DAYS - 1) * DAY_MS);
  const previousStart = new Date(windowStart.getTime() - EMPLOYER_DASHBOARD_DAYS * DAY_MS);
  const in7Days = new Date(now.getTime() + 7 * DAY_MS);
  const twoDaysAgo = new Date(now.getTime() - 2 * DAY_MS);

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
    // ── window series ──
    applicationsSeries,
    highMatchSeries,
    interviewSeries,
    jobsSeries,
    offersSeries,
    viewsSeries,
    hiresSeries,
    // ── attention ──
    upcomingInterviews,
    unreviewedOver48h,
    offersAwaitingResponse,
    expiringJobs7d,
    activeJobIds,
    appliedJobIds,
    setupStatus,
    // ── breakdowns ──
    statusRows,
    topJobRows,
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

    // ── window series: one aggregation each, daily buckets + previous-window total ──
    windowedDaily(Application, { employerId }, "createdAt", windowStart, previousStart),
    windowedDaily(Application, { employerId, aiMatchScore: { $gte: AI_MATCH_HIGH_THRESHOLD } }, "createdAt", windowStart, previousStart),
    windowedDaily(Interview, { employerId, status: { $nin: ["cancelled"] } }, "scheduledAt", windowStart, previousStart),
    windowedDaily(Job, { employerId, deletedAt: null }, "createdAt", windowStart, previousStart),
    windowedDaily(Offer, { employerId }, "createdAt", windowStart, previousStart),
    windowedDaily(CompanyProfileView, { employerId }, "viewedAt", windowStart, previousStart),
    windowedDaily(Placement, { employerId }, "placedAt", windowStart, previousStart),

    // ── attention ──
    Interview.countDocuments({ employerId, status: { $in: ["scheduled", "confirmed"] }, scheduledAt: { $gte: now } }),
    Application.countDocuments({ employerId, status: "applied", createdAt: { $lt: twoDaysAgo } }),
    Offer.countDocuments({ employerId, status: { $in: ["pending", "countered"] } }),
    Job.countDocuments({ employerId, status: "active", deletedAt: null, expiresAt: { $gte: now, $lte: in7Days } }),
    Job.find({ employerId, status: "active", deletedAt: null }).select("_id").lean(),
    Application.distinct("jobId", { employerId }),
    getEmployerSetupStatus(employerId),

    // ── breakdowns ──
    Application.aggregate<{ _id: string; count: number }>([
      { $match: { employerId } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
    Application.aggregate<{ _id: Types.ObjectId; count: number; job: { title?: string; status?: string }[] }>([
      { $match: { employerId, createdAt: { $gte: windowStart } } },
      { $group: { _id: "$jobId", count: { $sum: 1 } } },
      { $sort: { count: -1, _id: 1 } },
      { $limit: 6 },
      { $lookup: { from: "jobs", localField: "_id", foreignField: "_id", as: "job", pipeline: [{ $project: { title: 1, status: 1 } }] } },
    ]),
  ]);

  const stats = (matchStats as Array<{ avg: number; max: number; highCount: number; band90Plus: number; band80to89: number; needsReview: number; lowCount: number }>)[0];
  const avgTimeToHire = (timeToHireResult as Array<{ avgDays: number }>)[0]?.avgDays ?? null;
  const lastActivityMinutes = lastActivity?.updatedAt
    ? Math.round((Date.now() - new Date(lastActivity.updatedAt as Date).getTime()) / 60000)
    : null;

  const daily: EmployerDailyPoint[] = [];
  for (let t = windowStart.getTime(), i = 0; i < EMPLOYER_DASHBOARD_DAYS; t += DAY_MS, i++) {
    const day = dayKey(new Date(t));
    daily.push({
      day,
      applications: applicationsSeries.daily.get(day) ?? 0,
      highMatches: highMatchSeries.daily.get(day) ?? 0,
      interviews: interviewSeries.daily.get(day) ?? 0,
      jobs: jobsSeries.daily.get(day) ?? 0,
      offers: offersSeries.daily.get(day) ?? 0,
      views: viewsSeries.daily.get(day) ?? 0,
      hires: hiresSeries.daily.get(day) ?? 0,
    });
  }
  const window = (series: { daily: Map<string, number>; previous: number }): WindowedCount => ({
    current: sum(series.daily),
    previous: series.previous,
  });

  const applied = new Set((appliedJobIds as Types.ObjectId[]).map(String));
  const jobsWithoutApplications = (activeJobIds as { _id: Types.ObjectId }[]).filter((job) => !applied.has(String(job._id))).length;

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
    windowDays: EMPLOYER_DASHBOARD_DAYS,
    applicationsWindow: window(applicationsSeries),
    highMatchesWindow: window(highMatchSeries),
    jobsPostedWindow: window(jobsSeries),
    offersWindow: window(offersSeries),
    viewsWindow: window(viewsSeries),
    hiresWindow: window(hiresSeries),
    daily,
    upcomingInterviews,
    unreviewedOver48h,
    offersAwaitingResponse,
    expiringJobs7d,
    jobsWithoutApplications,
    setupStepsRemaining: setupStatus ? setupStatus.steps.filter((s) => !s.completed).length : 0,
    pipelineByStatus: statusRows.map((row) => ({ status: row._id, count: row.count })),
    topJobs: topJobRows
      .filter((row) => row.job[0])
      .map((row) => ({ id: String(row._id), title: row.job[0]?.title ?? "", status: row.job[0]?.status ?? "", applications: row.count })),
  };

  writeCache(userId, value);
  return value;
}

export function clearEmployerDashboardStatsCache(): void {
  statsCache.clear();
}
