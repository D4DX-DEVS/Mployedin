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

  // ── Own override commissions (monthly, grouped by currency) ──────────────────────────────
  const overrideMonthlyAgg = await Commission.aggregate([
    {
      $match: {
        superAgentId: saProfileId,
        createdAt: { $gte: dateFrom, $lte: dateTo },
      },
    },
    {
      $group: {
        _id: { month: { $month: "$createdAt" }, status: "$status", currency: "$currency" },
        total: { $sum: "$amount" },
        count: { $sum: 1 },
      },
    },
  ]);

  // ── Team agent commissions (monthly, grouped by currency) ────────────────────────────────
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
            _id: { month: { $month: "$createdAt" }, status: "$status", currency: "$currency" },
            total: { $sum: "$amount" },
            count: { $sum: 1 },
          },
        },
      ])
    : [];

  // ── Summary (grouped by currency) ─────────────────────────────────────────────────────────
  const overrideSummaryAgg = await Commission.aggregate([
    {
      $match: {
        superAgentId: saProfileId,
        createdAt: { $gte: dateFrom, $lte: dateTo },
      },
    },
    {
      $group: {
        _id: { status: "$status", currency: "$currency" },
        total: { $sum: "$amount" },
        count: { $sum: 1 },
      },
    },
  ]);

  // ── Per-agent breakdown (grouped by currency) ──────────────────────────────────────────────
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
              _id: { agentId: "$agentId", status: "$status", currency: "$currency" },
              total: { $sum: "$amount" },
              count: { $sum: 1 },
            },
          },
        ])
      : [];

  // Build per-currency override summary (we'll use this to determine dominant currency)
  interface CurrencySummary {
    currency: string;
    overrideTotal: number;
    overridePending: number;
    overrideApproved: number;
    overridePaid: number;
  }
  const overrideByCurrency = new Map<string, CurrencySummary>();

  for (const row of overrideSummaryAgg) {
    const currency = row._id.currency ?? "AED";
    if (!overrideByCurrency.has(currency)) {
      overrideByCurrency.set(currency, {
        currency,
        overrideTotal: 0,
        overridePending: 0,
        overrideApproved: 0,
        overridePaid: 0,
      });
    }
    const summary = overrideByCurrency.get(currency)!;
    summary.overrideTotal += row.total;
    if (row._id.status === "pending") summary.overridePending += row.total;
    if (row._id.status === "approved") summary.overrideApproved += row.total;
    if (row._id.status === "paid") summary.overridePaid += row.total;
  }

  // Build per-currency team summary
  interface TeamCurrencySummary {
    currency: string;
    teamTotal: number;
    teamPending: number;
    teamApproved: number;
    teamPaid: number;
  }
  const teamByCurrency = new Map<string, TeamCurrencySummary>();

  for (const row of agentBreakdownAgg) {
    const currency = row._id.currency ?? "AED";
    if (!teamByCurrency.has(currency)) {
      teamByCurrency.set(currency, {
        currency,
        teamTotal: 0,
        teamPending: 0,
        teamApproved: 0,
        teamPaid: 0,
      });
    }
    const summary = teamByCurrency.get(currency)!;
    summary.teamTotal += row.total;
    if (row._id.status === "pending") summary.teamPending += row.total;
    if (row._id.status === "approved") summary.teamApproved += row.total;
    if (row._id.status === "paid") summary.teamPaid += row.total;
  }

  // Determine dominant currency (highest grand total)
  const currencySummaries: Array<{
    currency: string;
    overrideTotal: number;
    teamTotal: number;
    grandTotal: number;
    overridePending: number;
    overrideApproved: number;
    overridePaid: number;
    teamApproved: number;
  }> = [];

  const allCurrencies = new Set([
    ...overrideByCurrency.keys(),
    ...teamByCurrency.keys(),
  ]);

  for (const currency of allCurrencies) {
    const override = overrideByCurrency.get(currency) ?? {
      currency,
      overrideTotal: 0,
      overridePending: 0,
      overrideApproved: 0,
      overridePaid: 0,
    };
    const team = teamByCurrency.get(currency) ?? {
      currency,
      teamTotal: 0,
      teamPending: 0,
      teamApproved: 0,
      teamPaid: 0,
    };
    const grandTotal = override.overrideTotal + team.teamTotal;

    currencySummaries.push({
      currency,
      overrideTotal: override.overrideTotal,
      overridePending: override.overridePending,
      overrideApproved: override.overrideApproved,
      overridePaid: override.overridePaid,
      teamTotal: team.teamTotal,
      teamApproved: team.teamApproved + team.teamPaid,
      grandTotal,
    });
  }

  // Sort by grandTotal descending and pick the first (dominant currency)
  currencySummaries.sort((a, b) => b.grandTotal - a.grandTotal);
  const dominantCurrencySummary =
    currencySummaries[0] ?? {
      currency: "AED",
      overrideTotal: 0,
      overridePending: 0,
      overrideApproved: 0,
      overridePaid: 0,
      teamTotal: 0,
      teamApproved: 0,
      grandTotal: 0,
    };

  // Build monthly trend using dominant currency only
  const monthlyTrend = Array.from({ length: 12 }, (_, i) => {
    const month = i + 1;
    const ownRows = overrideMonthlyAgg.filter(
      (r) =>
        r._id.month === month &&
        (r._id.currency ?? "AED") === dominantCurrencySummary.currency
    );
    const teamRows = teamMonthlyAgg.filter(
      (r) =>
        r._id.month === month &&
        (r._id.currency ?? "AED") === dominantCurrencySummary.currency
    );

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

  const overviewSummary = {
    overrideTotal: dominantCurrencySummary.overrideTotal,
    overridePending: dominantCurrencySummary.overridePending,
    overrideApproved: dominantCurrencySummary.overrideApproved,
    overridePaid: dominantCurrencySummary.overridePaid,
  };

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
    // Only include rows from the dominant currency
    if ((row._id.currency ?? "AED") !== dominantCurrencySummary.currency) continue;

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

  return NextResponse.json({
    year,
    overviewSummary: {
      ...overviewSummary,
      teamTotal: dominantCurrencySummary.teamTotal,
      grandTotal: dominantCurrencySummary.grandTotal,
      currency: dominantCurrencySummary.currency,
    },
    monthlyTrend,
    agentBreakdown,
    byCurrency: currencySummaries.map((cs) => ({
      currency: cs.currency,
      overrideTotal: cs.overrideTotal,
      teamTotal: cs.teamTotal,
      grandTotal: cs.grandTotal,
    })),
  });
}

export const GET = withAuth(handler, { resource: "commissions", action: "read" });
