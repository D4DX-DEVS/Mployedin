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

// GET /api/employers/analytics/response-time
// Calculates how quickly the employer acts on new applications
async function getHandler(
  _req: NextRequest,
  ctx: AuthCtx
): Promise<NextResponse> {
  if (ctx.role !== "employer") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();

  const employer = await Employer.findOne({ userId: ctx.userId })
    .select("_id responseTimeCommitment")
    .lean();
  if (!employer)
    return NextResponse.json({ error: "Employer not found" }, { status: 404 });

  const jobs = await Job.find({ employerId: employer._id })
    .select("_id title")
    .lean();
  const jobIds = jobs.map((j) => j._id);

  if (jobIds.length === 0) {
    return NextResponse.json({
      overall: { avgHours: 0, medianHours: 0, totalMeasured: 0 },
      commitment: (employer as unknown as { responseTimeCommitment?: number }).responseTimeCommitment ?? null,
      perJob: [],
      distribution: [],
    });
  }

  // Get applications that have at least one status change (employer action)
  const apps = await Application.find({
    jobId: { $in: jobIds },
    "statusHistory.1": { $exists: true },
  })
    .select("jobId appliedAt statusHistory")
    .lean();

  // Calculate time from appliedAt to first non-"applied" status change
  const responseTimes: { jobId: string; hours: number }[] = [];

  for (const app of apps) {
    const history = (
      app.statusHistory as { status: string; changedAt: Date }[]
    ).sort(
      (a, b) =>
        new Date(a.changedAt).getTime() - new Date(b.changedAt).getTime()
    );

    const firstAction = history.find((h) => h.status !== "applied");
    if (!firstAction) continue;

    const hours =
      (new Date(firstAction.changedAt).getTime() -
        new Date(app.appliedAt).getTime()) /
      (1000 * 60 * 60);

    if (hours >= 0 && hours < 720) {
      // cap at 30 days to exclude outliers
      responseTimes.push({ jobId: String(app.jobId), hours });
    }
  }

  // Overall stats
  const allHours = responseTimes.map((r) => r.hours);
  const avgHours =
    allHours.length > 0
      ? Math.round(
          (allHours.reduce((a, b) => a + b, 0) / allHours.length) * 10
        ) / 10
      : 0;
  const medianHours = median(allHours);

  // Per-job breakdown
  const jobMap = new Map(jobs.map((j) => [String(j._id), j.title]));
  const perJobMap: Record<string, number[]> = {};
  for (const rt of responseTimes) {
    if (!perJobMap[rt.jobId]) perJobMap[rt.jobId] = [];
    perJobMap[rt.jobId].push(rt.hours);
  }

  const perJob = Object.entries(perJobMap)
    .map(([jobId, hours]) => ({
      jobId,
      title: jobMap.get(jobId) ?? "Unknown",
      avgHours: Math.round((hours.reduce((a, b) => a + b, 0) / hours.length) * 10) / 10,
      medianHours: median(hours),
      count: hours.length,
    }))
    .sort((a, b) => a.avgHours - b.avgHours);

  // Distribution buckets (for bar chart)
  const buckets = [
    { label: "< 1 hour", max: 1 },
    { label: "1–4 hours", max: 4 },
    { label: "4–12 hours", max: 12 },
    { label: "12–24 hours", max: 24 },
    { label: "1–3 days", max: 72 },
    { label: "3–7 days", max: 168 },
    { label: "7+ days", max: Infinity },
  ];

  const distribution = buckets.map((b, i) => {
    const min = i === 0 ? 0 : buckets[i - 1].max;
    return {
      label: b.label,
      count: allHours.filter((h) => h >= min && h < b.max).length,
    };
  });

  return NextResponse.json({
    overall: {
      avgHours,
      medianHours,
      totalMeasured: allHours.length,
      avgDays: Math.round((avgHours / 24) * 10) / 10,
    },
    commitment: (employer as unknown as { responseTimeCommitment?: number }).responseTimeCommitment ?? null,
    perJob,
    distribution,
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

export const GET = withAuth(getHandler, {
  resource: "employers",
  action: "read",
});
