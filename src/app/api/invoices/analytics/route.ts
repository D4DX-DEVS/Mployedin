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

async function handler(req: NextRequest, ctx: AuthCtx) {
  await connectDB();

  const url = new URL(req.url);
  const period = url.searchParams.get("period") ?? "30d";

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

  if (ctx.role === "super_agent") {
    const sa = await SuperAgent.findOne({ userId: ctx.userId }).select("_id agentIds").lean();
    if (sa) {
      scopeFilter.$or = [
        { userId: ctx.userId },
        { agentId: { $in: sa.agentIds ?? [] } },
      ];
    } else {
      scopeFilter.userId = ctx.userId;
    }
  } else if (ctx.role === "agent") {
    const agentDoc = await Agent.findOne({ userId: ctx.userId }).select("_id").lean();
    if (agentDoc) {
      scopeFilter.$or = [
        { userId: ctx.userId },
        { agentId: agentDoc._id },
      ];
    } else {
      scopeFilter.userId = ctx.userId;
    }
  }
  // Admin: no scope filter (sees all)

  const dateFilter = { createdAt: { $gte: startDate } };
  const matchFilter = { ...scopeFilter, ...dateFilter };

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
    // Revenue breakdown by status
    Invoice.aggregate([
      { $match: matchFilter },
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

    // Monthly revenue trend (last 12 months)
    Invoice.aggregate([
      { $match: { ...scopeFilter, createdAt: { $gte: new Date(now.getFullYear() - 1, now.getMonth(), 1) } } },
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
      { $match: matchFilter },
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
      { $match: { ...scopeFilter, status: { $in: ["issued", "sent", "partially_paid", "overdue"] } } },
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

    // Commission summary
    Commission.aggregate([
      { $match: ctx.role === "admin" ? {} : scopeFilter },
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
          ...scopeFilter,
          status: { $in: ["issued", "sent", "partially_paid"] },
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
    if (["issued", "sent", "partially_paid", "overdue"].includes(row._id)) {
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

export const GET = withAuth(handler, { resource: "subscriptions", action: "read" });
