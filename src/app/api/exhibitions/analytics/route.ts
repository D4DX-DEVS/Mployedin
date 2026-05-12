/**
 * GET /api/exhibitions/analytics — Exhibition performance analytics.
 *
 * Accessible by: admin (all), super_agent (team scope).
 * Returns: KPIs, monthly trend, participation type breakdown, top agents.
 */

import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth, type AuthContext } from "@/lib/auth/withAuth";
import ExhibitionRequest from "@/models/ExhibitionRequest";
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

  // Build scope filter
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const scopeFilter: Record<string, any> = {};

  if (ctx.role === "super_agent") {
    const saProfile = await SuperAgent.findOne({ userId: ctx.userId }).select("_id").lean();
    if (saProfile) {
      const agentProfiles = await Agent.find({ superAgentId: saProfile._id }).select("userId").lean();
      const agentUserIds = agentProfiles.map((a) => a.userId);
      scopeFilter.agentId = { $in: agentUserIds };
    } else {
      scopeFilter.agentId = { $in: [] };
    }
  }

  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year + 1, 0, 1);
  const dateFilter = { createdAt: { $gte: yearStart, $lt: yearEnd } };
  const baseFilter = { ...scopeFilter, ...dateFilter };

  // Run aggregations in parallel
  const [
    statusCounts,
    budgetAgg,
    monthlyTrend,
    participationBreakdown,
    topAgentsAgg,
    totalCount,
  ] = await Promise.all([
    // 1. Count by status
    ExhibitionRequest.aggregate([
      { $match: baseFilter },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
    // 2. Total approved budget
    ExhibitionRequest.aggregate([
      { $match: { ...baseFilter, status: "approved" } },
      {
        $group: {
          _id: null,
          totalBudget: { $sum: "$estimatedBudget" },
          avgBudget: { $avg: "$estimatedBudget" },
          count: { $sum: 1 },
        },
      },
    ]),
    // 3. Monthly trend
    ExhibitionRequest.aggregate([
      { $match: baseFilter },
      {
        $group: {
          _id: { month: { $month: "$createdAt" }, status: "$status" },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.month": 1 } },
    ]),
    // 4. Participation type breakdown
    ExhibitionRequest.aggregate([
      { $match: baseFilter },
      { $group: { _id: "$participationType", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
    // 5. Top agents by request count
    ExhibitionRequest.aggregate([
      { $match: baseFilter },
      {
        $group: {
          _id: "$agentId",
          total: { $sum: 1 },
          approved: { $sum: { $cond: [{ $eq: ["$status", "approved"] }, 1, 0] } },
          totalBudget: { $sum: { $cond: [{ $eq: ["$status", "approved"] }, "$estimatedBudget", 0] } },
        },
      },
      { $sort: { total: -1 } },
      { $limit: 10 },
    ]),
    // 6. Total count
    ExhibitionRequest.countDocuments(baseFilter),
  ]);

  // Parse status counts
  const statusMap: Record<string, number> = { pending: 0, approved: 0, rejected: 0 };
  for (const s of statusCounts) {
    statusMap[s._id] = s.count;
  }

  // Approval rate
  const decided = statusMap.approved + statusMap.rejected;
  const approvalRate = decided > 0 ? Math.round((statusMap.approved / decided) * 100) : 0;

  // Budget
  const budget = budgetAgg[0] ?? { totalBudget: 0, avgBudget: 0, count: 0 };

  // Monthly trend - build full 12-month series
  const monthly = Array.from({ length: 12 }, (_, i) => ({
    month: MONTH_NAMES[i],
    pending: 0,
    approved: 0,
    rejected: 0,
    total: 0,
  }));
  for (const row of monthlyTrend) {
    const idx = row._id.month - 1;
    if (idx >= 0 && idx < 12) {
      monthly[idx][row._id.status as "pending" | "approved" | "rejected"] = row.count;
      monthly[idx].total += row.count;
    }
  }

  // Participation breakdown
  const participation = participationBreakdown.map((p) => ({
    type: p._id ?? "unknown",
    count: p.count,
  }));

  // Top agents — resolve names
  const agentUserIds = topAgentsAgg.map((a) => a._id);
  const agentUsers = await User.find({ _id: { $in: agentUserIds } })
    .select("_id name email")
    .lean();
  const nameMap = new Map(agentUsers.map((u) => [String(u._id), u.name]));

  const topAgents = topAgentsAgg.map((a) => ({
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
      pending: statusMap.pending,
      approved: statusMap.approved,
      rejected: statusMap.rejected,
      approvalRate,
      totalApprovedBudget: Math.round(budget.totalBudget ?? 0),
      avgBudget: Math.round(budget.avgBudget ?? 0),
    },
    monthly,
    participation,
    topAgents,
  });
}

export const GET = withAuth(handler, { resource: "exhibitions", action: "read" });
