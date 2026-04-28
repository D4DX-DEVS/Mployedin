import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthContext } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import Agent from "@/models/Agent";
import Job from "@/models/Job";
import Application from "@/models/Application";
import Lead from "@/models/Lead";
import Placement from "@/models/Placement";
import Commission from "@/models/Commission";
import Interview from "@/models/Interview";
import Offer from "@/models/Offer";

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * GET /api/agent/analytics
 * Structured analytics for the agent dashboard/reports:
 * - KPIs with 30-day trend comparisons
 * - Lead funnel (new→contacted→interested→negotiating→converted/lost)
 * - Application status breakdown
 * - Monthly trends (6 months)
 * - Commission summary
 */
async function handler(_req: NextRequest, ctx: AuthContext) {
  if (ctx.role !== "agent" && ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();

  const agent = await Agent.findOne({ userId: ctx.userId })
    .select("_id assignedEmployerIds performance commissionRate")
    .lean();
  if (!agent) {
    return NextResponse.json({ error: "Agent profile not found" }, { status: 404 });
  }

  const agentId = agent._id;
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - THIRTY_DAYS_MS);
  const sixtyDaysAgo = new Date(now.getTime() - THIRTY_DAYS_MS * 2);
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

  // ── KPIs with trend comparisons ──
  const [
    currentLeads, previousLeads,
    currentPlacements, previousPlacements,
    currentApps, previousApps,
    currentInterviews, previousInterviews,
    totalLeads, totalPlacements, totalApps,
    activeJobs, totalOffers, scheduledInterviews,
  ] = await Promise.all([
    Lead.countDocuments({ agentId, createdAt: { $gte: thirtyDaysAgo } }),
    Lead.countDocuments({ agentId, createdAt: { $gte: sixtyDaysAgo, $lt: thirtyDaysAgo } }),
    Placement.countDocuments({ agentId, createdAt: { $gte: thirtyDaysAgo } }),
    Placement.countDocuments({ agentId, createdAt: { $gte: sixtyDaysAgo, $lt: thirtyDaysAgo } }),
    Application.countDocuments({ agentId, createdAt: { $gte: thirtyDaysAgo } }),
    Application.countDocuments({ agentId, createdAt: { $gte: sixtyDaysAgo, $lt: thirtyDaysAgo } }),
    Interview.countDocuments({ agentId, createdAt: { $gte: thirtyDaysAgo } }),
    Interview.countDocuments({ agentId, createdAt: { $gte: sixtyDaysAgo, $lt: thirtyDaysAgo } }),
    Lead.countDocuments({ agentId }),
    Placement.countDocuments({ agentId }),
    Application.countDocuments({ agentId }),
    Job.countDocuments({ agentId, status: "active" }),
    Offer.countDocuments({ agentId }),
    Interview.countDocuments({ agentId, status: "scheduled" }),
  ]);

  function buildTrend(current: number, previous: number) {
    const delta = previous === 0
      ? current === 0 ? 0 : 100
      : Math.round(((current - previous) / previous) * 100);
    return { current, previous, delta, direction: delta > 0 ? "up" : delta < 0 ? "down" : "flat" };
  }

  // ── Lead Funnel ──
  const leadFunnel = await Lead.aggregate([
    { $match: { agentId } },
    { $group: { _id: "$status", count: { $sum: 1 } } },
  ]);
  const leadFunnelMap: Record<string, number> = {};
  for (const r of leadFunnel) leadFunnelMap[r._id] = r.count;

  // ── Application Status Breakdown ──
  const appStatus = await Application.aggregate([
    { $match: { agentId } },
    { $group: { _id: "$status", count: { $sum: 1 } } },
    { $sort: { count: -1 } },
  ]);
  const appStatusMap: Record<string, number> = {};
  for (const r of appStatus) appStatusMap[r._id] = r.count;

  // ── Commission Summary ──
  const commAgg = await Commission.aggregate([
    { $match: { agentId: String(agentId) } },
    {
      $group: {
        _id: "$status",
        total: { $sum: "$amount" },
        count: { $sum: 1 },
      },
    },
  ]);
  const commByStatus: Record<string, { total: number; count: number }> = {};
  for (const r of commAgg) commByStatus[r._id] = { total: r.total, count: r.count };

  // ── Monthly Trends (6 months): leads, placements, applications ──
  const [leadsByMonth, placementsByMonth, appsByMonth] = await Promise.all([
    Lead.aggregate([
      { $match: { agentId, createdAt: { $gte: sixMonthsAgo } } },
      { $group: { _id: { y: { $year: "$createdAt" }, m: { $month: "$createdAt" } }, count: { $sum: 1 } } },
    ]),
    Placement.aggregate([
      { $match: { agentId, createdAt: { $gte: sixMonthsAgo } } },
      { $group: { _id: { y: { $year: "$createdAt" }, m: { $month: "$createdAt" } }, count: { $sum: 1 } } },
    ]),
    Application.aggregate([
      { $match: { agentId, createdAt: { $gte: sixMonthsAgo } } },
      { $group: { _id: { y: { $year: "$createdAt" }, m: { $month: "$createdAt" } }, count: { $sum: 1 } } },
    ]),
  ]);

  const mkKey = (r: { _id: { y: number; m: number } }) => `${r._id.y}-${r._id.m}`;
  const leadsM = new Map(leadsByMonth.map((r) => [mkKey(r), r.count]));
  const placementsM = new Map(placementsByMonth.map((r) => [mkKey(r), r.count]));
  const appsM = new Map(appsByMonth.map((r) => [mkKey(r), r.count]));

  const monthlyTrends: { month: string; leads: number; placements: number; applications: number; trend: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${d.getMonth() + 1}`;
    const leads = leadsM.get(key) ?? 0;
    const placements = placementsM.get(key) ?? 0;
    const applications = appsM.get(key) ?? 0;

    const prevD = new Date(d.getFullYear(), d.getMonth() - 1, 1);
    const prevKey = `${prevD.getFullYear()}-${prevD.getMonth() + 1}`;
    const prevLeads = leadsM.get(prevKey) ?? 0;
    const trend = prevLeads > 0 ? Math.round(((leads - prevLeads) / prevLeads) * 100) : leads > 0 ? 100 : 0;

    monthlyTrends.push({
      month: `${MONTH_NAMES[d.getMonth()]} ${String(d.getFullYear()).slice(-2)}`,
      leads,
      placements,
      applications,
      trend,
    });
  }

  // ── Overdue follow-ups ──
  const overdueFollowUps = await Lead.countDocuments({
    agentId,
    status: { $nin: ["converted", "lost"] },
    followUpAt: { $lt: now },
  });

  return NextResponse.json({
    kpis: {
      totalLeads,
      totalPlacements,
      totalApplications: totalApps,
      activeJobs,
      totalOffers,
      scheduledInterviews,
      employers: agent.assignedEmployerIds?.length ?? 0,
      overdueFollowUps,
    },
    trends: {
      leads: buildTrend(currentLeads, previousLeads),
      placements: buildTrend(currentPlacements, previousPlacements),
      applications: buildTrend(currentApps, previousApps),
      interviews: buildTrend(currentInterviews, previousInterviews),
    },
    leadFunnel: {
      new: leadFunnelMap["new"] ?? 0,
      contacted: leadFunnelMap["contacted"] ?? 0,
      interested: leadFunnelMap["interested"] ?? 0,
      negotiating: leadFunnelMap["negotiating"] ?? 0,
      converted: leadFunnelMap["converted"] ?? 0,
      lost: leadFunnelMap["lost"] ?? 0,
    },
    applicationBreakdown: appStatusMap,
    commissions: {
      pending: commByStatus["pending"] ?? { total: 0, count: 0 },
      approved: commByStatus["approved"] ?? { total: 0, count: 0 },
      paid: commByStatus["paid"] ?? { total: 0, count: 0 },
    },
    performance: agent.performance,
    commissionRate: agent.commissionRate ?? 0,
    monthlyTrends,
  });
}

export const GET = withAuth(handler);
