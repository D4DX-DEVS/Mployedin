import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import TargetProfile from "@/models/TargetProfile";
import { enrichProfiles } from "@/lib/targets/profileAchievementCalculator";
import User from "@/models/User";
import SuperAgent from "@/models/SuperAgent";
import Commission from "@/models/Commission";

interface AuthCtx { userId: string; role: string; locale: string; }

/* ------------------------------------------------------------------ */
/*  GET  /api/admin/target-report                                      */
/*  Consolidated target report: trends, YoY, business volume, etc.     */
/* ------------------------------------------------------------------ */
async function handler(req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  await connectDB();

  const { searchParams } = new URL(req.url);
  const currentYear = new Date().getFullYear();
  const requestedYear = parseInt(searchParams.get("year") ?? String(currentYear));
  const year = Number.isFinite(requestedYear) ? requestedYear : currentYear;
  const compareYear = year - 1;

  // --- Load current + previous year profiles (all roles) ---
  const [currentProfiles, prevProfiles] = await Promise.all([
    TargetProfile.find({ year, status: "active" }).lean(),
    TargetProfile.find({ year: compareYear, status: "active" }).lean(),
  ]);

  // Resolve user names
  const allUserIds = [
    ...new Set([
      ...currentProfiles.map((p) => String(p.assigneeId)),
      ...prevProfiles.map((p) => String(p.assigneeId)),
    ]),
  ];
  // User lookup + both enrichment passes are independent — run them together.
  const [users, enrichedCurrent, enrichedPrev] = await Promise.all([
    User.find({ _id: { $in: allUserIds } }).select("_id name email").lean(),
    currentProfiles.length > 0
      ? enrichProfiles(currentProfiles as unknown as Record<string, unknown>[])
      : Promise.resolve([]),
    prevProfiles.length > 0
      ? enrichProfiles(prevProfiles as unknown as Record<string, unknown>[])
      : Promise.resolve([]),
  ]);
  const userMap = new Map(users.map((u) => [String(u._id), u]));

  // --- Monthly Trend (current year aggregated) ---
  const monthlyTrend = Array.from({ length: 12 }, (_, i) => {
    const month = i + 1;
    const monthData = {
      month,
      employerTarget: 0,
      employeeTarget: 0,
      financeTarget: 0,
      employerAchieved: 0,
      employeeAchieved: 0,
      financeAchieved: 0,
    };
    for (const profile of enrichedCurrent) {
      const ma = profile.monthlyAchievements.find((m) => m.month === month);
      if (ma) {
        monthData.employerTarget += ma.employerTarget;
        monthData.employeeTarget += ma.employeeTarget;
        monthData.financeTarget += ma.financeTarget;
        monthData.employerAchieved += ma.employerAchieved;
        monthData.employeeAchieved += ma.employeeAchieved;
        monthData.financeAchieved += ma.financeAchieved;
      }
    }
    return monthData;
  });

  // --- Year-over-Year Comparison ---
  const sumMetrics = (profiles: typeof enrichedCurrent) => ({
    employerTarget: profiles.reduce((s, p) => s + p.employerTarget, 0),
    employeeTarget: profiles.reduce((s, p) => s + p.employeeTarget, 0),
    financeTarget: profiles.reduce((s, p) => s + p.financeTarget, 0),
    employerAchieved: profiles.reduce((s, p) => s + p.employerAchieved, 0),
    employeeAchieved: profiles.reduce((s, p) => s + p.employeeAchieved, 0),
    financeAchieved: profiles.reduce((s, p) => s + p.financeAchieved, 0),
    avgProgress: profiles.length > 0
      ? Math.round(profiles.reduce((s, p) => s + p.overallProgress, 0) / profiles.length)
      : 0,
    profileCount: profiles.length,
  });

  const currentSummary = sumMetrics(enrichedCurrent);
  const prevSummary = sumMetrics(enrichedPrev);

  const yoyGrowth = (curr: number, prev: number) =>
    prev > 0 ? Math.round(((curr - prev) / prev) * 100) : curr > 0 ? 100 : 0;

  const yearOverYear = {
    currentYear: { year, ...currentSummary },
    previousYear: { year: compareYear, ...prevSummary },
    growth: {
      employerTarget: yoyGrowth(currentSummary.employerTarget, prevSummary.employerTarget),
      employeeTarget: yoyGrowth(currentSummary.employeeTarget, prevSummary.employeeTarget),
      financeTarget: yoyGrowth(currentSummary.financeTarget, prevSummary.financeTarget),
      employerAchieved: yoyGrowth(currentSummary.employerAchieved, prevSummary.employerAchieved),
      employeeAchieved: yoyGrowth(currentSummary.employeeAchieved, prevSummary.employeeAchieved),
      financeAchieved: yoyGrowth(currentSummary.financeAchieved, prevSummary.financeAchieved),
      avgProgress: yoyGrowth(currentSummary.avgProgress, prevSummary.avgProgress),
    },
  };

  // --- Business Volume (total commission value for the year) ---
  const businessVolumeAgg = await Commission.aggregate([
    {
      $match: {
        createdAt: {
          $gte: new Date(year, 0, 1),
          $lte: new Date(year, 11, 31, 23, 59, 59, 999),
        },
      },
    },
    {
      $group: {
        _id: { month: { $month: "$createdAt" }, status: "$status" },
        total: { $sum: "$amount" },
        count: { $sum: 1 },
      },
    },
  ]);

  const businessVolume = Array.from({ length: 12 }, (_, i) => {
    const month = i + 1;
    const approved = businessVolumeAgg.find(
      (a) => a._id.month === month && ["approved", "paid"].includes(a._id.status)
    );
    const pending = businessVolumeAgg.find(
      (a) => a._id.month === month && a._id.status === "pending"
    );
    const all = businessVolumeAgg.filter((a) => a._id.month === month);
    return {
      month,
      approved: approved?.total ?? 0,
      pending: pending?.total ?? 0,
      total: all.reduce((s, a) => s + (a.total ?? 0), 0),
      count: all.reduce((s, a) => s + (a.count ?? 0), 0),
    };
  });

  const totalBusinessVolume = businessVolume.reduce((s, m) => s + m.total, 0);
  const totalApprovedVolume = businessVolume.reduce((s, m) => s + m.approved, 0);

  // --- Per-Supervisor / Per-Agent breakdown ---
  const supervisorProfiles = enrichedCurrent
    .filter((p) => p.assigneeRole === "super_agent")
    .map((p) => {
      const user = userMap.get(p.assigneeId);
      return {
        _id: p._id,
        assigneeId: p.assigneeId,
        assigneeName: user?.name ?? "Unknown",
        assigneeEmail: user?.email ?? "",
        region: p.region,
        employerTarget: p.employerTarget,
        employeeTarget: p.employeeTarget,
        financeTarget: p.financeTarget,
        employerAchieved: p.employerAchieved,
        employeeAchieved: p.employeeAchieved,
        financeAchieved: p.financeAchieved,
        overallProgress: p.overallProgress,
        riskScore: p.riskScore,
        incentiveTier: p.incentiveTier,
      };
    })
    .sort((a, b) => b.overallProgress - a.overallProgress);

  const agentProfiles = enrichedCurrent
    .filter((p) => p.assigneeRole === "agent")
    .map((p) => {
      const user = userMap.get(p.assigneeId);
      return {
        _id: p._id,
        assigneeId: p.assigneeId,
        assigneeName: user?.name ?? "Unknown",
        assigneeEmail: user?.email ?? "",
        region: p.region,
        employerTarget: p.employerTarget,
        employeeTarget: p.employeeTarget,
        financeTarget: p.financeTarget,
        employerAchieved: p.employerAchieved,
        employeeAchieved: p.employeeAchieved,
        financeAchieved: p.financeAchieved,
        overallProgress: p.overallProgress,
        riskScore: p.riskScore,
        incentiveTier: p.incentiveTier,
      };
    })
    .sort((a, b) => b.overallProgress - a.overallProgress);

  // --- Quarterly breakdown ---
  const quarters = [
    { label: "Q1", months: [1, 2, 3] },
    { label: "Q2", months: [4, 5, 6] },
    { label: "Q3", months: [7, 8, 9] },
    { label: "Q4", months: [10, 11, 12] },
  ];
  const quarterlyBreakdown = quarters.map((q) => {
    const qMonths = monthlyTrend.filter((m) => q.months.includes(m.month));
    return {
      label: q.label,
      employerTarget: qMonths.reduce((s, m) => s + m.employerTarget, 0),
      employerAchieved: qMonths.reduce((s, m) => s + m.employerAchieved, 0),
      employeeTarget: qMonths.reduce((s, m) => s + m.employeeTarget, 0),
      employeeAchieved: qMonths.reduce((s, m) => s + m.employeeAchieved, 0),
      financeTarget: qMonths.reduce((s, m) => s + m.financeTarget, 0),
      financeAchieved: qMonths.reduce((s, m) => s + m.financeAchieved, 0),
      businessVolume: businessVolume
        .filter((bv) => q.months.includes(bv.month))
        .reduce((s, bv) => s + bv.total, 0),
    };
  });

  return NextResponse.json({
    year,
    monthlyTrend,
    yearOverYear,
    businessVolume,
    totalBusinessVolume,
    totalApprovedVolume,
    quarterlyBreakdown,
    supervisorProfiles,
    agentProfiles,
    summary: currentSummary,
  });
}

export const GET = withAuth(handler, { resource: "targets", action: "read" });
