import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import TargetProfile from "@/models/TargetProfile";
import { enrichProfiles } from "@/lib/targets/profileAchievementCalculator";
import User from "@/models/User";

interface AuthCtx { userId: string; role: string; locale: string; }

/* ------------------------------------------------------------------ */
/*  GET  /api/admin/target-profiles/analytics                          */
/*  Comprehensive analytics for admin dashboard                        */
/* ------------------------------------------------------------------ */
async function handler(req: NextRequest, _ctx: AuthCtx) {
  await connectDB();

  const { searchParams } = new URL(req.url);
  const year = parseInt(searchParams.get("year") ?? String(new Date().getFullYear()));

  const profiles = await TargetProfile.find({
    year,
    status: "active",
    assigneeRole: "super_agent",
  }).lean();

  if (profiles.length === 0) {
    return NextResponse.json({
      leaderboard: [],
      regionComparison: [],
      quarterlyForecast: [],
      underperformers: [],
      topPerformers: [],
    });
  }

  // Resolve names
  const userIds = [...new Set(profiles.map((p) => String(p.assigneeId)))];
  const users = await User.find({ _id: { $in: userIds } })
    .select("_id name email")
    .lean();
  const userMap = new Map(users.map((u) => [String(u._id), u]));

  const enriched = await enrichProfiles(profiles as unknown as Record<string, unknown>[]);
  const rows = enriched.map((p) => {
    const user = userMap.get(p.assigneeId);
    return { ...p, assigneeName: user?.name ?? "Unknown", assigneeEmail: user?.email ?? "" };
  });

  // Leaderboard — sorted by overall progress descending
  const leaderboard = [...rows]
    .sort((a, b) => b.overallProgress - a.overallProgress)
    .map((r, i) => ({
      rank: i + 1,
      _id: r._id,
      assigneeId: r.assigneeId,
      assigneeName: r.assigneeName,
      overallProgress: r.overallProgress,
      employerProgress: r.employerProgress,
      employeeProgress: r.employeeProgress,
      financeProgress: r.financeProgress,
      riskScore: r.riskScore,
    }));

  // Region comparison
  const regionMap = new Map<string, typeof rows>();
  for (const r of rows) {
    const region = r.region || "Unassigned";
    if (!regionMap.has(region)) regionMap.set(region, []);
    regionMap.get(region)!.push(r);
  }

  const regionComparison = Array.from(regionMap.entries()).map(([region, rRows]) => ({
    region,
    supervisors: rRows.length,
    avgPerformance: Math.round(rRows.reduce((s, r) => s + r.overallProgress, 0) / rRows.length),
    totalEmployerTarget: rRows.reduce((s, r) => s + r.employerTarget, 0),
    totalEmployerAchieved: rRows.reduce((s, r) => s + r.employerAchieved, 0),
    totalEmployeeTarget: rRows.reduce((s, r) => s + r.employeeTarget, 0),
    totalEmployeeAchieved: rRows.reduce((s, r) => s + r.employeeAchieved, 0),
    totalFinanceTarget: rRows.reduce((s, r) => s + r.financeTarget, 0),
    totalFinanceAchieved: rRows.reduce((s, r) => s + r.financeAchieved, 0),
    highRisk: rRows.filter((r) => r.riskScore === "high").length,
  }));

  // Quarterly forecast — extrapolate from current pace
  const currentMonth = new Date().getMonth() + 1;
  const monthsElapsed = currentMonth;
  const quarters = [
    { label: "Q1", months: [1, 2, 3] },
    { label: "Q2", months: [4, 5, 6] },
    { label: "Q3", months: [7, 8, 9] },
    { label: "Q4", months: [10, 11, 12] },
  ];

  const totalEmpTarget = rows.reduce((s, r) => s + r.employerTarget, 0);
  const totalEmplTarget = rows.reduce((s, r) => s + r.employeeTarget, 0);
  const totalFinTarget = rows.reduce((s, r) => s + r.financeTarget, 0);
  const totalEmpAchieved = rows.reduce((s, r) => s + r.employerAchieved, 0);
  const totalEmplAchieved = rows.reduce((s, r) => s + r.employeeAchieved, 0);
  const totalFinAchieved = rows.reduce((s, r) => s + r.financeAchieved, 0);

  const monthlyRate = monthsElapsed > 0
    ? {
        employer: totalEmpAchieved / monthsElapsed,
        employee: totalEmplAchieved / monthsElapsed,
        finance: totalFinAchieved / monthsElapsed,
      }
    : { employer: 0, employee: 0, finance: 0 };

  const quarterlyForecast = quarters.map((q) => {
    const maxMonth = Math.max(...q.months);
    const isComplete = currentMonth > maxMonth;
    const forecastMonths = isComplete ? 3 : Math.max(0, maxMonth - monthsElapsed + 1);

    return {
      label: q.label,
      isComplete,
      employerForecast: isComplete
        ? totalEmpAchieved // Use actual for past quarters
        : Math.round(totalEmpAchieved + monthlyRate.employer * forecastMonths),
      employeeForecast: isComplete
        ? totalEmplAchieved
        : Math.round(totalEmplAchieved + monthlyRate.employee * forecastMonths),
      financeForecast: isComplete
        ? totalFinAchieved
        : Math.round(totalFinAchieved + monthlyRate.finance * forecastMonths),
    };
  });

  // Underperformers — below 50% of expected pace
  const expectedPct = Math.round((currentMonth / 12) * 100);
  const underperformers = rows
    .filter((r) => r.overallProgress < expectedPct * 0.5)
    .sort((a, b) => a.overallProgress - b.overallProgress)
    .slice(0, 10)
    .map((r) => ({
      _id: r._id,
      assigneeId: r.assigneeId,
      assigneeName: r.assigneeName,
      overallProgress: r.overallProgress,
      expectedProgress: expectedPct,
      gap: expectedPct - r.overallProgress,
      riskScore: r.riskScore,
    }));

  // Top performers
  const topPerformers = [...rows]
    .sort((a, b) => b.overallProgress - a.overallProgress)
    .slice(0, 5)
    .map((r) => ({
      _id: r._id,
      assigneeId: r.assigneeId,
      assigneeName: r.assigneeName,
      overallProgress: r.overallProgress,
      employerProgress: r.employerProgress,
      employeeProgress: r.employeeProgress,
      financeProgress: r.financeProgress,
    }));

  return NextResponse.json({
    leaderboard,
    regionComparison,
    quarterlyForecast,
    underperformers,
    topPerformers,
    summary: {
      totalEmployerTarget: totalEmpTarget,
      totalEmployeeTarget: totalEmplTarget,
      totalFinanceTarget: totalFinTarget,
      totalEmployerAchieved: totalEmpAchieved,
      totalEmployeeAchieved: totalEmplAchieved,
      totalFinanceAchieved: totalFinAchieved,
      projectedEmployerEOY: Math.round(monthlyRate.employer * 12),
      projectedEmployeeEOY: Math.round(monthlyRate.employee * 12),
      projectedFinanceEOY: Math.round(monthlyRate.finance * 12),
    },
  });
}

export const GET = withAuth(handler, { resource: "targets", action: "read" });
