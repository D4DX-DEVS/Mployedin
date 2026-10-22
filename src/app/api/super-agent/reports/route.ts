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

/**
 * Commission that still counts as earned. A clawed-back line was reversed and a
 * disputed one is not agreed, so neither belongs in a performance total — the
 * old figure summed every status.
 */
const EARNED_STATUSES = ["pending", "approved", "paid"];

const monthKey = (year: number, month: number) => `${year}-${String(month).padStart(2, "0")}`;

export const GET = withAuth(async (_req: NextRequest, ctx: AuthCtx) => {
  await connectDB();

  const scope = await getSuperAgentScope(ctx.userId);
  if (!scope) {
    return NextResponse.json({ error: "Super-agent profile not found" }, { status: 404 });
  }

  const agentDocIds = scope.effectiveAgentIds;
  const agentDocs = await Agent.find({ _id: { $in: agentDocIds } })
    .select("userId")
    .lean();
  const agentUserIds = agentDocs.map((a) => a.userId);

  const agentUsers = await User.find({ _id: { $in: agentUserIds } })
    .select("_id name isActive")
    .lean();
  const userMap = new Map(agentUsers.map((u) => [String(u._id), u]));

  // What the agents earned, keyed on the earner. `superAgentId` is not used:
  // placement lines carry it as the overseer (see commissionBeneficiary), so it
  // would pull in lines from agents who have since left the team. The super
  // agent's own overrides are on the Commissions tab. Keeping them out means
  // the agent rows add up to the headline figure.
  const commissionScope = {
    agentId: { $in: agentDocIds },
    status: { $in: EARNED_STATUSES },
  };

  const [totalAgents, totalLeads, totalPlacements, commissionByCurrency] = await Promise.all([
    User.countDocuments({ _id: { $in: agentUserIds }, role: "agent", isActive: true }),
    Lead.countDocuments({ agentId: { $in: agentDocIds } }),
    Placement.countDocuments({
      $or: [
        { agentId: { $in: agentDocIds } },
        { superAgentId: scope.saProfileId },
      ],
    }),
    Commission.aggregate<{ _id: string | null; total: number }>([
      { $match: commissionScope },
      { $group: { _id: "$currency", total: { $sum: "$amount" } } },
      { $sort: { total: -1 } },
    ]),
  ]);

  // Amounts in different currencies cannot be added up. Report in the currency
  // that carries most of the money and list the rest separately — the same rule
  // the commission report uses.
  // A line with no currency is AED (the schema default), so fold it in.
  const totalsByCode = new Map<string, number>();
  for (const row of commissionByCurrency) {
    const code = row._id ?? "AED";
    totalsByCode.set(code, (totalsByCode.get(code) ?? 0) + row.total);
  }
  const currencyTotals = [...totalsByCode]
    .map(([code, total]) => ({ currency: code, total }))
    .sort((a, b) => b.total - a.total);
  const currency = currencyTotals[0]?.currency ?? "AED";
  const otherCurrencies = currencyTotals.slice(1).filter((row) => row.total > 0);
  const inCurrency = currency === "AED"
    ? { $in: ["AED", null] }
    : currency;

  // ── Agent breakdown: per-agent leads, placements, conversion, commission ──
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
      { $match: { ...commissionScope, currency: inCurrency } },
      { $group: { _id: "$agentId", total: { $sum: "$amount" } } },
    ]),
  ]);

  const leadsMap = new Map(leadsByAgent.map((r) => [String(r._id), { total: r.total, converted: r.converted }]));
  const placementsMap = new Map(placementsByAgent.map((r) => [String(r._id), r.count]));
  const commissionsMap = new Map(commissionsByAgent.map((r) => [String(r._id), r.total]));

  const agentBreakdown = agentDocs.map((a) => {
    const leadsInfo = leadsMap.get(String(a._id)) ?? { total: 0, converted: 0 };
    const user = userMap.get(String(a.userId));
    return {
      agentId: String(a._id),
      name: user?.name ?? "Unknown",
      isActive: user?.isActive !== false,
      leads: leadsInfo.total,
      convertedLeads: leadsInfo.converted,
      placements: placementsMap.get(String(a._id)) ?? 0,
      conversionRate: leadsInfo.total > 0 ? Math.round((leadsInfo.converted / leadsInfo.total) * 100) : 0,
      commission: commissionsMap.get(String(a._id)) ?? 0,
    };
  }).sort((a, b) => b.placements - a.placements || b.commission - a.commission || b.leads - a.leads);

  // ── Monthly trends: last 6 months, plus the month before for the first change ──
  const now = new Date();
  const windowStart = new Date(now.getFullYear(), now.getMonth() - 6, 1);
  const byMonth = { y: { $year: "$createdAt" }, m: { $month: "$createdAt" } };

  const [leadsByMonth, placementsByMonth, commissionsByMonth] = await Promise.all([
    Lead.aggregate([
      { $match: { agentId: { $in: agentDocIds }, createdAt: { $gte: windowStart } } },
      { $group: { _id: byMonth, count: { $sum: 1 } } },
    ]),
    Placement.aggregate([
      { $match: { agentId: { $in: agentDocIds }, createdAt: { $gte: windowStart } } },
      { $group: { _id: byMonth, count: { $sum: 1 } } },
    ]),
    Commission.aggregate([
      { $match: { ...commissionScope, currency: inCurrency, createdAt: { $gte: windowStart } } },
      { $group: { _id: byMonth, total: { $sum: "$amount" } } },
    ]),
  ]);

  const mkKey = (r: { _id: { y: number; m: number } }) => monthKey(r._id.y, r._id.m);
  const leadsMonthMap = new Map(leadsByMonth.map((r) => [mkKey(r), r.count]));
  const placementsMonthMap = new Map(placementsByMonth.map((r) => [mkKey(r), r.count]));
  const commissionsMonthMap = new Map(commissionsByMonth.map((r) => [mkKey(r), r.total]));

  const monthlyTrends: { month: string; leads: number; placements: number; revenue: number; trend: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = monthKey(d.getFullYear(), d.getMonth() + 1);
    const leads = leadsMonthMap.get(key) ?? 0;

    // Change in new leads against the month before.
    const prevD = new Date(d.getFullYear(), d.getMonth() - 1, 1);
    const prevLeads = leadsMonthMap.get(monthKey(prevD.getFullYear(), prevD.getMonth() + 1)) ?? 0;
    const trend = prevLeads > 0 ? Math.round(((leads - prevLeads) / prevLeads) * 100) : leads > 0 ? 100 : 0;

    monthlyTrends.push({
      // "YYYY-MM"; the page names the month in the reader's language.
      month: key,
      leads,
      placements: placementsMonthMap.get(key) ?? 0,
      revenue: commissionsMonthMap.get(key) ?? 0,
      trend,
    });
  }

  return NextResponse.json({
    totalAgents,
    totalLeads,
    totalPlacements,
    totalCommissions: currencyTotals[0]?.total ?? 0,
    currency,
    otherCurrencies,
    agentBreakdown,
    monthlyTrends,
  });
}, { resource: "reports", action: "read" });
