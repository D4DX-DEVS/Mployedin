import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import { getSuperAgentScope } from "@/lib/auth/agentRestrictions";
import Agent from "@/models/Agent";
import User from "@/models/User";
import Lead from "@/models/Lead";
import Placement from "@/models/Placement";
import Commission from "@/models/Commission";

interface AuthCtx {
  userId: string;
  role: string;
  locale: string;
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const GET = withAuth(async (_req: NextRequest, ctx: AuthCtx) => {
  await connectDB();

  const scope = await getSuperAgentScope(ctx.userId);
  if (!scope) {
    return NextResponse.json({ error: "Super-agent profile not found" }, { status: 404 });
  }

  const agentDocIds = scope.effectiveAgentIds;
  const agentDocs = await Agent.find({ _id: { $in: agentDocIds } })
    .select("userId performance")
    .lean();
  const agentUserIds = agentDocs.map((a) => a.userId);

  // Fetch agent names
  const agentUsers = await User.find({ _id: { $in: agentUserIds } })
    .select("_id name isActive")
    .lean();
  const nameMap = new Map(agentUsers.map((u) => [String(u._id), u.name]));

  const [totalAgents, totalLeads, totalPlacements, commissionAgg] = await Promise.all([
    User.countDocuments({ _id: { $in: agentUserIds }, role: "agent", isActive: true }),
    Lead.countDocuments({ agentId: { $in: agentDocIds } }),
    Placement.countDocuments({
      $or: [
        { agentId: { $in: agentDocIds } },
        { superAgentId: ctx.userId },
      ],
    }),
    Commission.aggregate([
      {
        $match: {
          $or: [
            { agentId: { $in: agentDocIds.map(String) } },
            { superAgentId: ctx.userId },
          ],
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$amount" },
          pending: {
            $sum: { $cond: [{ $eq: ["$status", "pending"] }, "$amount", 0] },
          },
          approved: {
            $sum: { $cond: [{ $eq: ["$status", "approved"] }, "$amount", 0] },
          },
          paid: {
            $sum: { $cond: [{ $eq: ["$status", "paid"] }, "$amount", 0] },
          },
        },
      },
    ]),
  ]);

  const commData = commissionAgg[0] ?? { total: 0, pending: 0, approved: 0, paid: 0 };

  // ── Agent Breakdown: per-agent leads, placements, conversion, commission ──
  const [leadsByAgent, placementsByAgent, commissionsByAgent] = await Promise.all([
    Lead.aggregate([
      { $match: { agentId: { $in: agentDocIds } } },
      { $group: { _id: "$agentId", total: { $sum: 1 }, converted: { $sum: { $cond: [{ $eq: ["$status", "converted"] }, 1, 0] } } } },
    ]),
    Placement.aggregate([
      { $match: { agentId: { $in: agentDocIds } } },
      { $group: { _id: "$agentId", count: { $sum: 1 } } },
    ]),
    Commission.aggregate([
      { $match: { agentId: { $in: agentDocIds.map(String) } } },
      { $group: { _id: "$agentId", total: { $sum: "$amount" } } },
    ]),
  ]);

  const leadsMap = new Map(leadsByAgent.map((r) => [String(r._id), { total: r.total, converted: r.converted }]));
  const placementsMap = new Map(placementsByAgent.map((r) => [String(r._id), r.count]));
  const commissionsMap = new Map(commissionsByAgent.map((r) => [String(r._id), r.total]));

  const agentBreakdown = agentDocs.map((a) => {
    const leadsInfo = leadsMap.get(String(a._id)) ?? { total: 0, converted: 0 };
    const placements = placementsMap.get(String(a._id)) ?? 0;
    const commission = commissionsMap.get(String(a._id)) ?? 0;
    return {
      name: nameMap.get(String(a.userId)) ?? "Unknown",
      leads: leadsInfo.total,
      placements,
      conversionRate: leadsInfo.total > 0 ? Math.round((leadsInfo.converted / leadsInfo.total) * 100) : 0,
      commission,
    };
  }).sort((a, b) => b.placements - a.placements);

  // ── Monthly Trends: last 6 months of leads, placements, commissions ──
  const now = new Date();
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

  const [leadsByMonth, placementsByMonth, commissionsByMonth] = await Promise.all([
    Lead.aggregate([
      { $match: { agentId: { $in: agentDocIds }, createdAt: { $gte: sixMonthsAgo } } },
      { $group: { _id: { y: { $year: "$createdAt" }, m: { $month: "$createdAt" } }, count: { $sum: 1 } } },
    ]),
    Placement.aggregate([
      { $match: { agentId: { $in: agentDocIds }, createdAt: { $gte: sixMonthsAgo } } },
      { $group: { _id: { y: { $year: "$createdAt" }, m: { $month: "$createdAt" } }, count: { $sum: 1 } } },
    ]),
    Commission.aggregate([
      { $match: { agentId: { $in: agentDocIds.map(String) }, createdAt: { $gte: sixMonthsAgo } } },
      { $group: { _id: { y: { $year: "$createdAt" }, m: { $month: "$createdAt" } }, total: { $sum: "$amount" } } },
    ]),
  ]);

  const mkKey = (r: { _id: { y: number; m: number } }) => `${r._id.y}-${r._id.m}`;
  const leadsMonthMap = new Map(leadsByMonth.map((r) => [mkKey(r), r.count]));
  const placementsMonthMap = new Map(placementsByMonth.map((r) => [mkKey(r), r.count]));
  const commissionsMonthMap = new Map(commissionsByMonth.map((r) => [mkKey(r), r.total]));

  const monthlyTrends: { month: string; leads: number; placements: number; revenue: number; trend: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${d.getMonth() + 1}`;
    const leads = leadsMonthMap.get(key) ?? 0;
    const placements = placementsMonthMap.get(key) ?? 0;
    const revenue = commissionsMonthMap.get(key) ?? 0;

    // Trend: compare leads to previous month
    const prevD = new Date(d.getFullYear(), d.getMonth() - 1, 1);
    const prevKey = `${prevD.getFullYear()}-${prevD.getMonth() + 1}`;
    const prevLeads = leadsMonthMap.get(prevKey) ?? 0;
    const trend = prevLeads > 0 ? Math.round(((leads - prevLeads) / prevLeads) * 100) : leads > 0 ? 100 : 0;

    monthlyTrends.push({
      month: `${MONTH_NAMES[d.getMonth()]} ${String(d.getFullYear()).slice(-2)}`,
      leads,
      placements,
      revenue,
      trend,
    });
  }

  return NextResponse.json({
    totalAgents,
    totalLeads,
    totalPlacements,
    totalCommissions: commData.total,
    commissionBreakdown: {
      pending: commData.pending,
      approved: commData.approved,
      paid: commData.paid,
    },
    agentBreakdown,
    monthlyTrends,
  });
}, { resource: "reports", action: "read" });
