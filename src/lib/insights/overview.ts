/**
 * Platform KPI snapshot for AI reports. Mirrors the rules the admin dashboards
 * use (admin/stats, admin/analytics, admin/subscription-dashboard): jobs exclude
 * soft-deleted rows, money is grouped by currency, non-revenue invoice statuses
 * are kept out of money totals, and MRR uses the shared MRR_EXPR.
 */
import { connectDB } from "@/lib/db/mongoose";
import User from "@/models/User";
import Employer from "@/models/Employer";
import JobSeeker from "@/models/JobSeeker";
import Agent from "@/models/Agent";
import SuperAgent from "@/models/SuperAgent";
import Job from "@/models/Job";
import Application from "@/models/Application";
import Interview from "@/models/Interview";
import Offer from "@/models/Offer";
import Placement from "@/models/Placement";
import Commission from "@/models/Commission";
import Invoice from "@/models/Invoice";
import Subscription from "@/models/Subscription";
import Lead from "@/models/Lead";
import { NON_REVENUE_INVOICE_STATUSES } from "@/lib/invoices/status";
import { MRR_EXPR } from "@/lib/subscriptions/mrr";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface Trend {
  current: number;
  previous: number;
  /** Percentage change vs. the previous 30 days (100 when previous was 0 and current > 0). */
  deltaPct: number;
  direction: "up" | "down" | "flat";
}

/** Same rule as buildTrend() in /api/admin/analytics. */
export function trend(current: number, previous: number): Trend {
  const deltaPct =
    previous === 0 ? (current === 0 ? 0 : 100) : Number((((current - previous) / previous) * 100).toFixed(1));
  return { current, previous, deltaPct, direction: deltaPct > 0 ? "up" : deltaPct < 0 ? "down" : "flat" };
}

type CountRow = { _id: string | boolean | null; count: number };
type Countable = {
  countDocuments: (filter: Record<string, unknown>) => { exec: () => Promise<number> };
  aggregate: <T>(pipeline: Record<string, unknown>[]) => { exec: () => Promise<T[]> };
};

function asCountable(model: unknown): Countable {
  return model as Countable;
}

function toMap(rows: CountRow[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) out[r._id === null || r._id === undefined ? "unknown" : String(r._id)] = r.count;
  return out;
}

async function groupCount(model: unknown, field: string, match: Record<string, unknown> = {}, lower = false) {
  const key = lower ? { $toLower: { $ifNull: [`$${field}`, "unknown"] } } : `$${field}`;
  const rows = await asCountable(model)
    .aggregate<CountRow>([{ $match: match }, { $group: { _id: key, count: { $sum: 1 } } }, { $sort: { count: -1 } }])
    .exec();
  return toMap(rows);
}

async function windowTrend(model: unknown, dateField: string, now: Date, base: Record<string, unknown> = {}) {
  const cur = new Date(now.getTime() - 30 * DAY_MS);
  const prev = new Date(now.getTime() - 60 * DAY_MS);
  const m = asCountable(model);
  const [current, previous] = await Promise.all([
    m.countDocuments({ ...base, [dateField]: { $gte: cur, $lte: now } }).exec(),
    m.countDocuments({ ...base, [dateField]: { $gte: prev, $lt: cur } }).exec(),
  ]);
  return trend(current, previous);
}

async function moneyByCurrency(
  model: unknown,
  match: Record<string, unknown>,
  amountField: string,
): Promise<Record<string, { total: number; count: number }>> {
  const rows = await asCountable(model)
    .aggregate<{ _id: string | null; total: number; count: number }>([
      { $match: match },
      { $group: { _id: "$currency", total: { $sum: { $ifNull: [`$${amountField}`, 0] } }, count: { $sum: 1 } } },
      { $sort: { total: -1 } },
    ])
    .exec();
  const out: Record<string, { total: number; count: number }> = {};
  for (const r of rows) out[r._id ?? "unknown"] = { total: Math.round(r.total * 100) / 100, count: r.count };
  return out;
}

export async function getOverview(now = new Date()) {
  await connectDB();
  const cur = new Date(now.getTime() - 30 * DAY_MS);
  const prev = new Date(now.getTime() - 60 * DAY_MS);
  const revenueMatch = { status: { $nin: NON_REVENUE_INVOICE_STATUSES } };

  const [
    usersTotal, usersByRole, usersActive, usersTrend,
    employersTotal, employersActive, employersByVerification, employersByPayment, employersTrend,
    jobSeekersTotal, jobSeekersTrend, agentsTotal, superAgentsTotal,
    jobsByStatus, jobsTrend,
    applicationsByStatus, applicationsTrend,
    interviewsByStatus, interviewsUpcoming, interviewsTrend,
    offersByStatus, offersTrend,
    placementsByStatus, placementsTrend,
    commissionsByStatus, commissionsTotals, commissionsPaidCur, commissionsPaidPrev,
    invoicesByStatus, invoicesBilled, invoicesPaid, invoicesOutstanding, invoicesPaidCur, invoicesPaidPrev,
    subsByStatus, subsActiveByRole, mrrRows, subsTrend,
    leadsByStatus, leadsTrend,
  ] = await Promise.all([
    User.countDocuments({}),
    groupCount(User, "role"),
    User.countDocuments({ isActive: true }),
    windowTrend(User, "createdAt", now),

    Employer.countDocuments({}),
    Employer.countDocuments({ isActive: { $ne: false } }),
    groupCount(Employer, "verificationLevel"),
    groupCount(Employer, "paymentStatus"),
    windowTrend(Employer, "createdAt", now),

    JobSeeker.countDocuments({}),
    windowTrend(JobSeeker, "createdAt", now),
    Agent.countDocuments({}),
    SuperAgent.countDocuments({}),

    groupCount(Job, "status", { deletedAt: null }),
    windowTrend(Job, "createdAt", now, { deletedAt: null }),

    groupCount(Application, "status"),
    windowTrend(Application, "createdAt", now),

    groupCount(Interview, "status"),
    Interview.countDocuments({ scheduledAt: { $gte: now }, status: { $in: ["scheduled", "confirmed", "rescheduled"] } }),
    windowTrend(Interview, "createdAt", now),

    groupCount(Offer, "status"),
    windowTrend(Offer, "createdAt", now),

    groupCount(Placement, "status"),
    windowTrend(Placement, "placedAt", now),

    groupCount(Commission, "status"),
    moneyByCurrency(Commission, {}, "amount"),
    moneyByCurrency(Commission, { status: "paid", paidAt: { $gte: cur, $lte: now } }, "amount"),
    moneyByCurrency(Commission, { status: "paid", paidAt: { $gte: prev, $lt: cur } }, "amount"),

    groupCount(Invoice, "status"),
    moneyByCurrency(Invoice, revenueMatch, "totalAmount"),
    moneyByCurrency(Invoice, revenueMatch, "paidAmount"),
    moneyByCurrency(Invoice, { ...revenueMatch, balanceDue: { $gt: 0 } }, "balanceDue"),
    moneyByCurrency(Invoice, { ...revenueMatch, paidAt: { $gte: cur, $lte: now } }, "paidAmount"),
    moneyByCurrency(Invoice, { ...revenueMatch, paidAt: { $gte: prev, $lt: cur } }, "paidAmount"),

    groupCount(Subscription, "status"),
    groupCount(Subscription, "targetRole", { status: "active" }),
    asCountable(Subscription)
      .aggregate<{ _id: string | null; mrr: number; count: number }>([
        { $match: { status: "active", "planSnapshot.price": { $gt: 0 } } },
        { $group: { _id: "$planSnapshot.currency", mrr: { $sum: MRR_EXPR }, count: { $sum: 1 } } },
      ])
      .exec(),
    windowTrend(Subscription, "createdAt", now),

    groupCount(Lead, "status", {}, true),
    windowTrend(Lead, "createdAt", now),
  ]);

  const sum = (m: Record<string, number>) => Object.values(m).reduce((a, b) => a + b, 0);
  const moneyTrend = (
    c: Record<string, { total: number }>,
    p: Record<string, { total: number }>,
  ): Record<string, Trend> => {
    const out: Record<string, Trend> = {};
    for (const ccy of new Set([...Object.keys(c), ...Object.keys(p)])) {
      out[ccy] = trend(c[ccy]?.total ?? 0, p[ccy]?.total ?? 0);
    }
    return out;
  };

  const mrrByCurrency: Record<string, { mrr: number; paidActive: number }> = {};
  for (const r of mrrRows) {
    mrrByCurrency[r._id ?? "unknown"] = { mrr: Math.round(r.mrr * 100) / 100, paidActive: r.count };
  }

  return {
    generatedAt: now.toISOString(),
    window: { current: { from: cur.toISOString(), to: now.toISOString() }, previous: { from: prev.toISOString(), to: cur.toISOString() } },
    notes: [
      "Trends compare the last 30 days with the 30 days before (counts of records created in each window; placements by placedAt).",
      "Money is grouped by ISO currency — never add different currencies together.",
      "Invoice money totals exclude void, cancelled, refunded and credit_note invoices.",
    ],
    users: { total: usersTotal, active: usersActive, byRole: usersByRole, new30d: usersTrend },
    employers: {
      total: employersTotal,
      active: employersActive,
      inactive: employersTotal - employersActive,
      byVerificationLevel: employersByVerification,
      byPaymentStatus: employersByPayment,
      new30d: employersTrend,
    },
    jobSeekers: { total: jobSeekersTotal, new30d: jobSeekersTrend },
    agents: { total: agentsTotal },
    superAgents: { total: superAgentsTotal },
    jobs: { total: sum(jobsByStatus), byStatus: jobsByStatus, new30d: jobsTrend },
    applications: { total: sum(applicationsByStatus), byStatus: applicationsByStatus, new30d: applicationsTrend },
    interviews: { total: sum(interviewsByStatus), byStatus: interviewsByStatus, upcoming: interviewsUpcoming, new30d: interviewsTrend },
    offers: { total: sum(offersByStatus), byStatus: offersByStatus, new30d: offersTrend },
    placements: { total: sum(placementsByStatus), byStatus: placementsByStatus, new30d: placementsTrend },
    commissions: {
      byStatus: commissionsByStatus,
      amountByCurrency: commissionsTotals,
      paid30dByCurrency: moneyTrend(commissionsPaidCur, commissionsPaidPrev),
    },
    invoices: {
      byStatus: invoicesByStatus,
      billedByCurrency: invoicesBilled,
      collectedByCurrency: invoicesPaid,
      outstandingByCurrency: invoicesOutstanding,
      collected30dByCurrency: moneyTrend(invoicesPaidCur, invoicesPaidPrev),
    },
    subscriptions: {
      byStatus: subsByStatus,
      active: subsByStatus.active ?? 0,
      activeByRole: subsActiveByRole,
      mrrByCurrency,
      new30d: subsTrend,
    },
    leads: { total: sum(leadsByStatus), byStatus: leadsByStatus, new30d: leadsTrend },
  };
}

export type Overview = Awaited<ReturnType<typeof getOverview>>;
