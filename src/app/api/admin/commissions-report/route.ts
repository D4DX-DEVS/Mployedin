import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import Commission from "@/models/Commission";
import Agent from "@/models/Agent";
import SuperAgent from "@/models/SuperAgent";
import User from "@/models/User";
import mongoose from "mongoose";

interface AuthCtx { userId: string; role: string; locale: string; }

/* ------------------------------------------------------------------ */
/*  GET  /api/admin/commissions-report                                 */
/*  Aggregated commission analytics for admin:                         */
/*  monthly trends, agent breakdown, type/status breakdown, quarters   */
/* ------------------------------------------------------------------ */
async function handler(req: NextRequest, _ctx: AuthCtx) {
  await connectDB();

  const { searchParams } = new URL(req.url);
  const currentYear = new Date().getFullYear();
  const requestedYear = parseInt(searchParams.get("year") ?? String(currentYear));
  const year = Number.isFinite(requestedYear) ? requestedYear : currentYear;

  const dateFrom = new Date(year, 0, 1);
  const dateTo = new Date(year, 11, 31, 23, 59, 59, 999);

  // ── Monthly trend: total / by-status per month ──────────────────────
  const monthlyAgg = await Commission.aggregate([
    { $match: { createdAt: { $gte: dateFrom, $lte: dateTo } } },
    {
      $group: {
        _id: { month: { $month: "$createdAt" }, status: "$status" },
        total: { $sum: "$amount" },
        count: { $sum: 1 },
      },
    },
  ]);

  const monthlyTrend = Array.from({ length: 12 }, (_, i) => {
    const month = i + 1;
    const rows = monthlyAgg.filter((r) => r._id.month === month);
    const byStatus = (s: string) => rows.find((r) => r._id.status === s)?.total ?? 0;
    return {
      month,
      total: rows.reduce((s, r) => s + (r.total ?? 0), 0),
      pending: byStatus("pending"),
      approved: byStatus("approved"),
      paid: byStatus("paid"),
      disputed: byStatus("disputed"),
      clawed_back: byStatus("clawed_back"),
      count: rows.reduce((s, r) => s + (r.count ?? 0), 0),
    };
  });

  // ── Quarterly breakdown ──────────────────────────────────────────────
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
      total: qMonths.reduce((s, m) => s + m.total, 0),
      approved: qMonths.reduce((s, m) => s + m.approved, 0),
      paid: qMonths.reduce((s, m) => s + m.paid, 0),
      count: qMonths.reduce((s, m) => s + m.count, 0),
    };
  });

  // ── Summary totals ──────────────────────────────────────────────────
  const totalCommissions = monthlyTrend.reduce((s, m) => s + m.total, 0);
  const totalPending = monthlyTrend.reduce((s, m) => s + m.pending, 0);
  const totalApproved = monthlyTrend.reduce((s, m) => s + m.approved, 0);
  const totalPaid = monthlyTrend.reduce((s, m) => s + m.paid, 0);
  const totalDisputed = monthlyTrend.reduce((s, m) => s + m.disputed, 0);
  const totalClawedBack = monthlyTrend.reduce((s, m) => s + m.clawed_back, 0);

  // Avg commission rate (weighted)
  const rateAgg = await Commission.aggregate([
    {
      $match: {
        createdAt: { $gte: dateFrom, $lte: dateTo },
        rate: { $exists: true, $ne: null },
      },
    },
    { $group: { _id: null, avgRate: { $avg: "$rate" }, count: { $sum: 1 } } },
  ]);
  const avgRate = rateAgg[0]?.avgRate ? Math.round(rateAgg[0].avgRate * 100) / 100 : 0;

  // ── Type breakdown ──────────────────────────────────────────────────
  const typeAgg = await Commission.aggregate([
    { $match: { createdAt: { $gte: dateFrom, $lte: dateTo } } },
    {
      $group: {
        _id: "$type",
        amount: { $sum: "$amount" },
        count: { $sum: 1 },
      },
    },
  ]);
  const typeBreakdown = typeAgg.map((t) => ({
    type: t._id as string,
    amount: t.amount as number,
    count: t.count as number,
    percent: totalCommissions > 0 ? Math.round((t.amount / totalCommissions) * 100) : 0,
  }));

  // ── Per-agent breakdown ─────────────────────────────────────────────
  const agentAgg = await Commission.aggregate([
    { $match: { createdAt: { $gte: dateFrom, $lte: dateTo } } },
    {
      $group: {
        _id: { agentId: "$agentId", status: "$status" },
        total: { $sum: "$amount" },
        count: { $sum: 1 },
        avgRate: { $avg: "$rate" },
      },
    },
  ]);

  // Collect unique agentIds
  const agentIds = [
    ...new Set(
      agentAgg
        .filter((r) => r._id.agentId)
        .map((r) => String(r._id.agentId))
    ),
  ];

  const agentDocs = await Agent.find({
    _id: { $in: agentIds.map((id) => new mongoose.Types.ObjectId(id)) },
  })
    .select("_id userId superAgentId")
    .lean();

  const agentUserIds = agentDocs.map((a) => a.userId);
  const superAgentDocIds = agentDocs
    .filter((a) => a.superAgentId)
    .map((a) => a.superAgentId as mongoose.Types.ObjectId);

  const [agentUsers, superAgentDocs] = await Promise.all([
    User.find({ _id: { $in: agentUserIds } }).select("_id name email").lean(),
    SuperAgent.find({ _id: { $in: superAgentDocIds } }).select("_id userId").lean(),
  ]);

  const saUserIds = superAgentDocs.map((sa) => sa.userId);
  const saUsers = await User.find({ _id: { $in: saUserIds } }).select("_id name").lean();

  const agentUserMap = new Map(agentUsers.map((u) => [String(u._id), u]));
  const saUserMap = new Map(saUsers.map((u) => [String(u._id), u]));
  const agentDocMap = new Map(agentDocs.map((a) => [String(a._id), a]));
  const superAgentDocMap = new Map(superAgentDocs.map((sa) => [String(sa._id), sa]));

  // Group agentAgg rows by agentId
  const agentMap = new Map<string, {
    agentId: string; agentName: string; agentEmail: string;
    superAgentId: string; superAgentName: string;
    total: number; pending: number; approved: number; paid: number;
    count: number; avgRate: number;
  }>();

  for (const row of agentAgg) {
    if (!row._id.agentId) continue;
    const agentDocId = String(row._id.agentId);
    const agentDoc = agentDocMap.get(agentDocId);
    if (!agentDoc) continue;

    const user = agentUserMap.get(String(agentDoc.userId));
    const saDoc = agentDoc.superAgentId ? superAgentDocMap.get(String(agentDoc.superAgentId)) : null;
    const saUser = saDoc ? saUserMap.get(String(saDoc.userId)) : null;

    if (!agentMap.has(agentDocId)) {
      agentMap.set(agentDocId, {
        agentId: agentDocId,
        agentName: user?.name ?? "Unknown",
        agentEmail: (user as { name?: string; email?: string } | undefined)?.email ?? "",
        superAgentId: agentDoc.superAgentId ? String(agentDoc.superAgentId) : "",
        superAgentName: saUser?.name ?? "",
        total: 0, pending: 0, approved: 0, paid: 0, count: 0, avgRate: row.avgRate ?? 0,
      });
    }

    const entry = agentMap.get(agentDocId)!;
    entry.total += row.total;
    entry.count += row.count;
    if (row._id.status === "pending") entry.pending += row.total;
    if (row._id.status === "approved") entry.approved += row.total;
    if (row._id.status === "paid") entry.paid += row.total;
  }

  const agentBreakdown = [...agentMap.values()].sort((a, b) => b.total - a.total);

  return NextResponse.json({
    year,
    summary: {
      totalCommissions,
      totalPending,
      totalApproved,
      totalPaid,
      totalDisputed,
      totalClawedBack,
      avgRate,
      currency: "AED",
    },
    monthlyTrend,
    quarterlyBreakdown,
    typeBreakdown,
    agentBreakdown,
  });
}

export const GET = withAuth(handler, { resource: "commissions", action: "read" });
