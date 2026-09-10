/**
 * GET /api/invoices/analytics — Revenue analytics & KPI aggregation.
 *
 * Admin: full platform analytics.
 * Super_agent: team analytics.
 * Agent: personal analytics.
 */

import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import connectDB from "@/lib/db/mongoose";
import Invoice from "@/models/Invoice";
import Commission from "@/models/Commission";
import Agent from "@/models/Agent";
import SuperAgent from "@/models/SuperAgent";
import type { UserRole } from "@/types/user";

interface AuthCtx { userId: string; role: UserRole; locale: string }

/**
 * Statuses that never represent earned revenue. Applied to every revenue
 * aggregation here — the KPI tiles already excluded them while the monthly
 * trend and category breakdown did not, so a voided invoice vanished from the
 * headline total but still inflated the chart underneath it.
 */
const NON_REVENUE_STATUSES = ["void", "cancelled", "refunded", "credit_note"];

/** Statuses whose outstanding balance counts as money still owed. */
const PENDING_STATUSES = ["issued", "sent", "partially_paid", "overdue"];

async function handler(req: NextRequest, ctx: AuthCtx) {
  await connectDB();

  const url = new URL(req.url);
  const period = url.searchParams.get("period") ?? "30d";
  const requestedCurrency = url.searchParams.get("currency");

  // Calculate date range
  const now = new Date();
  let startDate: Date;
  switch (period) {
    case "7d": startDate = new Date(now.getTime() - 7 * 86400000); break;
    case "30d": startDate = new Date(now.getTime() - 30 * 86400000); break;
    case "90d": startDate = new Date(now.getTime() - 90 * 86400000); break;
    case "1y": startDate = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate()); break;
    default: startDate = new Date(now.getTime() - 30 * 86400000);
  }

  // Build scope filter based on role
  const scopeFilter: Record<string, unknown> = {};
  // Commission is a different collection with different owner fields: it has no
  // `userId` at all, and its `agentId`/`superAgentId` are PROFILE ids. Reusing
  // the invoice scope against it silently matched nothing for a super-agent's
  // own override lines, so "Commission Due" read 0 while the ledger held
  // pending rows. Mirrors the scoping in /api/commissions.
  let commissionScope: Record<string, unknown> | null = null;

  if (ctx.role === "super_agent") {
    const sa = await SuperAgent.findOne({ userId: ctx.userId }).select("_id agentIds").lean();
    if (sa) {
      scopeFilter.$or = [
        { userId: ctx.userId },
        { agentId: { $in: sa.agentIds ?? [] } },
      ];
      commissionScope = { superAgentId: sa._id };
    } else {
      scopeFilter.userId = ctx.userId;
      commissionScope = { superAgentId: null };
    }
  } else if (ctx.role === "agent") {
    const agentDoc = await Agent.findOne({ userId: ctx.userId }).select("_id").lean();
    if (agentDoc) {
      scopeFilter.$or = [
        { userId: ctx.userId },
        { agentId: agentDoc._id },
      ];
      commissionScope = { agentId: agentDoc._id };
    } else {
      scopeFilter.userId = ctx.userId;
      commissionScope = { agentId: null };
    }
  } else if (ctx.role !== "admin") {
    // Employer / job_seeker / any non-privileged role — own invoices only.
    // The guard is invoices:read (employers hold it to view their own invoices),
    // so they REACH this handler. Without this branch they fell through to an
    // empty scopeFilter and received platform-wide totalRevenue, topEmployers
    // and agentCommissionPayable. Mirrors the ownership scope in the invoices
    // list route (invoices/route.ts) using Invoice.userId (the customer ref).
    scopeFilter.userId = ctx.userId;
    // Employers and job seekers never earn commission — fail closed.
    commissionScope = { _id: null };
  }
  // Admin: no scope filter (sees all)

  // Invoices are raised in the currency the customer is billed in and nothing
  // converts between them, so summing totalAmount across currencies produces a
  // number that is in no currency at all — which the pages then labelled with
  // the viewer's display-currency preference ("INR 25,322" over AED rows).
  // Analytics is therefore scoped to ONE currency: the caller picks it, or we
  // default to whichever currency carries the most invoices in scope.
  const currencyRows = await Invoice.aggregate([
    { $match: { ...scopeFilter, status: { $nin: NON_REVENUE_STATUSES } } },
    { $group: { _id: { $ifNull: ["$currency", "AED"] }, total: { $sum: "$totalAmount" }, count: { $sum: 1 } } },
    { $sort: { total: -1, count: -1 } },
  ]);
  const currencies: string[] = currencyRows.map((row: { _id: string }) => String(row._id));
  const currency = requestedCurrency && currencies.includes(requestedCurrency)
    ? requestedCurrency
    : currencies[0] ?? "AED";
  // Older invoices predate the currency field; treat a missing value as the
  // default so they are not silently dropped from their own currency's totals.
  // Expressed with $in rather than $or on purpose — the super-agent scope
  // filter already owns the top-level $or, and spreading a second one over it
  // would replace the team scope with a currency clause and leak other teams'
  // invoices into the totals.
  const currencyFilter: Record<string, unknown> = {
    currency: currency === "AED" ? { $in: [currency, null] } : currency,
  };

  const dateFilter = { createdAt: { $gte: startDate } };
  const scopedFilter = { ...scopeFilter, ...currencyFilter };
  const matchFilter = { ...scopedFilter, ...dateFilter };

  // Run all aggregations in parallel
  const [
    revenueByStatus,
    revenueByMonth,
    revenueByCategory,
    topEmployers,
    invoiceAging,
    commissionSummary,
    overdueSummary,
  ] = await Promise.all([
    // Revenue breakdown by status — feeds the headline KPI tiles, so it is
    // all-time (scope only). Period-scoping this while the overdue tile was
    // all-time made "Total Revenue: 0" sit next to "Overdue: 3,150".
    // Exclude terminal statuses from revenue calculation
    Invoice.aggregate([
      { $match: { ...scopedFilter, status: { $nin: NON_REVENUE_STATUSES } } },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
          totalAmount: { $sum: "$totalAmount" },
          paidAmount: { $sum: "$paidAmount" },
          balanceDue: { $sum: "$balanceDue" },
          taxAmount: { $sum: "$taxAmount" },
          refundedAmount: { $sum: "$refundedAmount" },
        },
      },
    ]),

    // Monthly revenue trend (last 12 months). The void exclusion here is not
    // optional decoration: without it a voided invoice was excluded from the
    // KPI tile directly above this chart and still drawn inside it.
    Invoice.aggregate([
      {
        $match: {
          ...scopedFilter,
          status: { $nin: NON_REVENUE_STATUSES },
          createdAt: { $gte: new Date(now.getFullYear() - 1, now.getMonth(), 1) },
        },
      },
      {
        $group: {
          _id: { year: { $year: "$createdAt" }, month: { $month: "$createdAt" } },
          invoiceCount: { $sum: 1 },
          totalRevenue: { $sum: "$totalAmount" },
          paidRevenue: { $sum: "$paidAmount" },
          taxCollected: { $sum: "$taxAmount" },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } },
    ]),

    // Revenue by category
    Invoice.aggregate([
      { $match: { ...matchFilter, status: { $nin: NON_REVENUE_STATUSES } } },
      {
        $group: {
          _id: "$category",
          count: { $sum: 1 },
          totalAmount: { $sum: "$totalAmount" },
          paidAmount: { $sum: "$paidAmount" },
        },
      },
    ]),

    // Top paying employers
    Invoice.aggregate([
      { $match: { ...matchFilter, status: { $in: ["paid", "partially_paid"] } } },
      {
        $group: {
          _id: "$employerId",
          invoiceCount: { $sum: 1 },
          totalPaid: { $sum: "$paidAmount" },
        },
      },
      { $sort: { totalPaid: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: "employers",
          localField: "_id",
          foreignField: "_id",
          as: "employer",
          pipeline: [{ $project: { companyName: 1 } }],
        },
      },
      { $unwind: { path: "$employer", preserveNullAndEmptyArrays: true } },
    ]),

    // Invoice aging analysis
    Invoice.aggregate([
      { $match: { ...scopedFilter, status: { $in: PENDING_STATUSES } } },
      {
        $project: {
          totalAmount: 1,
          balanceDue: 1,
          daysSinceIssued: {
            $dateDiff: { startDate: "$issuedAt", endDate: new Date(), unit: "day" },
          },
        },
      },
      {
        $bucket: {
          groupBy: "$daysSinceIssued",
          boundaries: [0, 30, 60, 90, 120, 365],
          default: "365+",
          output: {
            count: { $sum: 1 },
            totalBalance: { $sum: "$balanceDue" },
          },
        },
      },
    ]),

    // Commission summary — same currency scope as the revenue tiles beside it.
    Commission.aggregate([
      { $match: { ...(ctx.role === "admin" ? {} : commissionScope ?? {}), ...currencyFilter } },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
          totalAmount: { $sum: "$amount" },
        },
      },
    ]),

    // Overdue invoices total
    Invoice.aggregate([
      {
        $match: {
          ...scopedFilter,
          // Include the literal "overdue" status — invoices flagged by the
          // overdue cron were invisible to this tile.
          status: { $in: PENDING_STATUSES },
          dueDate: { $lt: new Date() },
        },
      },
      {
        $group: {
          _id: null,
          count: { $sum: 1 },
          totalOverdue: { $sum: "$balanceDue" },
        },
      },
    ]),
  ]);

  // Build KPI summary
  const kpi = {
    totalRevenue: 0,
    paidRevenue: 0,
    pendingRevenue: 0,
    overdueRevenue: overdueSummary[0]?.totalOverdue ?? 0,
    overdueCount: overdueSummary[0]?.count ?? 0,
    taxCollected: 0,
    refunds: 0,
    totalInvoices: 0,
    agentCommissionPayable: 0,
    superAgentCommissionPayable: 0,
  };

  for (const row of revenueByStatus) {
    kpi.totalRevenue += row.totalAmount;
    kpi.paidRevenue += row.paidAmount;
    kpi.taxCollected += row.taxAmount;
    kpi.refunds += row.refundedAmount;
    kpi.totalInvoices += row.count;
    if (PENDING_STATUSES.includes(row._id)) {
      kpi.pendingRevenue += row.balanceDue;
    }
  }

  for (const row of commissionSummary) {
    if (row._id === "pending" || row._id === "approved") {
      kpi.agentCommissionPayable += row.totalAmount;
    }
  }

  // Monthly growth calculation
  const months = revenueByMonth.map((m: { _id: { year: number; month: number }; totalRevenue: number; paidRevenue: number; taxCollected: number; invoiceCount: number }) => ({
    label: `${m._id.year}-${String(m._id.month).padStart(2, "0")}`,
    revenue: m.totalRevenue,
    paid: m.paidRevenue,
    tax: m.taxCollected,
    count: m.invoiceCount,
  }));

  let monthlyGrowth = 0;
  if (months.length >= 2) {
    const current = months[months.length - 1].revenue;
    const previous = months[months.length - 2].revenue;
    if (previous > 0) {
      monthlyGrowth = Math.round(((current - previous) / previous) * 100 * 100) / 100;
    }
  }

  return NextResponse.json({
    /** The currency every figure below is actually denominated in. */
    currency,
    /** Every currency this viewer has invoices in, largest first. */
    currencies,
    kpi: { ...kpi, monthlyGrowth },
    revenueByStatus,
    revenueByMonth: months,
    revenueByCategory,
    topEmployers: topEmployers.map((e: { _id: unknown; employer?: { companyName?: string }; invoiceCount: number; totalPaid: number }) => ({
      employerId: e._id,
      companyName: e.employer?.companyName ?? "Unknown",
      invoiceCount: e.invoiceCount,
      totalPaid: e.totalPaid,
    })),
    invoiceAging,
    commissionSummary: commissionSummary.reduce((acc: Record<string, { count: number; amount: number }>, row: { _id: string; count: number; totalAmount: number }) => {
      acc[row._id] = { count: row.count, amount: row.totalAmount };
      return acc;
    }, {}),
  });
}

export const GET = withAuth(handler, { resource: "invoices", action: "read" });
