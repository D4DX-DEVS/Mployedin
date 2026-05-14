import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth, type AuthContext } from "@/lib/auth/withAuth";
import ExhibitionRequest from "@/models/ExhibitionRequest";
import ExhibitionPerformance from "@/models/ExhibitionPerformance";
import Agent from "@/models/Agent";
import SuperAgent from "@/models/SuperAgent";
import User from "@/models/User";

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

async function handler(req: NextRequest, ctx: AuthContext) {
  if (ctx.role !== "admin" && ctx.role !== "super_agent") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();

  const { searchParams } = new URL(req.url);
  const year = parseInt(searchParams.get("year") ?? String(new Date().getFullYear()));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scopeFilter: Record<string, any> = {};

  if (ctx.role === "super_agent") {
    const saProfile = await SuperAgent.findOne({ userId: ctx.userId }).select("_id").lean();
    if (saProfile) {
      const agentProfiles = await Agent.find({ superAgentId: saProfile._id }).select("userId").lean();
      scopeFilter.agentId = { $in: agentProfiles.map((a) => a.userId) };
    } else {
      scopeFilter.agentId = { $in: [] };
    }
  }

  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year + 1, 0, 1);
  const dateFilter = { createdAt: { $gte: yearStart, $lt: yearEnd } };
  const baseFilter = { ...scopeFilter, ...dateFilter };

  const [
    statusCounts, budgetAgg, monthlyTrend, participationBreakdown,
    topAgentsAgg, totalCount, performanceAgg,
  ] = await Promise.all([
    ExhibitionRequest.aggregate([
      { $match: baseFilter },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
    ExhibitionRequest.aggregate([
      { $match: { ...baseFilter, status: { $in: ["approved", "budget_approved", "resources_assigned", "active", "completed"] } } },
      {
        $group: {
          _id: null,
          totalEstimated: { $sum: "$estimatedBudget" },
          totalApproved: { $sum: "$approvedBudget" },
          totalActualSpend: { $sum: "$actualSpend" },
          avgBudget: { $avg: "$estimatedBudget" },
          count: { $sum: 1 },
        },
      },
    ]),
    ExhibitionRequest.aggregate([
      { $match: baseFilter },
      { $group: { _id: { month: { $month: "$createdAt" }, status: "$status" }, count: { $sum: 1 } } },
      { $sort: { "_id.month": 1 } },
    ]),
    ExhibitionRequest.aggregate([
      { $match: baseFilter },
      { $unwind: "$participationTypes" },
      { $group: { _id: "$participationTypes", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
    ExhibitionRequest.aggregate([
      { $match: baseFilter },
      {
        $group: {
          _id: "$agentId",
          total: { $sum: 1 },
          approved: {
            $sum: { $cond: [{ $in: ["$status", ["approved", "budget_approved", "resources_assigned", "active", "completed"]] }, 1, 0] },
          },
          totalBudget: {
            $sum: { $cond: [{ $in: ["$status", ["approved", "budget_approved", "resources_assigned", "active", "completed"]] }, "$estimatedBudget", 0] },
          },
        },
      },
      { $sort: { total: -1 } },
      { $limit: 10 },
    ]),
    ExhibitionRequest.countDocuments(baseFilter),
    // Performance aggregation (ROI data)
    ExhibitionPerformance.aggregate([
      {
        $lookup: {
          from: "exhibitionrequests",
          localField: "exhibitionId",
          foreignField: "_id",
          as: "exhibition",
        },
      },
      { $unwind: "$exhibition" },
      { $match: { "exhibition.createdAt": { $gte: yearStart, $lt: yearEnd }, ...(scopeFilter.agentId ? { "exhibition.agentId": scopeFilter.agentId } : {}) } },
      {
        $group: {
          _id: null,
          totalLeads: { $sum: "$leadsGenerated" },
          totalEmployers: { $sum: "$employersContacted" },
          totalCandidates: { $sum: "$candidatesSourced" },
          totalHires: { $sum: "$hiresGenerated" },
          totalRevenue: { $sum: "$revenue" },
          totalCost: { $sum: "$actualCost" },
          count: { $sum: 1 },
        },
      },
    ]),
  ]);

  // Status counts
  const statusMap: Record<string, number> = {};
  for (const s of statusCounts) statusMap[s._id] = s.count;

  const approvedCount = (statusMap.approved ?? 0) + (statusMap.budget_approved ?? 0) +
    (statusMap.resources_assigned ?? 0) + (statusMap.active ?? 0) + (statusMap.completed ?? 0);
  const rejectedCount = statusMap.rejected ?? 0;
  const decided = approvedCount + rejectedCount;
  const approvalRate = decided > 0 ? Math.round((approvedCount / decided) * 100) : 0;

  const budget = budgetAgg[0] ?? { totalEstimated: 0, totalApproved: 0, totalActualSpend: 0, avgBudget: 0, count: 0 };
  const perf = performanceAgg[0] ?? { totalLeads: 0, totalEmployers: 0, totalCandidates: 0, totalHires: 0, totalRevenue: 0, totalCost: 0, count: 0 };

  const overallROI = perf.totalCost > 0
    ? Math.round(((perf.totalRevenue - perf.totalCost) / perf.totalCost) * 100)
    : 0;

  // Monthly trend
  const monthly = Array.from({ length: 12 }, (_, i) => ({
    month: MONTH_NAMES[i],
    submitted: 0, under_review: 0, approved: 0, completed: 0, rejected: 0, total: 0,
  }));
  for (const row of monthlyTrend) {
    const idx = row._id.month - 1;
    if (idx >= 0 && idx < 12) {
      const s = row._id.status as string;
      if (s in monthly[idx]) (monthly[idx] as unknown as Record<string, number>)[s] = row.count;
      monthly[idx].total += row.count;
    }
  }

  const participation = participationBreakdown.map((p: { _id: string; count: number }) => ({
    type: p._id ?? "unknown",
    count: p.count,
  }));

  const agentUserIds = topAgentsAgg.map((a: { _id: string }) => a._id);
  const agentUsers = await User.find({ _id: { $in: agentUserIds } }).select("_id name email").lean();
  const nameMap = new Map(agentUsers.map((u) => [String(u._id), u.name]));

  const topAgents = topAgentsAgg.map((a: { _id: string; total: number; approved: number; totalBudget: number }) => ({
    agentId: String(a._id),
    name: nameMap.get(String(a._id)) ?? "Unknown",
    total: a.total,
    approved: a.approved,
    approvalRate: a.total > 0 ? Math.round((a.approved / a.total) * 100) : 0,
    totalBudget: a.totalBudget ?? 0,
  }));

  return NextResponse.json({
    year,
    kpis: {
      totalRequests: totalCount,
      submitted: statusMap.submitted ?? 0,
      underReview: statusMap.under_review ?? 0,
      approved: approvedCount,
      rejected: rejectedCount,
      completed: statusMap.completed ?? 0,
      approvalRate,
      totalEstimatedBudget: Math.round(budget.totalEstimated ?? 0),
      totalApprovedBudget: Math.round(budget.totalApproved ?? 0),
      totalActualSpend: Math.round(budget.totalActualSpend ?? 0),
      avgBudget: Math.round(budget.avgBudget ?? 0),
      budgetVariance: Math.round((budget.totalApproved ?? 0) - (budget.totalActualSpend ?? 0)),
    },
    performance: {
      totalLeads: perf.totalLeads,
      totalEmployers: perf.totalEmployers,
      totalCandidates: perf.totalCandidates,
      totalHires: perf.totalHires,
      totalRevenue: Math.round(perf.totalRevenue),
      totalCost: Math.round(perf.totalCost),
      roi: overallROI,
      eventsReported: perf.count,
    },
    monthly,
    participation,
    topAgents,
  });
}

export const GET = withAuth(handler, { resource: "exhibitions", action: "read" });
