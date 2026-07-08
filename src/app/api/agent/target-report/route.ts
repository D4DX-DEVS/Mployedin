import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import TargetProfile from "@/models/TargetProfile";
import { enrichProfile } from "@/lib/targets/profileAchievementCalculator";
import Agent from "@/models/Agent";
import Commission from "@/models/Commission";

interface AuthCtx { userId: string; role: string; locale: string; }

/* ------------------------------------------------------------------ */
/*  GET  /api/agent/target-report                                      */
/*  Individual agent target report: trends, YoY, personal volume       */
/* ------------------------------------------------------------------ */
async function handler(req: NextRequest, ctx: AuthCtx) {
  await connectDB();

  const { searchParams } = new URL(req.url);
  const currentYear = new Date().getFullYear();
  const requestedYear = parseInt(searchParams.get("year") ?? String(currentYear));
  const year = Number.isFinite(requestedYear) ? requestedYear : currentYear;
  const compareYear = year - 1;

  // Own profile (current year)
  const ownProfile = await TargetProfile.findOne({
    assigneeId: ctx.userId,
    assigneeRole: "agent",
    year,
    status: "active",
  }).lean();

  const ownPrev = await TargetProfile.findOne({
    assigneeId: ctx.userId,
    assigneeRole: "agent",
    year: compareYear,
    status: "active",
  }).lean();

  const enrichedOwn = ownProfile
    ? await enrichProfile(ownProfile as unknown as Record<string, unknown>)
    : null;
  const enrichedPrev = ownPrev
    ? await enrichProfile(ownPrev as unknown as Record<string, unknown>)
    : null;

  if (!enrichedOwn) {
    return NextResponse.json({
      year,
      ownProfile: null,
      monthlyTrend: [],
      yearOverYear: null,
      businessVolume: [],
      totalBusinessVolume: 0,
    });
  }

  // --- Monthly Trend ---
  const monthlyTrend = enrichedOwn.monthlyAchievements.map((m) => ({
    month: m.month,
    employerTarget: m.employerTarget,
    employeeTarget: m.employeeTarget,
    financeTarget: m.financeTarget,
    employerAchieved: m.employerAchieved,
    employeeAchieved: m.employeeAchieved,
    financeAchieved: m.financeAchieved,
    overallProgress: m.overallProgress,
  }));

  // --- YoY ---
  const yoyGrowth = (curr: number, prev: number) =>
    prev > 0 ? Math.round(((curr - prev) / prev) * 100) : curr > 0 ? 100 : 0;

  const yearOverYear = enrichedPrev
    ? {
        currentYear: {
          year,
          employerAchieved: enrichedOwn.employerAchieved,
          employeeAchieved: enrichedOwn.employeeAchieved,
          financeAchieved: enrichedOwn.financeAchieved,
          overallProgress: enrichedOwn.overallProgress,
        },
        previousYear: {
          year: compareYear,
          employerAchieved: enrichedPrev.employerAchieved,
          employeeAchieved: enrichedPrev.employeeAchieved,
          financeAchieved: enrichedPrev.financeAchieved,
          overallProgress: enrichedPrev.overallProgress,
        },
        growth: {
          employerAchieved: yoyGrowth(enrichedOwn.employerAchieved, enrichedPrev.employerAchieved),
          employeeAchieved: yoyGrowth(enrichedOwn.employeeAchieved, enrichedPrev.employeeAchieved),
          financeAchieved: yoyGrowth(enrichedOwn.financeAchieved, enrichedPrev.financeAchieved),
          overallProgress: yoyGrowth(enrichedOwn.overallProgress, enrichedPrev.overallProgress),
        },
      }
    : null;

  // --- Business Volume (personal commissions) ---
  const agentDoc = await Agent.findOne({ userId: ctx.userId }).select("_id").lean();
  const agentDocId = agentDoc?._id ?? null;

  let businessVolume: { month: number; approved: number; total: number; count: number }[] = [];
  let totalBusinessVolume = 0;

  if (agentDocId) {
    const bvAgg = await Commission.aggregate([
      {
        $match: {
          agentId: agentDocId,
          createdAt: { $gte: new Date(year, 0, 1), $lte: new Date(year, 11, 31, 23, 59, 59, 999) },
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

    businessVolume = Array.from({ length: 12 }, (_, i) => {
      const month = i + 1;
      const approved = bvAgg.filter(
        (a) => a._id.month === month && ["approved", "paid"].includes(a._id.status)
      );
      const all = bvAgg.filter((a) => a._id.month === month);
      return {
        month,
        approved: approved.reduce((s, a) => s + (a.total ?? 0), 0),
        total: all.reduce((s, a) => s + (a.total ?? 0), 0),
        count: all.reduce((s, a) => s + (a.count ?? 0), 0),
      };
    });
    totalBusinessVolume = businessVolume.reduce((s, m) => s + m.total, 0);
  }

  return NextResponse.json({
    year,
    ownProfile: enrichedOwn,
    monthlyTrend,
    yearOverYear,
    businessVolume,
    totalBusinessVolume,
  });
}

export const GET = withAuth(handler, { resource: "targets", action: "read" });
