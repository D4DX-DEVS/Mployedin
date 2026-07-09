/**
 * Commission Payout Batch API
 *
 * POST /api/commission-payouts           — Create a payout batch (admin only)
 * GET  /api/commission-payouts           — List payout batches
 * POST /api/commission-payouts/[id]/mark-paid — Mark batch as paid
 */

import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth, type AuthContext } from "@/lib/auth/withAuth";
import Commission from "@/models/Commission";
import { logActivity, actorFromCtx } from "@/lib/audit/log";

/**
 * POST — Create a payout batch from approved commissions.
 * Body: { userIds?: string[], periodStart?: string, periodEnd?: string }
 *
 * Finds all "approved" commissions in the period, groups by user,
 * marks them as "paid" with a batch reference, and returns the batch summary.
 */
async function postHandler(req: NextRequest, ctx: AuthContext) {
  if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();

  const body = (await req.json().catch(() => ({}))) as {
    userIds?: string[];
    periodStart?: string;
    periodEnd?: string;
    paymentRef?: string;
  };

  const query: Record<string, unknown> = { status: "approved" };

  // Optional period filter
  if (body.periodStart || body.periodEnd) {
    const dateFilter: Record<string, Date> = {};
    if (body.periodStart) dateFilter.$gte = new Date(body.periodStart);
    if (body.periodEnd) {
      const end = new Date(body.periodEnd);
      end.setHours(23, 59, 59, 999);
      dateFilter.$lte = end;
    }
    query.createdAt = dateFilter;
  }

  // Optional user filter
  if (body.userIds && body.userIds.length > 0) {
    query.$or = [
      { agentId: { $in: body.userIds } },
      { superAgentId: { $in: body.userIds } },
    ];
  }

  const commissions = await Commission.find(query).lean();

  if (commissions.length === 0) {
    return NextResponse.json(
      { error: "No approved commissions found for payout" },
      { status: 404 },
    );
  }

  const now = new Date();
  const batchRef =
    body.paymentRef ??
    `PAYOUT-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}-${Date.now().toString(36).toUpperCase()}`;

  // Mark all matching commissions as paid.
  // status guard makes this idempotent: a concurrent batch that already paid
  // a commission won't match it again, so no double payout.
  const ids = commissions.map((c) => c._id);
  const updateResult = await Commission.updateMany(
    // paidAt:null guards against ever re-paying a commission that already has a
    // payment recorded, independent of how it re-entered the "approved" state.
    { _id: { $in: ids }, status: "approved", paidAt: null },
    {
      $set: {
        status: "paid",
        paidAt: now,
        paymentRef: batchRef,
      },
    },
  );

  if ((updateResult.modifiedCount ?? 0) === 0) {
    return NextResponse.json(
      { error: "Commissions were already paid by another batch" },
      { status: 409 },
    );
  }

  // Summarize only what THIS batch actually paid — the pre-read list may
  // include commissions grabbed by a concurrent batch
  const paidCommissions = await Commission.find({ paymentRef: batchRef }).lean();

  // Build per-user summary
  const userSummary: Record<
    string,
    { userId: string; role: string; total: number; currency: string; count: number }
  > = {};

  for (const c of paidCommissions) {
    const uid = (c.agentId ?? c.superAgentId ?? "unknown").toString();
    const role = c.agentId ? "agent" : "super_agent";
    const key = `${uid}:${c.currency}`;
    if (!userSummary[key]) {
      userSummary[key] = { userId: uid, role, total: 0, currency: c.currency, count: 0 };
    }
    userSummary[key].total += c.amount;
    userSummary[key].count += 1;
  }

  await logActivity({
    ...actorFromCtx(ctx),
    action: "commission.payout_batch",
    resource: "commissions",
    meta: {
      batchRef,
      commissionCount: paidCommissions.length,
      totalAmount: paidCommissions.reduce((s, c) => s + c.amount, 0),
      periodStart: body.periodStart,
      periodEnd: body.periodEnd,
    },
    req,
  });

  return NextResponse.json({
    success: true,
    batchRef,
    commissionCount: paidCommissions.length,
    totalAmount: paidCommissions.reduce((s, c) => s + c.amount, 0),
    users: Object.values(userSummary),
  });
}

/**
 * GET — List payout batches (grouped by paymentRef).
 */
async function getHandler(req: NextRequest, ctx: AuthContext) {
  if (!["admin", "super_agent"].includes(ctx.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10) || 20));

  // Aggregate paid commissions grouped by paymentRef
  const batches = await Commission.aggregate([
    { $match: { status: "paid", paymentRef: { $exists: true, $ne: null } } },
    {
      $group: {
        _id: "$paymentRef",
        totalAmount: { $sum: "$amount" },
        commissionCount: { $sum: 1 },
        currencies: { $addToSet: "$currency" },
        paidAt: { $max: "$paidAt" },
        earliestCreated: { $min: "$createdAt" },
        latestCreated: { $max: "$createdAt" },
      },
    },
    { $sort: { paidAt: -1 } },
    { $skip: (page - 1) * limit },
    { $limit: limit },
  ]);

  const totalPipeline = await Commission.aggregate([
    { $match: { status: "paid", paymentRef: { $exists: true, $ne: null } } },
    { $group: { _id: "$paymentRef" } },
    { $count: "total" },
  ]);

  const total = totalPipeline[0]?.total ?? 0;

  return NextResponse.json({
    batches: batches.map((b) => ({
      batchRef: b._id,
      totalAmount: b.totalAmount,
      commissionCount: b.commissionCount,
      currencies: b.currencies,
      paidAt: b.paidAt,
      periodStart: b.earliestCreated,
      periodEnd: b.latestCreated,
    })),
    total,
    page,
    limit,
    pages: limit > 0 ? Math.ceil(total / limit) : 1,
  });
}

export const POST = withAuth(postHandler);
export const GET = withAuth(getHandler);
