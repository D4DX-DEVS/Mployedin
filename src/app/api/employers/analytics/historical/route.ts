import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import { Employer } from "@/models/Employer";
import Job from "@/models/Job";
import { Application } from "@/models/Application";
import type { UserRole } from "@/models/User";

interface AuthCtx {
  userId: string;
  role: UserRole;
  locale: string;
}

// GET /api/employers/analytics/historical
// Returns: timeToHire per stage, drop-off rates, source breakdown, trend with date range
async function getHandler(
  req: NextRequest,
  ctx: AuthCtx
): Promise<NextResponse> {
  if (ctx.role !== "employer") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();

  const employer = await Employer.findOne({ userId: ctx.userId })
    .select("_id")
    .lean();
  if (!employer)
    return NextResponse.json({ error: "Employer not found" }, { status: 404 });

  const employerId = employer._id;
  const { searchParams } = new URL(req.url);

  // Date range: preset or custom
  const range = searchParams.get("range") || "30d";
  const customStart = searchParams.get("startDate");
  const customEnd = searchParams.get("endDate");

  let startDate: Date;
  let endDate = new Date();

  if (range === "custom" && customStart && customEnd) {
    startDate = new Date(customStart);
    endDate = new Date(customEnd);
    endDate.setHours(23, 59, 59, 999);
  } else {
    const days =
      range === "7d" ? 7 : range === "90d" ? 90 : range === "180d" ? 180 : 30;
    startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
  }

  const jobs = await Job.find({ employerId }).select("_id title").lean();
  const jobIds = jobs.map((j) => j._id);

  if (jobIds.length === 0) {
    return NextResponse.json({
      timeToHire: [],
      dropOff: [],
      sourceBreakdown: [],
      trend: [],
      perJobTimeToHire: [],
    }, {
      headers: { "Cache-Control": "private, max-age=60, stale-while-revalidate=120" },
    });
  }

  const dateFilter = { $gte: startDate, $lte: endDate };

  // 1. TIME-TO-HIRE per stage: avg days between consecutive statusHistory entries
  const ORDERED_STAGES = [
    "applied",
    "shortlisted",
    "interview_scheduled",
    "selected",
    "offer",
    "hired",
  ];

  const appsWithHistory = await Application.find({
    jobId: { $in: jobIds },
    appliedAt: dateFilter,
    "statusHistory.1": { $exists: true }, // at least 2 history entries
  })
    .select("jobId appliedAt statusHistory")
    .lean();

  // Calculate avg time between stages
  const stageDurations: Record<string, number[]> = {};
  const perJobDurations: Record<string, Record<string, number[]>> = {};

  for (const app of appsWithHistory) {
    const history = (
      app.statusHistory as { status: string; changedAt: Date }[]
    ).sort(
      (a, b) =>
        new Date(a.changedAt).getTime() - new Date(b.changedAt).getTime()
    );

    for (let i = 1; i < history.length; i++) {
      const prev = history[i - 1];
      const curr = history[i];
      const fromStage = prev.status;
      const toStage = curr.status;

      // Only track forward transitions
      const fromIdx = ORDERED_STAGES.indexOf(fromStage);
      const toIdx = ORDERED_STAGES.indexOf(toStage);
      if (fromIdx === -1 || toIdx === -1 || toIdx <= fromIdx) continue;

      const days =
        (new Date(curr.changedAt).getTime() -
          new Date(prev.changedAt).getTime()) /
        (1000 * 60 * 60 * 24);

      const key = `${fromStage}→${toStage}`;
      if (!stageDurations[key]) stageDurations[key] = [];
      stageDurations[key].push(days);

      // Per-job tracking
      const jobIdStr = String(app.jobId);
      if (!perJobDurations[jobIdStr]) perJobDurations[jobIdStr] = {};
      if (!perJobDurations[jobIdStr][key]) perJobDurations[jobIdStr][key] = [];
      perJobDurations[jobIdStr][key].push(days);
    }
  }

  const timeToHire = Object.entries(stageDurations).map(([transition, durations]) => ({
    transition,
    avgDays: Math.round((durations.reduce((a, b) => a + b, 0) / durations.length) * 10) / 10,
    medianDays: median(durations),
    count: durations.length,
  }));

  // Per-job time-to-hire
  const jobMap = new Map(jobs.map((j) => [String(j._id), j.title]));
  const perJobTimeToHire = Object.entries(perJobDurations).map(
    ([jobId, transitions]) => ({
      jobId,
      title: jobMap.get(jobId) ?? "Unknown",
      stages: Object.entries(transitions).map(([transition, durations]) => ({
        transition,
        avgDays: Math.round((durations.reduce((a, b) => a + b, 0) / durations.length) * 10) / 10,
        count: durations.length,
      })),
    })
  );

  // 2. DROP-OFF rates: % of candidates who leave at each stage.
  // Uses cumulative "reached stage" counts (current status + statusHistory)
  // so a candidate at a later stage still counts toward earlier stages.
  const maxRankData = await Application.aggregate([
    { $match: { jobId: { $in: jobIds }, appliedAt: dateFilter } },
    {
      $project: {
        statuses: {
          $setUnion: [["$status"], { $ifNull: ["$statusHistory.status", []] }],
        },
      },
    },
    {
      $project: {
        maxRank: {
          $max: {
            $map: {
              input: "$statuses",
              as: "s",
              in: { $indexOfArray: [ORDERED_STAGES, "$$s"] },
            },
          },
        },
      },
    },
    { $group: { _id: "$maxRank", count: { $sum: 1 } } },
  ]);

  // reached[rank] = applications whose highest-ever stage >= rank.
  // Rejected/withdrawn-only applications still count toward "applied".
  const reachedAtLeast = (rank: number): number =>
    maxRankData.reduce(
      (sum, g) => sum + (Math.max(g._id ?? 0, 0) >= rank ? g.count : 0),
      0
    );

  const totalApps = reachedAtLeast(0);

  // Drop-off = those who reached stage X but never reached stage X+1
  const dropOff = ORDERED_STAGES.slice(0, -1).map((stage, i) => {
    const nextStage = ORDERED_STAGES[i + 1];
    const atCurrent = reachedAtLeast(i);
    const atNext = reachedAtLeast(i + 1);

    return {
      stage,
      stageName: STAGE_NAMES[stage],
      nextStage,
      nextStageName: STAGE_NAMES[nextStage],
      count: atCurrent,
      nextCount: atNext,
      dropOffPct:
        totalApps > 0
          ? Math.round(((atCurrent - atNext) / Math.max(atCurrent, 1)) * 100)
          : 0,
    };
  });

  // 3. SOURCE breakdown
  const sourceData = await Application.aggregate([
    { $match: { jobId: { $in: jobIds }, appliedAt: dateFilter } },
    {
      $group: {
        _id: { $ifNull: ["$source", "full_form"] },
        count: { $sum: 1 },
      },
    },
    { $sort: { count: -1 } },
  ]);

  const sourceBreakdown = sourceData.map((s) => ({
    source: s._id as string,
    label: SOURCE_LABELS[s._id as string] || s._id,
    count: s.count as number,
    pct: totalApps > 0 ? Math.round(((s.count as number) / totalApps) * 100) : 0,
  }));

  // 4. TREND with date range
  const trendData = await Application.aggregate([
    { $match: { jobId: { $in: jobIds }, appliedAt: dateFilter } },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$appliedAt" } },
        count: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  // Fill in all dates in range
  const trend: { date: string; count: number }[] = [];
  const current = new Date(startDate);
  while (current <= endDate) {
    const dateStr = current.toISOString().split("T")[0];
    const found = trendData.find((t) => t._id === dateStr);
    trend.push({ date: dateStr, count: found ? found.count : 0 });
    current.setDate(current.getDate() + 1);
  }

  return NextResponse.json({
    timeToHire,
    dropOff,
    sourceBreakdown,
    trend,
    perJobTimeToHire,
    totalApplications: totalApps,
    dateRange: {
      start: startDate.toISOString().split("T")[0],
      end: endDate.toISOString().split("T")[0],
    },
  }, {
    headers: { "Cache-Control": "private, max-age=60, stale-while-revalidate=120" },
  });
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? Math.round(sorted[mid] * 10) / 10
    : Math.round(((sorted[mid - 1] + sorted[mid]) / 2) * 10) / 10;
}

const STAGE_NAMES: Record<string, string> = {
  applied: "Applied",
  shortlisted: "Shortlisted",
  interview_scheduled: "Interview",
  selected: "Selected",
  offer: "Offer",
  hired: "Hired",
};

const SOURCE_LABELS: Record<string, string> = {
  easy_apply: "Easy Apply",
  full_form: "Full Application",
  direct: "Direct",
  auto_apply: "Auto Apply",
};

export const GET = withAuth(getHandler);
