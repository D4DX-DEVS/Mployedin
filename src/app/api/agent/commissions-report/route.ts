import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import Commission from "@/models/Commission";
import Agent from "@/models/Agent";

interface AuthCtx { userId: string; role: string; locale: string; }

/* ------------------------------------------------------------------ */
/*  GET  /api/agent/commissions-report                                 */
/*  Personal commission analytics for the logged-in agent:            */
/*  YTD totals, monthly breakdown, type breakdown                      */
/* ------------------------------------------------------------------ */
async function handler(req: NextRequest, ctx: AuthCtx) {
  await connectDB();

  const { searchParams } = new URL(req.url);
  const currentYear = new Date().getFullYear();
  const requestedYear = parseInt(searchParams.get("year") ?? String(currentYear));
  const year = Number.isFinite(requestedYear) ? requestedYear : currentYear;

  const dateFrom = new Date(year, 0, 1);
  const dateTo = new Date(year, 11, 31, 23, 59, 59, 999);

  // Resolve agent profile
  const agentDoc = await Agent.findOne({ userId: ctx.userId }).select("_id").lean();
  if (!agentDoc) return NextResponse.json({ error: "Agent profile not found" }, { status: 404 });
  const agentId = agentDoc._id;

  // ── Monthly trend ───────────────────────────────────────────────────
  const monthlyAgg = await Commission.aggregate([
    {
      $match: {
        agentId,
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

  const monthlyBreakdown = Array.from({ length: 12 }, (_, i) => {
    const month = i + 1;
    const rows = monthlyAgg.filter((r) => r._id.month === month);
    const byStatus = (s: string) => rows.find((r) => r._id.status === s)?.total ?? 0;
    return {
      month,
      total: rows.reduce((s, r) => s + (r.total ?? 0), 0),
      pending: byStatus("pending"),
      approved: byStatus("approved"),
      paid: byStatus("paid"),
    };
  });

  // ── YTD summary ─────────────────────────────────────────────────────
  const summaryAgg = await Commission.aggregate([
    {
      $match: {
        agentId,
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

  const byStatus = (s: string) => summaryAgg.find((r) => r._id === s)?.total ?? 0;
  const countByStatus = (s: string) => summaryAgg.find((r) => r._id === s)?.count ?? 0;

  const totalAmount = summaryAgg.reduce((s, r) => s + r.total, 0);
  const totalCount = summaryAgg.reduce((s, r) => s + r.count, 0);
  const pendingAmount = byStatus("pending");
  const approvedAmount = byStatus("approved");
  const paidAmount = byStatus("paid");

  // Estimated next payment = sum of approved (not yet paid)
  const estimatedNextPayment = approvedAmount;

  // ── Type breakdown ──────────────────────────────────────────────────
  const typeAgg = await Commission.aggregate([
    {
      $match: {
        agentId,
        createdAt: { $gte: dateFrom, $lte: dateTo },
      },
    },
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
    percent: totalAmount > 0 ? Math.round((t.amount / totalAmount) * 100) : 0,
  }));

  return NextResponse.json({
    year,
    yearToDate: {
      totalAmount,
      totalCount,
      pendingAmount,
      approvedAmount,
      paidAmount,
      pendingCount: countByStatus("pending"),
      approvedCount: countByStatus("approved"),
      paidCount: countByStatus("paid"),
      estimatedNextPayment,
      currency: "AED",
    },
    monthlyBreakdown,
    typeBreakdown,
  });
}

export const GET = withAuth(handler, { resource: "commissions", action: "read" });
