/**
 * GET /api/admin/subscription-dashboard?period=7d|30d|90d — the Subscriptions
 * report tab: recurring revenue, the plan mix, renewals coming up, subscriptions
 * started and lost per month, and how many customer accounts pay.
 *
 * Admin only — the payload is platform-wide with no tenant scoping, so
 * super_agent is rejected below (C1).
 *
 * Every definition matches a list the admin can open: renewals use the same
 * window as /admin/subscriptions?expiring=, and "lost" is the dashboard
 * Finance tab's cancelled + expired.
 */

import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import connectDB from "@/lib/db/mongoose";
import Subscription from "@/models/Subscription";
import User from "@/models/User";
import { resolveDashboardPeriod } from "@/lib/admin/dashboard/period";
import { subscriptionsEndingFilter } from "@/lib/admin/queueFilters";
import type { UserRole } from "@/types/user";

interface AuthCtx { userId: string; role: UserRole; locale: string }

/** A snapshot without a currency predates the field; plans default to AED. */
const DEFAULT_BILLING_CURRENCY = "AED";
const SNAPSHOT_CURRENCY = { $toUpper: { $ifNull: ["$planSnapshot.currency", DEFAULT_BILLING_CURRENCY] } };
const IS_PAID = { $gt: [{ $ifNull: ["$planSnapshot.price", 0] }, 0] };
const ACTIVITY_MONTHS = 6;
const CUSTOMER_ROLES = ["employer", "job_seeker"] as const;
type CustomerRole = (typeof CUSTOMER_ROLES)[number];

const MONTHLY_PRICE = {
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

/* Monthly price in `currency` only; a subscription billed in another currency
   contributes 0. Nothing converts, so money is never added across currencies —
   the counts still include every subscription. */
function mrrExpr(currency: string) {
  return { $cond: [{ $eq: [SNAPSHOT_CURRENCY, currency] }, MONTHLY_PRICE, 0] };
}

const round2 = (value: number) => Math.round(value * 100) / 100;
const monthKey = (year: number, month: number) => `${year}-${String(month).padStart(2, "0")}`;

/** Lost in a window: the dashboard's cancelled + expired. */
function lostIn(start: Date, end: Date) {
  return {
    $or: [
      { status: "cancelled", cancelledAt: { $gte: start, $lt: end } },
      { status: "expired", endDate: { $gte: start, $lt: end } },
    ],
  };
}

async function handler(req: NextRequest, ctx: AuthCtx) {
  if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  await connectDB();

  const period = resolveDashboardPeriod(new URL(req.url).searchParams.get("period"));
  const { now, start, previousStart } = period;
  const activityStart = new Date(now.getFullYear(), now.getMonth() - (ACTIVITY_MONTHS - 1), 1);

  // Every money figure is in the currency most active MRR is billed in; any
  // other currency is listed in `otherCurrencies`, never added in.
  const currencyRows = await Subscription.aggregate<{ _id: string; count: number; mrr: number }>([
    { $match: { status: "active" } },
    { $group: { _id: SNAPSHOT_CURRENCY, count: { $sum: 1 }, mrr: { $sum: MONTHLY_PRICE } } },
    { $sort: { mrr: -1, count: -1, _id: 1 } },
  ]);
  const currency = currencyRows[0]?._id ?? DEFAULT_BILLING_CURRENCY;
  const MRR = mrrExpr(currency);

  const [
    planRows,
    renewalRows,
    endingIn7,
    startedRows,
    cancelledRows,
    expiredRows,
    startedNow,
    startedBefore,
    lostNow,
    lostBefore,
    accountRows,
    paidRows,
  ] = await Promise.all([
    Subscription.aggregate<{ _id: { role: CustomerRole; name: string | null; tier: number | null }; active: number; paid: number; mrr: number }>([
      { $match: { status: "active" } },
      {
        $group: {
          _id: { role: "$targetRole", name: "$planSnapshot.name", tier: "$planSnapshot.tier" },
          active: { $sum: 1 },
          paid: { $sum: { $cond: [IS_PAID, 1, 0] } },
          mrr: { $sum: MRR },
        },
      },
    ]),
    Subscription.aggregate<{ _id: { paid: boolean; autoRenew: boolean }; count: number; mrr: number }>([
      { $match: subscriptionsEndingFilter(30, now) },
      {
        $group: {
          _id: { paid: IS_PAID, autoRenew: { $eq: ["$autoRenew", true] } },
          count: { $sum: 1 },
          mrr: { $sum: MRR },
        },
      },
    ]),
    Subscription.countDocuments(subscriptionsEndingFilter(7, now)),
    Subscription.aggregate<{ _id: { y: number; m: number }; count: number }>([
      { $match: { createdAt: { $gte: activityStart } } },
      { $group: { _id: { y: { $year: "$createdAt" }, m: { $month: "$createdAt" } }, count: { $sum: 1 } } },
    ]),
    Subscription.aggregate<{ _id: { y: number; m: number }; count: number }>([
      { $match: { status: "cancelled", cancelledAt: { $gte: activityStart } } },
      { $group: { _id: { y: { $year: "$cancelledAt" }, m: { $month: "$cancelledAt" } }, count: { $sum: 1 } } },
    ]),
    Subscription.aggregate<{ _id: { y: number; m: number }; count: number }>([
      { $match: { status: "expired", endDate: { $gte: activityStart, $lte: now } } },
      { $group: { _id: { y: { $year: "$endDate" }, m: { $month: "$endDate" } }, count: { $sum: 1 } } },
    ]),
    Subscription.countDocuments({ createdAt: { $gte: start, $lte: now } }),
    Subscription.countDocuments({ createdAt: { $gte: previousStart, $lt: start } }),
    Subscription.countDocuments(lostIn(start, now)),
    Subscription.countDocuments(lostIn(previousStart, start)),
    // Customer accounts, as the dashboard counts them: not deactivated.
    User.aggregate<{ _id: CustomerRole; accounts: number; verified: number }>([
      { $match: { role: { $in: [...CUSTOMER_ROLES] }, isActive: { $ne: false } } },
      { $group: { _id: "$role", accounts: { $sum: 1 }, verified: { $sum: { $cond: ["$isEmailVerified", 1, 0] } } } },
    ]),
    // Distinct live accounts on a paid plan: a subscription on a deactivated
    // account is not a paying customer of the platform today.
    Subscription.aggregate<{ _id: CustomerRole; paid: number }>([
      { $match: { status: "active", "planSnapshot.price": { $gt: 0 } } },
      { $group: { _id: { role: "$targetRole", userId: "$userId" } } },
      {
        $lookup: {
          from: "users",
          localField: "_id.userId",
          foreignField: "_id",
          as: "user",
          pipeline: [{ $match: { isActive: { $ne: false } } }, { $project: { _id: 1 } }],
        },
      },
      { $match: { "user.0": { $exists: true } } },
      { $group: { _id: "$_id.role", paid: { $sum: 1 } } },
    ]),
  ]);

  const plans = planRows
    .map((row) => ({
      role: row._id.role,
      name: row._id.name ?? "",
      tier: row._id.tier ?? 0,
      active: row.active,
      paid: row.paid,
      mrr: round2(row.mrr),
    }))
    .sort((left, right) =>
      left.role === right.role ? right.tier - left.tier : left.role === "employer" ? -1 : 1);
  const mrr = round2(plans.reduce((total, plan) => total + plan.mrr, 0));
  const active = plans.reduce((total, plan) => total + plan.active, 0);
  const paid = plans.reduce((total, plan) => total + plan.paid, 0);

  const renewals = { within7: endingIn7, within30: 0, paidAutoRenew: 0, paidManual: 0, free: 0, mrrAtRisk: 0 };
  for (const row of renewalRows) {
    renewals.within30 += row.count;
    if (!row._id.paid) renewals.free += row.count;
    else if (row._id.autoRenew) renewals.paidAutoRenew += row.count;
    else {
      renewals.paidManual += row.count;
      // Ends without a renewal unless someone acts: this is the money at stake.
      renewals.mrrAtRisk += row.mrr;
    }
  }
  renewals.mrrAtRisk = round2(renewals.mrrAtRisk);

  const byMonth = (rows: { _id: { y: number; m: number }; count: number }[]) =>
    new Map(rows.map((row) => [monthKey(row._id.y, row._id.m), row.count]));
  const started = byMonth(startedRows);
  const cancelled = byMonth(cancelledRows);
  const expired = byMonth(expiredRows);
  const activity = Array.from({ length: ACTIVITY_MONTHS }, (_, index) => {
    const date = new Date(activityStart.getFullYear(), activityStart.getMonth() + index, 1);
    const key = monthKey(date.getFullYear(), date.getMonth() + 1);
    return { month: key, started: started.get(key) ?? 0, lost: (cancelled.get(key) ?? 0) + (expired.get(key) ?? 0) };
  });

  const accountsByRole = new Map(accountRows.map((row) => [row._id, row]));
  const paidByRole = new Map(paidRows.map((row) => [row._id, row.paid]));
  const conversionFor = (role: CustomerRole) => ({
    accounts: accountsByRole.get(role)?.accounts ?? 0,
    verified: accountsByRole.get(role)?.verified ?? 0,
    paid: paidByRole.get(role) ?? 0,
  });

  return NextResponse.json({
    period: { key: period.key, days: period.days },
    currency,
    otherCurrencies: currencyRows.slice(1).map((row) => ({ currency: row._id, count: row.count, mrr: round2(row.mrr) })),
    mrr,
    active: { total: active, paid, free: active - paid },
    trends: {
      started: { current: startedNow, previous: startedBefore },
      lost: { current: lostNow, previous: lostBefore },
    },
    plans: plans.map((plan) => ({ ...plan, share: mrr > 0 ? Math.round((plan.mrr / mrr) * 1000) / 10 : 0 })),
    renewals,
    activity,
    conversion: { employer: conversionFor("employer"), jobSeeker: conversionFor("job_seeker") },
  });
}

export const GET = withAuth(handler, { resource: "subscriptions", action: "read" });
