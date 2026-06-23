/**
 * GET /api/admin/subscription-dashboard — Enhanced subscription dashboard data
 *
 * Returns all KPIs, comparisons, funnel, top customers/agents,
 * renewal forecast, invoice health, revenue by country, and trends.
 *
 * Admin/super_agent only.
 */

import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import connectDB from "@/lib/db/mongoose";
import Subscription from "@/models/Subscription";
import Invoice from "@/models/Invoice";
import SubscriptionHistory from "@/models/SubscriptionHistory";
import User from "@/models/User";
import type { UserRole } from "@/types/user";

interface AuthCtx { userId: string; role: UserRole; locale: string }

// ── Helpers ──────────────────────────────────────────────────────────────────

function startOfMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function startOfPreviousMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth() - 1, 1);
}

function endOfPreviousMonth(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), 0, 23, 59, 59, 999);
}

function pct(a: number, b: number) {
  if (b === 0) return a > 0 ? 100 : 0;
  return Math.round(((a - b) / b) * 1000) / 10;
}

const MONTH_NAMES = [
  "", "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// Country code normalization map
const COUNTRY_NORMALIZE: Record<string, string> = {
  AE: "UAE", ae: "UAE", "United Arab Emirates": "UAE", UAE: "UAE", uae: "UAE",
  IN: "India", in: "India", India: "India",
  SA: "Saudi Arabia", sa: "Saudi Arabia", "Saudi Arabia": "Saudi Arabia",
  QA: "Qatar", qa: "Qatar", Qatar: "Qatar",
  KW: "Kuwait", kw: "Kuwait", Kuwait: "Kuwait",
  BH: "Bahrain", bh: "Bahrain", Bahrain: "Bahrain",
  OM: "Oman", om: "Oman", Oman: "Oman",
  EG: "Egypt", eg: "Egypt", Egypt: "Egypt",
  PK: "Pakistan", pk: "Pakistan", Pakistan: "Pakistan",
  US: "United States", us: "United States", "United States": "United States",
  GB: "United Kingdom", gb: "United Kingdom", UK: "United Kingdom",
};

function normalizeCountry(raw: string): string | null {
  if (!raw || raw === "Unknown" || raw === "unknown" || raw === "") return null;
  return COUNTRY_NORMALIZE[raw] || raw;
}

// MRR normalization pipeline expression
const MRR_EXPR = {
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
};

// ── Handler ──────────────────────────────────────────────────────────────────

async function handler(_req: NextRequest, ctx: AuthCtx) {
  if (!["admin", "super_agent"].includes(ctx.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();

  const now = new Date();
  const som = startOfMonth(now);
  const sopm = startOfPreviousMonth(now);
  const eopm = endOfPreviousMonth(now);
  const in7 = new Date(now.getTime() + 7 * 864e5);
  const in15 = new Date(now.getTime() + 15 * 864e5);
  const in30 = new Date(now.getTime() + 30 * 864e5);

  // ── Run all aggregations in parallel ─────────────────────────────────────

  const [
    statusCounts,
    roleCounts,
    mrrStats,
    cancelledThisMonth,
    prevMonthOverview,
    prevMrr,
    tierDistribution,
    revenueTrend,
    funnelEmployer,
    funnelJobSeeker,
    topCustomers,
    topAgents,
    renewalBuckets,
    recentActivity,
    invoiceHealth,
    countryRevenue,
    revenueActions,
    newRevenueData,
    expansionRevenueData,
    churnedRevenueData,
    planPerformance,
    alertsData,
    conversionFunnel,
  ] = await Promise.all([
    // 1 — status counts
    Subscription.aggregate([
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),

    // 2 — active by role
    Subscription.aggregate([
      { $match: { status: "active" } },
      { $group: { _id: "$targetRole", count: { $sum: 1 } } },
    ]),

    // 3 — MRR (normalised)
    Subscription.aggregate([
      { $match: { status: "active", "planSnapshot.price": { $gt: 0 } } },
      {
        $group: {
          _id: null,
          mrr: { $sum: MRR_EXPR },
          paidActiveCount: { $sum: 1 },
        },
      },
    ]),

    // 4 — cancelled this month
    Subscription.countDocuments({
      status: "cancelled",
      cancelledAt: { $gte: som },
    }),

    // 5 — previous month overview (active subs at end of prev month)
    Subscription.aggregate([
      {
        $match: {
          startDate: { $lte: eopm },
          $or: [
            { status: "active" },
            { status: "cancelled", cancelledAt: { $gt: eopm } },
            { status: "expired", endDate: { $gt: eopm } },
          ],
        },
      },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),

    // 6 — previous month MRR
    Subscription.aggregate([
      {
        $match: {
          "planSnapshot.price": { $gt: 0 },
          startDate: { $lte: eopm },
          $or: [
            { status: "active" },
            { status: "cancelled", cancelledAt: { $gt: eopm } },
            { status: "expired", endDate: { $gt: eopm } },
          ],
        },
      },
      { $group: { _id: null, mrr: { $sum: MRR_EXPR } } },
    ]),

    // 7 — tier distribution (with revenue)
    Subscription.aggregate([
      { $match: { status: "active" } },
      {
        $group: {
          _id: { tier: "$planSnapshot.tier", name: "$planSnapshot.name" },
          count: { $sum: 1 },
          revenue: { $sum: MRR_EXPR },
        },
      },
      { $sort: { "_id.tier": -1 } },
    ]),

    // 8 — revenue trend (last 6 months) with employer/jobseeker split
    Subscription.aggregate([
      {
        $match: {
          status: { $in: ["active", "expired", "cancelled"] },
          startDate: { $gte: new Date(now.getFullYear(), now.getMonth() - 5, 1) },
        },
      },
      {
        $group: {
          _id: { year: { $year: "$startDate" }, month: { $month: "$startDate" } },
          newSubs: { $sum: 1 },
          totalMrr: { $sum: MRR_EXPR },
          employerMrr: {
            $sum: { $cond: [{ $eq: ["$targetRole", "employer"] }, MRR_EXPR, 0] },
          },
          jobSeekerMrr: {
            $sum: { $cond: [{ $eq: ["$targetRole", "job_seeker"] }, MRR_EXPR, 0] },
          },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } },
    ]),

    // 9 — employer funnel
    Subscription.aggregate([
      { $match: { status: "active", targetRole: "employer" } },
      {
        $group: {
          _id: { tier: "$planSnapshot.tier", name: "$planSnapshot.name" },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.tier": 1 } },
    ]),

    // 10 — jobseeker funnel
    Subscription.aggregate([
      { $match: { status: "active", targetRole: "job_seeker" } },
      {
        $group: {
          _id: { tier: "$planSnapshot.tier", name: "$planSnapshot.name" },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.tier": 1 } },
    ]),

    // 11 — top customers by MRR
    Subscription.aggregate([
      { $match: { status: "active", "planSnapshot.price": { $gt: 0 } } },
      {
        $group: {
          _id: "$userId",
          mrr: { $sum: MRR_EXPR },
          planName: { $first: "$planSnapshot.name" },
          tier: { $max: "$planSnapshot.tier" },
          since: { $min: "$startDate" },
        },
      },
      { $sort: { mrr: -1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "user",
          pipeline: [{ $project: { name: 1, email: 1 } }],
        },
      },
      { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
    ]),

    // 12 — top selling agents (by invoice commission)
    Invoice.aggregate([
      { $match: { status: "paid", "commissions.0": { $exists: true } } },
      { $unwind: "$commissions" },
      { $match: { "commissions.role": "agent" } },
      {
        $group: {
          _id: "$commissions.agentId",
          subscriptionsSold: { $sum: 1 },
          revenue: { $sum: "$totalAmount" },
        },
      },
      { $sort: { revenue: -1 } },
      { $limit: 5 },
      {
        $lookup: {
          from: "users",
          localField: "_id",
          foreignField: "_id",
          as: "user",
          pipeline: [{ $project: { name: 1 } }],
        },
      },
      { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
    ]),

    // 13 — renewal forecast (3 buckets: 7d, 15d, 30d)
    Subscription.aggregate([
      { $match: { status: "active", endDate: { $gte: now, $lte: in30 } } },
      {
        $group: {
          _id: {
            $switch: {
              branches: [
                { case: { $lte: ["$endDate", in7] }, then: "within7" },
                { case: { $lte: ["$endDate", in15] }, then: "within15" },
              ],
              default: "within30",
            },
          },
          count: { $sum: 1 },
          revenue: { $sum: MRR_EXPR },
        },
      },
    ]),

    // 14 — recent activity (last 20)
    SubscriptionHistory.find()
      .sort({ createdAt: -1 })
      .limit(20)
      .populate("userId", "name email")
      .populate("performedBy", "name")
      .lean(),

    // 15 — invoice health (this month)
    Invoice.aggregate([
      {
        $facet: {
          paid: [
            { $match: { status: "paid", paidAt: { $gte: som } } },
            { $group: { _id: null, count: { $sum: 1 }, total: { $sum: "$totalAmount" } } },
          ],
          pending: [
            { $match: { status: { $in: ["issued", "sent", "pending_approval"] } } },
            { $group: { _id: null, count: { $sum: 1 } } },
          ],
          overdue: [
            {
              $match: {
                status: { $nin: ["paid", "voided", "cancelled", "credited"] },
                dueDate: { $lt: now },
              },
            },
            { $group: { _id: null, count: { $sum: 1 } } },
          ],
        },
      },
    ]),

    // 16 — revenue by country
    Subscription.aggregate([
      { $match: { status: "active", targetRole: "employer" } },
      {
        $lookup: {
          from: "employers",
          localField: "userId",
          foreignField: "userId",
          as: "employer",
          pipeline: [{ $project: { country: 1 } }],
        },
      },
      { $unwind: { path: "$employer", preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: { $ifNull: ["$employer.country", "Unknown"] },
          subscriptions: { $sum: 1 },
          revenue: { $sum: MRR_EXPR },
        },
      },
      { $sort: { revenue: -1 } },
      { $limit: 10 },
    ]),

    // 17 — revenue breakdown (new / expansion / churned this month)
    SubscriptionHistory.aggregate([
      { $match: { createdAt: { $gte: som } } },
      {
        $group: {
          _id: "$action",
          count: { $sum: 1 },
        },
      },
    ]),

    // 18 — new revenue this month (new subscriptions created this month)
    Subscription.aggregate([
      { $match: { startDate: { $gte: som }, "planSnapshot.price": { $gt: 0 } } },
      { $group: { _id: null, revenue: { $sum: MRR_EXPR }, count: { $sum: 1 } } },
    ]),

    // 19 — expansion revenue (upgrades this month)
    SubscriptionHistory.aggregate([
      { $match: { action: "upgraded", createdAt: { $gte: som } } },
      {
        $lookup: {
          from: "subscriptions",
          localField: "subscriptionId",
          foreignField: "_id",
          as: "sub",
          pipeline: [{ $project: { "planSnapshot.price": 1, "planSnapshot.billingCycle": 1 } }],
        },
      },
      { $unwind: { path: "$sub", preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: null,
          revenue: {
            $sum: {
              $divide: [
                { $ifNull: ["$sub.planSnapshot.price", 0] },
                {
                  $switch: {
                    branches: [
                      { case: { $eq: ["$sub.planSnapshot.billingCycle", "yearly"] }, then: 12 },
                      { case: { $eq: ["$sub.planSnapshot.billingCycle", "quarterly"] }, then: 3 },
                    ],
                    default: 1,
                  },
                },
              ],
            },
          },
          count: { $sum: 1 },
        },
      },
    ]),

    // 20 — churned revenue (cancelled this month)
    Subscription.aggregate([
      { $match: { status: "cancelled", cancelledAt: { $gte: som }, "planSnapshot.price": { $gt: 0 } } },
      { $group: { _id: null, revenue: { $sum: MRR_EXPR }, count: { $sum: 1 } } },
    ]),

    // 21 — plan performance (active, churn, growth per plan)
    Subscription.aggregate([
      { $match: { status: { $in: ["active", "cancelled"] } } },
      {
        $group: {
          _id: { name: "$planSnapshot.name", tier: "$planSnapshot.tier" },
          activeCount: {
            $sum: { $cond: [{ $eq: ["$status", "active"] }, 1, 0] },
          },
          cancelledCount: {
            $sum: {
              $cond: [
                { $and: [{ $eq: ["$status", "cancelled"] }, { $gte: ["$cancelledAt", som] }] },
                1,
                0,
              ],
            },
          },
          newThisMonth: {
            $sum: {
              $cond: [{ $gte: ["$startDate", som] }, 1, 0],
            },
          },
          revenue: {
            $sum: {
              $cond: [
                { $eq: ["$status", "active"] },
                MRR_EXPR,
                0,
              ],
            },
          },
        },
      },
      { $sort: { revenue: -1 } },
    ]),

    // 22 — alerts: disputes + failed payments
    Invoice.aggregate([
      {
        $facet: {
          disputes: [
            { $match: { "disputes.0": { $exists: true }, "disputes.status": "open" } },
            { $group: { _id: null, count: { $sum: 1 } } },
          ],
          failedPayments: [
            { $match: { status: "payment_failed" } },
            { $group: { _id: null, count: { $sum: 1 } } },
          ],
        },
      },
    ]),

    // 23 — conversion funnel: total users by role + onboarded + subscribed
    User.aggregate([
      {
        $facet: {
          totalUsers: [{ $group: { _id: null, count: { $sum: 1 } } }],
          byRole: [{ $group: { _id: "$role", count: { $sum: 1 } } }],
          verified: [{ $match: { isEmailVerified: true } }, { $group: { _id: null, count: { $sum: 1 } } }],
          onboarded: [{ $match: { isOnboarded: true } }, { $group: { _id: null, count: { $sum: 1 } } }],
        },
      },
    ]),
  ]);

  // ── Post-process ─────────────────────────────────────────────────────────

  const statusMap: Record<string, number> = {};
  for (const s of statusCounts) statusMap[s._id] = s.count;

  const roleMap: Record<string, number> = {};
  for (const r of roleCounts) roleMap[r._id] = r.count;

  const currentMrr = Math.round((mrrStats[0]?.mrr ?? 0) * 100) / 100;
  const currentArr = Math.round(currentMrr * 12 * 100) / 100;
  const paidActiveCount = mrrStats[0]?.paidActiveCount ?? 0;

  const totalNow = Object.values(statusMap).reduce((a, b) => a + b, 0);
  const activeNow = statusMap.active ?? 0;

  // Previous month
  const prevMap: Record<string, number> = {};
  for (const p of prevMonthOverview) prevMap[p._id] = p.count;
  const prevActive = prevMap.active ?? 0;
  const totalPrev = Object.values(prevMap).reduce((a, b) => a + b, 0);
  const prevMrrVal = Math.round((prevMrr[0]?.mrr ?? 0) * 100) / 100;

  // Previous month cancelled
  const prevCancelled = await Subscription.countDocuments({
    status: "cancelled",
    cancelledAt: { $gte: sopm, $lt: som },
  });

  // Churn
  const activeAtSom = prevActive;
  const churnRate = activeAtSom > 0 ? Math.round((cancelledThisMonth / activeAtSom) * 1000) / 10 : 0;
  const prevChurn = prevActive > 0 ? Math.round((prevCancelled / prevActive) * 1000) / 10 : 0;

  // Funnel builder
  const buildFunnel = (
    stages: Array<{ _id: { tier: number; name: string }; count: number }>,
    totalActive: number,
  ) => {
    const result = [{ name: "Total", count: totalActive, percentage: 100 }];
    for (const s of stages) {
      result.push({
        name: s._id.name || `Tier ${s._id.tier}`,
        count: s.count,
        percentage: totalActive > 0 ? Math.round((s.count / totalActive) * 1000) / 10 : 0,
      });
    }
    return result;
  };

  const employerTotal = roleMap.employer ?? 0;
  const jobSeekerTotal = roleMap.job_seeker ?? 0;

  // Plan distribution
  const totalRevenue = tierDistribution.reduce(
    (a: number, t: { revenue: number }) => a + t.revenue, 0,
  );

  // Renewal buckets
  const renewalMap: Record<string, { count: number; revenue: number }> = {
    within7: { count: 0, revenue: 0 },
    within15: { count: 0, revenue: 0 },
    within30: { count: 0, revenue: 0 },
  };
  for (const b of renewalBuckets) {
    renewalMap[b._id] = { count: b.count, revenue: Math.round(b.revenue * 100) / 100 };
  }
  const totalRenewing = renewalMap.within7.count + renewalMap.within15.count + renewalMap.within30.count;
  const expectedRenewalRevenue = renewalMap.within7.revenue + renewalMap.within15.revenue + renewalMap.within30.revenue;

  // Invoice health
  const ih = invoiceHealth[0] ?? { paid: [], pending: [], overdue: [] };

  // Country revenue — normalize and merge duplicates, filter Unknown
  const countryMerged: Record<string, { subscriptions: number; revenue: number }> = {};
  for (const c of countryRevenue) {
    const name = normalizeCountry(c._id);
    if (!name) continue; // skip Unknown
    if (!countryMerged[name]) countryMerged[name] = { subscriptions: 0, revenue: 0 };
    countryMerged[name].subscriptions += c.subscriptions;
    countryMerged[name].revenue += c.revenue;
  }
  const normalizedCountries = Object.entries(countryMerged)
    .map(([country, data]) => ({ country, ...data }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);
  const totalCountryRevenue = normalizedCountries.reduce((a, c) => a + c.revenue, 0);

  // Revenue health metrics
  const newRevenue = Math.round((newRevenueData[0]?.revenue ?? 0) * 100) / 100;
  const expansionRevenue = Math.round((expansionRevenueData[0]?.revenue ?? 0) * 100) / 100;
  const churnedRevenue = Math.round((churnedRevenueData[0]?.revenue ?? 0) * 100) / 100;
  const netRevenue = Math.round((newRevenue + expansionRevenue - churnedRevenue) * 100) / 100;
  const arpu = paidActiveCount > 0 ? Math.round((currentMrr / paidActiveCount) * 100) / 100 : 0;
  const monthlyChurnDecimal = churnRate / 100;
  const ltv = monthlyChurnDecimal > 0 ? Math.round((arpu / monthlyChurnDecimal) * 100) / 100 : arpu * 24;

  // Plan performance
  const planPerf = (planPerformance as Array<{
    _id: { name: string; tier: number };
    activeCount: number;
    cancelledCount: number;
    newThisMonth: number;
    revenue: number;
  }>)
    .filter((p) => p._id.name && p._id.name !== "Unknown")
    .map((p) => ({
      planName: p._id.name,
      tier: p._id.tier,
      activeUsers: p.activeCount,
      revenue: Math.round(p.revenue * 100) / 100,
      churn: p.activeCount > 0 ? Math.round((p.cancelledCount / (p.activeCount + p.cancelledCount)) * 1000) / 10 : 0,
      growth: Math.round(((p.newThisMonth - p.cancelledCount) / Math.max(p.activeCount, 1)) * 1000) / 10,
      newThisMonth: p.newThisMonth,
      cancelledThisMonth: p.cancelledCount,
    }));

  // Alerts
  const alertData = alertsData[0] ?? { disputes: [], failedPayments: [] };
  const alerts = {
    failedPayments: alertData.failedPayments[0]?.count ?? 0,
    expiringSoon: totalRenewing,
    highRiskAccounts: renewalMap.within7.count, // expiring within 7 days = high risk
    disputes: alertData.disputes[0]?.count ?? 0,
    total: 0,
  };
  alerts.total = alerts.failedPayments + alerts.expiringSoon + alerts.highRiskAccounts + alerts.disputes;

  // Conversion funnel
  const cf = conversionFunnel[0] ?? { totalUsers: [], byRole: [], verified: [], onboarded: [] };
  const totalUsersCount = cf.totalUsers[0]?.count ?? 0;
  const verifiedCount = cf.verified[0]?.count ?? 0;
  const onboardedCount = cf.onboarded[0]?.count ?? 0;
  const paidCount = paidActiveCount;
  // Renewed = subscriptions that were renewed (action=renewed in history)
  const renewedCount = (revenueActions as Array<{ _id: string; count: number }>)
    .find((a) => a._id === "renewed")?.count ?? 0;

  // ── Build response ───────────────────────────────────────────────────────

  return NextResponse.json({
    overview: {
      total: totalNow,
      active: activeNow,
      expired: statusMap.expired ?? 0,
      cancelled: statusMap.cancelled ?? 0,
      suspended: statusMap.suspended ?? 0,
      mrr: currentMrr,
      arr: currentArr,
      churnRate,
      expiringSoon: totalRenewing,
      cancelledThisMonth,
      employerActive: employerTotal,
      jobSeekerActive: jobSeekerTotal,
      paidActiveCount,
    },
    kpiComparisons: {
      totalPrev,
      activePrev: prevActive,
      mrrPrev: prevMrrVal,
      churnPrev: prevChurn,
      cancelledPrev: prevCancelled,
      totalChange: pct(totalNow, totalPrev),
      activeChange: pct(activeNow, prevActive),
      mrrChange: pct(currentMrr, prevMrrVal),
      churnChange: pct(churnRate, prevChurn),
      cancelledChange: pct(cancelledThisMonth, prevCancelled),
    },
    revenueTrend: revenueTrend.map(
      (m: { _id: { year: number; month: number }; newSubs: number; totalMrr: number; employerMrr: number; jobSeekerMrr: number }) => ({
        month: MONTH_NAMES[m._id.month] || `M${m._id.month}`,
        year: m._id.year,
        monthNum: m._id.month,
        mrr: Math.round(m.totalMrr * 100) / 100,
        newSubs: m.newSubs,
        employerMrr: Math.round(m.employerMrr * 100) / 100,
        jobSeekerMrr: Math.round(m.jobSeekerMrr * 100) / 100,
      }),
    ),
    subscriptionFunnel: {
      employer: buildFunnel(funnelEmployer, employerTotal),
      jobSeeker: buildFunnel(funnelJobSeeker, jobSeekerTotal),
    },
    planDistribution: tierDistribution.map(
      (t: { _id: { tier: number; name: string }; count: number; revenue: number }) => ({
        planName: t._id.name || `Tier ${t._id.tier}`,
        tier: t._id.tier,
        revenue: Math.round(t.revenue * 100) / 100,
        percentage: totalRevenue > 0 ? Math.round((t.revenue / totalRevenue) * 1000) / 10 : 0,
        count: t.count,
      }),
    ),
    topCustomers: topCustomers
      .filter((c: { user?: { name?: string } }) => c.user?.name && c.user.name !== "Unknown")
      .map(
        (c: { _id: unknown; user?: { name?: string; email?: string }; planName: string; tier: number; mrr: number; since: Date }) => ({
          userId: String(c._id),
          name: c.user?.name ?? "",
          email: c.user?.email ?? "",
          planName: c.planName,
          tier: c.tier,
          mrr: Math.round(c.mrr * 100) / 100,
          since: c.since?.toISOString?.() ?? "",
        }),
      ),
    topAgents: topAgents
      .filter((a: { user?: { name?: string } }) => a.user?.name && a.user.name !== "Unknown")
      .map(
        (a: { _id: unknown; user?: { name?: string }; subscriptionsSold: number; revenue: number }) => ({
          agentId: String(a._id),
          name: a.user?.name ?? "",
          subscriptionsSold: a.subscriptionsSold,
          revenue: Math.round(a.revenue * 100) / 100,
        }),
      ),
    renewalForecast: {
      totalRenewing,
      expectedRevenue: Math.round(expectedRenewalRevenue * 100) / 100,
      within7: renewalMap.within7,
      within15: renewalMap.within15,
      within30: renewalMap.within30,
    },
    recentActivity: (
      recentActivity as Array<{
        _id: unknown;
        userId?: { name?: string; email?: string } | null;
        action: string;
        toPlanName?: string;
        fromPlanName?: string;
        performedBy?: { name?: string } | null;
        reason?: string;
        createdAt: Date;
      }>
    ).map((a) => ({
      id: String(a._id),
      userName: a.userId?.name ?? "User",
      userEmail: a.userId?.email ?? "",
      action: a.action,
      toPlanName: a.toPlanName ?? null,
      fromPlanName: a.fromPlanName ?? null,
      performedByName: a.performedBy?.name ?? null,
      reason: a.reason ?? null,
      createdAt: a.createdAt?.toISOString?.() ?? "",
    })),
    invoiceHealth: {
      paidCount: ih.paid[0]?.count ?? 0,
      pendingCount: ih.pending[0]?.count ?? 0,
      overdueCount: ih.overdue[0]?.count ?? 0,
      collectedRevenue: Math.round((ih.paid[0]?.total ?? 0) * 100) / 100,
    },
    revenueByCountry: normalizedCountries.map((c) => ({
      country: c.country,
      subscriptions: c.subscriptions,
      revenue: Math.round(c.revenue * 100) / 100,
      percentage: totalCountryRevenue > 0 ? Math.round((c.revenue / totalCountryRevenue) * 1000) / 10 : 0,
    })),
    revenueHealth: {
      arpu,
      ltv,
      newRevenue,
      expansionRevenue,
      churnedRevenue,
      netRevenue,
    },
    planPerformance: planPerf,
    alerts,
    conversionFunnel: {
      totalUsers: totalUsersCount,
      verified: verifiedCount,
      onboarded: onboardedCount,
      trial: activeNow - paidCount,
      paid: paidCount,
      renewed: renewedCount,
    },
  });
}

export const GET = withAuth(handler, { resource: "subscriptions", action: "read" });
