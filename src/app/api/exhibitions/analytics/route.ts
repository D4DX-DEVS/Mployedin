import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth, type AuthContext } from "@/lib/auth/withAuth";
import ExhibitionRequest from "@/models/ExhibitionRequest";
import ExhibitionPerformance from "@/models/ExhibitionPerformance";
import Agent from "@/models/Agent";
import User from "@/models/User";
import { getSuperAgentScope } from "@/lib/auth/agentRestrictions";

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Statuses that have cleared approval. `completed` is included: it passed approval first. */
const APPROVED_STATUSES = ["approved", "budget_approved", "resources_assigned", "active", "completed"];

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
    // Canonical scope (team ∪ region), matching /api/exhibitions. This used to
    // read Agent.find({ superAgentId }), a third and narrower notion of "my
    // agents", so the analytics page silently omitted region-inherited agents
    // that the request list right next to it included.
    // ExhibitionRequest.agentId stores the Agent's User._id — map ids → userIds.
    const scope = await getSuperAgentScope(ctx.userId);
    const agentProfiles = scope
      ? await Agent.find({ _id: { $in: scope.effectiveAgentIds } }).select("userId").lean()
      : [];
    scopeFilter.agentId = { $in: agentProfiles.map((a) => a.userId) };
  }

  const yearStart = new Date(year, 0, 1);
  const yearEnd = new Date(year + 1, 0, 1);
  const dateFilter = { createdAt: { $gte: yearStart, $lt: yearEnd } };
  // Soft-deleted requests are hidden by the list route next door
  // (api/exhibitions/route.ts), so counting them here made the analytics
  // "Requests" total larger than the list the super-agent can actually see.
  const baseFilter = { ...scopeFilter, ...dateFilter, isDeleted: { $ne: true } };

  const [
    statusCounts, budgetAgg, monthlyTrend, participationBreakdown,
    topAgentsAgg, totalCount, performanceAgg,
  ] = await Promise.all([
    ExhibitionRequest.aggregate([
      { $match: baseFilter },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
    ExhibitionRequest.aggregate([
      { $match: { ...baseFilter, status: { $in: APPROVED_STATUSES } } },
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
    // Participation styles are a multi-select, so this counts style selections,
    // not requests — one request with two styles contributes to both slices and
    // the slices never sum to the request count. `preserveNullAndEmptyArrays`
    // keeps requests that picked nothing: without it they vanished silently and
    // the chart read as if only a handful of requests existed. They land in the
    // `unspecified` bucket instead, which is the honest answer.
    ExhibitionRequest.aggregate([
      { $match: baseFilter },
      { $unwind: { path: "$participationTypes", preserveNullAndEmptyArrays: true } },
      { $group: { _id: { $ifNull: ["$participationTypes", "unspecified"] }, count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
    ExhibitionRequest.aggregate([
      { $match: baseFilter },
      {
        $group: {
          _id: "$agentId",
          total: { $sum: 1 },
          approved: {
            $sum: { $cond: [{ $in: ["$status", APPROVED_STATUSES] }, 1, 0] },
          },
          rejected: {
            $sum: { $cond: [{ $eq: ["$status", "rejected"] }, 1, 0] },
          },
          totalBudget: {
            $sum: { $cond: [{ $in: ["$status", APPROVED_STATUSES] }, "$estimatedBudget", 0] },
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

  const approvedCount = APPROVED_STATUSES.reduce((sum, status) => sum + (statusMap[status] ?? 0), 0);
  const rejectedCount = statusMap.rejected ?? 0;
  const decided = approvedCount + rejectedCount;
  const approvalRate = decided > 0 ? Math.round((approvedCount / decided) * 100) : 0;

  // Pipeline buckets must partition the request total, or the progress bars
  // below them divide by a total they never add up to. `approved` above counts
  // everything that cleared approval INCLUDING completed, so the pipeline row
  // has to subtract completed or the same requests are drawn twice. `other`
  // absorbs draft / revision_requested / archived — and anything added to
  // EXHIBITION_STATUSES later — so the partition always closes.
  const completedCount = statusMap.completed ?? 0;
  const submittedCount = statusMap.submitted ?? 0;
  const underReviewCount = statusMap.under_review ?? 0;
  const approvedInProgress = approvedCount - completedCount;
  const otherCount = Math.max(
    0,
    totalCount - submittedCount - underReviewCount - approvedInProgress - completedCount - rejectedCount,
  );

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

  // Same denominator as the headline card: approved ÷ decided. This row used to
  // divide by every request the agent had ever raised, so the table said 6%
  // under the same word the card printed 67% — two formulas, one label.
  const topAgents = topAgentsAgg.map((a: { _id: string; total: number; approved: number; rejected: number; totalBudget: number }) => {
    const agentDecided = a.approved + (a.rejected ?? 0);
    return {
      agentId: String(a._id),
      name: nameMap.get(String(a._id)) ?? "Unknown",
      total: a.total,
      approved: a.approved,
      rejected: a.rejected ?? 0,
      decided: agentDecided,
      approvalRate: agentDecided > 0 ? Math.round((a.approved / agentDecided) * 100) : 0,
      totalBudget: a.totalBudget ?? 0,
    };
  });

  return NextResponse.json({
    year,
    kpis: {
      totalRequests: totalCount,
      submitted: submittedCount,
      underReview: underReviewCount,
      /** Everything that cleared approval, completed included — the approval-rate numerator. */
      approved: approvedCount,
      /** Approved but not yet completed — the pipeline row, so completed is not drawn twice. */
      approvedInProgress,
      rejected: rejectedCount,
      completed: completedCount,
      /** Draft / revision requested / archived — whatever the named buckets leave over. */
      other: otherCount,
      approvalRate,
      /** Denominator behind approvalRate, so the UI can say what the % is out of. */
      decided,
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
