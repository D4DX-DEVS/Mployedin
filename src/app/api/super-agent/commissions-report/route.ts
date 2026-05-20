import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import Commission from "@/models/Commission";
import Agent from "@/models/Agent";
import SuperAgent from "@/models/SuperAgent";
import User from "@/models/User";
import { getSuperAgentScope } from "@/lib/auth/agentRestrictions";
import mongoose from "mongoose";

interface AuthCtx { userId: string; role: string; locale: string; }

/* ------------------------------------------------------------------ */
/*  GET  /api/super-agent/commissions-report                           */
/*  Commission analytics for the logged-in super-agent:               */
/*  own override commissions + team agent commissions                  */
/* ------------------------------------------------------------------ */
async function handler(req: NextRequest, ctx: AuthCtx) {
  await connectDB();

  const { searchParams } = new URL(req.url);
  const currentYear = new Date().getFullYear();
  const requestedYear = parseInt(searchParams.get("year") ?? String(currentYear));
  const year = Number.isFinite(requestedYear) ? requestedYear : currentYear;

  const dateFrom = new Date(year, 0, 1);
  const dateTo = new Date(year, 11, 31, 23, 59, 59, 999);

  // Resolve super-agent profile — also fetch agentIds as a fallback for scope resolution
  const saDoc = await SuperAgent.findOne({ userId: ctx.userId }).select("_id agentIds").lean();
  if (!saDoc) return NextResponse.json({ error: "Super-agent profile not found" }, { status: 404 });
  const saProfileId = saDoc._id;

  // Resolve team agent scope.
  // getSuperAgentScope performs a second SuperAgent lookup; in the unlikely event it returns
  // null (e.g. a race between the two reads), fall back to the agentIds we already fetched.
  const scope = await getSuperAgentScope(ctx.userId);
  const effectiveAgentIds: mongoose.Types.ObjectId[] =
    scope?.effectiveAgentIds ?? (saDoc.agentIds as mongoose.Types.ObjectId[]) ?? [];

  const teamAgentDocs = effectiveAgentIds.length > 0
    ? await Agent.find({ _id: { $in: effectiveAgentIds } })
        .select("_id userId")
        .lean()
    : [];
  const teamAgentIds = teamAgentDocs.map((a) => a._id);

  // ── Own override commissions (monthly) ──────────────────────────────
  const overrideMonthlyAgg = await Commission.aggregate([
    {
      $match: {
        superAgentId: saProfileId,
        createdAt: { $gte: dateFrom, $lte: dateTo },
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

  // ── Team agent commissions (monthly) ────────────────────────────────
  const teamMonthlyAgg = teamAgentIds.length > 0
    ? await Commission.aggregate([
        {
          $match: {
            agentId: { $in: teamAgentIds },
            createdAt: { $gte: dateFrom, $lte: dateTo },
          },
        },
        {
          $group: {
            _id: { month: { $month: "$createdAt" }, status: "$status" },
            total: { $sum: "$amount" },
            count: { $sum: 1 },
          },
        },
      ])
    : [];

  // Build monthly trend merging both
  const monthlyTrend = Array.from({ length: 12 }, (_, i) => {
    const month = i + 1;
    const ownRows = overrideMonthlyAgg.filter((r) => r._id.month === month);
    const teamRows = teamMonthlyAgg.filter((r) => r._id.month === month);

    const sumByStatus = (rows: typeof ownRows, s: string) =>
      rows.find((r) => r._id.status === s)?.total ?? 0;

    return {
      month,
      overrideTotal: ownRows.reduce((s, r) => s + (r.total ?? 0), 0),
      overridePending: sumByStatus(ownRows, "pending"),
      overrideApproved: sumByStatus(ownRows, "approved"),
      overridePaid: sumByStatus(ownRows, "paid"),
      teamTotal: teamRows.reduce((s, r) => s + (r.total ?? 0), 0),
      teamApproved:
        sumByStatus(teamRows, "approved") + sumByStatus(teamRows, "paid"),
    };
  });

  // ── Summary ─────────────────────────────────────────────────────────
  const overrideSummaryAgg = await Commission.aggregate([
    {
      $match: {
        superAgentId: saProfileId,
        createdAt: { $gte: dateFrom, $lte: dateTo },
      },
    },
    {
      $group: {
        _id: "$status",
        total: { $sum: "$amount" },
        count: { $sum: 1 },
      },
    },
  ]);

  const oByStatus = (s: string) =>
    overrideSummaryAgg.find((r) => r._id === s)?.total ?? 0;

  const overviewSummary = {
    overrideTotal: overrideSummaryAgg.reduce((s, r) => s + r.total, 0),
    overridePending: oByStatus("pending"),
    overrideApproved: oByStatus("approved"),
    overridePaid: oByStatus("paid"),
  };

  // ── Per-agent breakdown ──────────────────────────────────────────────
  const agentBreakdownAgg =
    teamAgentIds.length > 0
      ? await Commission.aggregate([
          {
            $match: {
              agentId: { $in: teamAgentIds },
              createdAt: { $gte: dateFrom, $lte: dateTo },
            },
          },
          {
            $group: {
              _id: { agentId: "$agentId", status: "$status" },
              total: { $sum: "$amount" },
              count: { $sum: 1 },
            },
          },
        ])
      : [];

  // Resolve agent names
  const teamUserIds = teamAgentDocs.map((a) => a.userId);
  const teamUsers = await User.find({ _id: { $in: teamUserIds } })
    .select("_id name email")
    .lean();
  const teamUserMap = new Map(teamUsers.map((u) => [String(u._id), u]));
  const agentDocMap = new Map(teamAgentDocs.map((a) => [String(a._id), a]));

  type AgentEntry = {
    agentId: string; agentName: string; agentEmail: string;
    total: number; pending: number; approved: number; paid: number; count: number;
  };
  const agentMap = new Map<string, AgentEntry>();

  for (const row of agentBreakdownAgg) {
    if (!row._id.agentId) continue;
    const id = String(row._id.agentId);
    const agentDoc = agentDocMap.get(id);
    if (!agentDoc) continue;
    const user = teamUserMap.get(String(agentDoc.userId));

    if (!agentMap.has(id)) {
      agentMap.set(id, {
        agentId: id,
        agentName: user?.name ?? "Unknown",
        agentEmail: (user as { name?: string; email?: string } | undefined)?.email ?? "",
        total: 0, pending: 0, approved: 0, paid: 0, count: 0,
      });
    }
    const entry = agentMap.get(id)!;
    entry.total += row.total;
    entry.count += row.count;
    if (row._id.status === "pending") entry.pending += row.total;
    if (row._id.status === "approved") entry.approved += row.total;
    if (row._id.status === "paid") entry.paid += row.total;
  }

  const agentBreakdown = [...agentMap.values()].sort((a, b) => b.total - a.total);

  const teamTotal = agentBreakdown.reduce((s, a) => s + a.total, 0);

  return NextResponse.json({
    year,
    overviewSummary: {
      ...overviewSummary,
      teamTotal,
      grandTotal: overviewSummary.overrideTotal + teamTotal,
      currency: "AED",
    },
    monthlyTrend,
    agentBreakdown,
  });
}

export const GET = withAuth(handler, { resource: "commissions", action: "read" });
