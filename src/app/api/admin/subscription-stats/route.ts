/**
 * GET /api/admin/subscription-stats — Aggregated subscription statistics
 *
 * Returns overview KPIs: active/expired/cancelled counts, tier distribution,
 * expiring-soon list, recent revenue, monthly trend.
 *
 * Admin/super_agent only.
 */

import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import connectDB from "@/lib/db/mongoose";
import Subscription from "@/models/Subscription";
import Invoice from "@/models/Invoice";
import SubscriptionHistory from "@/models/SubscriptionHistory";
import type { UserRole } from "@/types/user";

interface AuthCtx { userId: string; role: UserRole; locale: string }

async function handler(_req: NextRequest, ctx: AuthCtx) {
  if (!["admin", "super_agent"].includes(ctx.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();

  const now = new Date();
  const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  // Run aggregations in parallel
  const [
    statusCounts,
    tierDistribution,
    roleCounts,
    expiringSoon,
    revenueStats,
    recentActivity,
    monthlyTrend,
    mrrStats,
  ] = await Promise.all([
    // 1. Count by status
    Subscription.aggregate([
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),

    // 2. Active subs by tier (plan snapshot)
    Subscription.aggregate([
      { $match: { status: "active" } },
      {
        $group: {
          _id: {
            tier: "$planSnapshot.tier",
            name: "$planSnapshot.name",
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.tier": 1 } },
    ]),

    // 3. Active subs by role
    Subscription.aggregate([
      { $match: { status: "active" } },
      { $group: { _id: "$targetRole", count: { $sum: 1 } } },
    ]),

    // 4. Expiring within 30 days
    Subscription.find({
      status: "active",
      endDate: { $gte: now, $lte: in30Days },
    })
      .sort({ endDate: 1 })
      .limit(20)
      .populate("userId", "name email")
      .lean(),

    // 5. Revenue — sum of paid invoices this month + all time
    Invoice.aggregate([
      { $match: { status: "paid" } },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: "$amount" },
          thisMonthRevenue: {
            $sum: {
              $cond: [
                {
                  $gte: [
                    "$paidAt",
                    new Date(now.getFullYear(), now.getMonth(), 1),
                  ],
                },
                "$amount",
                0,
              ],
            },
          },
          count: { $sum: 1 },
        },
      },
    ]),

    // 6. Recent activity (last 20 history entries)
    SubscriptionHistory.find()
      .sort({ createdAt: -1 })
      .limit(20)
      .populate("userId", "name email")
      .populate("performedBy", "name")
      .lean(),

    // 7. Monthly subscription trend (last 6 months)
    Subscription.aggregate([
      {
        $group: {
          _id: {
            year: { $year: "$startDate" },
            month: { $month: "$startDate" },
          },
          newSubs: { $sum: 1 },
        },
      },
      { $sort: { "_id.year": -1, "_id.month": -1 } },
      { $limit: 6 },
    ]),

    // 8. MRR — normalize each active paid subscription's price to a monthly value
    //    (monthly ÷1, quarterly ÷3, yearly ÷12). Recognised recurring revenue,
    //    independent of invoice payment timing.
    Subscription.aggregate([
      { $match: { status: "active", "planSnapshot.price": { $gt: 0 } } },
      {
        $group: {
          _id: null,
          mrr: {
            $sum: {
              $divide: [
                { $ifNull: ["$planSnapshot.price", 0] },
                {
                  $switch: {
                    branches: [
                      { case: { $eq: ["$planSnapshot.billingCycle", "yearly"] }, then: 12 },
                      { case: { $eq: ["$planSnapshot.billingCycle", "quarterly"] }, then: 3 },
                    ],
                    default: 1,
                  },
                },
              ],
            },
          },
          paidActiveCount: { $sum: 1 },
        },
      },
    ]),
  ]);

  // Format status counts into a map
  const statusMap: Record<string, number> = {};
  for (const s of statusCounts) {
    statusMap[s._id] = s.count;
  }

  // Format role counts
  const roleMap: Record<string, number> = {};
  for (const r of roleCounts) {
    roleMap[r._id] = r.count;
  }

  // Format revenue
  const revenue = revenueStats[0] ?? {
    totalRevenue: 0,
    thisMonthRevenue: 0,
    count: 0,
  };

  const mrr = Math.round((mrrStats[0]?.mrr ?? 0) * 100) / 100;
  const arr = Math.round(mrr * 12 * 100) / 100;
  const paidActiveCount = mrrStats[0]?.paidActiveCount ?? 0;

  return NextResponse.json({
    overview: {
      total: Object.values(statusMap).reduce((a, b) => a + b, 0),
      active: statusMap.active ?? 0,
      expired: statusMap.expired ?? 0,
      cancelled: statusMap.cancelled ?? 0,
      suspended: statusMap.suspended ?? 0,
    },
    byRole: roleMap,
    tierDistribution: tierDistribution.map((t) => ({
      tier: t._id.tier,
      planName: t._id.name,
      count: t.count,
    })),
    expiringSoon: expiringSoon.map((s) => ({
      _id: s._id,
      userId: s.userId,
      planName: s.planSnapshot?.name,
      endDate: s.endDate,
      autoRenew: s.autoRenew,
      targetRole: s.targetRole,
    })),
    revenue: {
      totalRevenue: revenue.totalRevenue,
      thisMonthRevenue: revenue.thisMonthRevenue,
      paidInvoiceCount: revenue.count,
      mrr,
      arr,
      paidActiveCount,
    },
    recentActivity: recentActivity.map((h) => ({
      _id: h._id,
      userId: h.userId,
      action: h.action,
      toPlanName: h.toPlanName,
      fromPlanName: h.fromPlanName,
      performedBy: h.performedBy,
      reason: h.reason,
      createdAt: h.createdAt,
    })),
    monthlyTrend: monthlyTrend.reverse().map((m) => ({
      year: m._id.year,
      month: m._id.month,
      newSubs: m.newSubs,
    })),
  });
}

export const GET = withAuth(handler, { resource: "subscriptions", action: "read" });
