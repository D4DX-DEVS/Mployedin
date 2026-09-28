import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import Job from "@/models/Job";
import Application from "@/models/Application";
import Placement from "@/models/Placement";
import Invoice from "@/models/Invoice";
import { NON_REVENUE_INVOICE_STATUSES } from "@/lib/invoices/status";
import { resolveDashboardPeriod } from "@/lib/admin/dashboard/period";
import { getHiringFunnel } from "@/lib/admin/dashboard/recruitment.server";
import { countActiveJobs, getJobDemandBuckets } from "@/lib/admin/dashboard/shared.server";
import { getPlatformAlerts } from "@/lib/admin/platformAlerts.server";
import logger from "@/lib/logger";

/*
 * GET /api/admin/analytics?period=7d|30d|90d — the admin Platform report.
 *
 * Built on the admin dashboard's own helpers (period, hiring funnel, job
 * demand, platform alerts) so a number here is the same number there. The
 * report used to run its own copies, which counted "jobs without
 * applications" over every job instead of active ones and "needs review" over
 * five statuses instead of `applied`, so the two pages disagreed.
 */

/* Pipeline order, keyed by the real application status. The page owns the
   label (this route has no locale), using the admin dashboard's status names. */
const STATUS_ROWS = [
  "applied",
  "shortlisted",
  "interview_scheduled",
  "selected",
  "offer",
  "hired",
  "rejected",
  "withdrawn",
] as const;
const ALWAYS_SHOWN_STATUSES: readonly string[] = ["applied", "shortlisted", "interview_scheduled", "rejected"];
const ACTIVITY_MONTHS = 6;

type AggregateMonthRow = {
  _id: {
    year: number;
    month: number;
  };
  count: number;
};

type CurrencyRow = { _id: string | null; total: number };

function buildMonthlySeries(now: Date, jobsRows: AggregateMonthRow[], applicationRows: AggregateMonthRow[]) {
  const jobsMap = new Map(jobsRows.map((row) => [`${row._id.year}-${row._id.month}`, row.count]));
  const applicationsMap = new Map(applicationRows.map((row) => [`${row._id.year}-${row._id.month}`, row.count]));

  return Array.from({ length: ACTIVITY_MONTHS }, (_, index) => {
    const date = new Date(now.getFullYear(), now.getMonth() - (ACTIVITY_MONTHS - index - 1), 1);
    const key = `${date.getFullYear()}-${date.getMonth() + 1}`;
    return {
      // ISO year-month; the page formats it in the viewer's locale.
      month: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`,
      jobs: jobsMap.get(key) ?? 0,
      applications: applicationsMap.get(key) ?? 0,
    };
  });
}

/* Money collected on invoices — the same source as the admin dashboard's
   "Collected" column. Invoices follow their issuer's currency and nothing
   converts, so totals stay per currency and are never added together. */
function collectedByCurrency(match: Record<string, unknown> = {}) {
  return Invoice.aggregate<CurrencyRow>([
    { $match: { status: { $nin: NON_REVENUE_INVOICE_STATUSES } } },
    { $unwind: "$payments" },
    ...(Object.keys(match).length ? [{ $match: match }] : []),
    { $group: { _id: "$currency", total: { $sum: "$payments.amount" } } },
  ]);
}

function currencyTotals(rows: CurrencyRow[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const currency = row._id || "AED";
    totals.set(currency, (totals.get(currency) ?? 0) + row.total);
  }
  return totals;
}

export const GET = withAuth(async (req: NextRequest) => {
  try {
    await connectDB();

    const period = resolveDashboardPeriod(new URL(req.url).searchParams.get("period"));
    const { now, start, previousStart } = period;
    const inPeriod = { $gte: start };
    const inPreviousPeriod = { $gte: previousStart, $lt: start };
    const monthlyWindowStart = new Date(now.getFullYear(), now.getMonth() - (ACTIVITY_MONTHS - 1), 1);

    const [
      totalJobs,
      totalApplications,
      totalPlacements,
      revenueAgg,
      currentJobs,
      previousJobs,
      currentApplications,
      previousApplications,
      currentPlacements,
      previousPlacements,
      currentRevenueAgg,
      previousRevenueAgg,
      appsByStatus,
      jobsByMonth,
      applicationsByMonth,
      funnel,
      activeJobs,
      jobDemand,
      alerts,
    ] = await Promise.all([
      Job.countDocuments({ deletedAt: null }),
      Application.countDocuments(),
      Placement.countDocuments(),
      collectedByCurrency(),
      Job.countDocuments({ deletedAt: null, createdAt: inPeriod }),
      Job.countDocuments({ deletedAt: null, createdAt: inPreviousPeriod }),
      Application.countDocuments({ appliedAt: inPeriod }),
      Application.countDocuments({ appliedAt: inPreviousPeriod }),
      Placement.countDocuments({ placedAt: inPeriod }),
      Placement.countDocuments({ placedAt: inPreviousPeriod }),
      collectedByCurrency({ "payments.paymentDate": inPeriod }),
      collectedByCurrency({ "payments.paymentDate": inPreviousPeriod }),
      Application.aggregate<{ _id: string; count: number }>([
        { $group: { _id: "$status", count: { $sum: 1 } } },
      ]),
      Job.aggregate<AggregateMonthRow>([
        { $match: { deletedAt: null, createdAt: { $gte: monthlyWindowStart } } },
        { $group: { _id: { year: { $year: "$createdAt" }, month: { $month: "$createdAt" } }, count: { $sum: 1 } } },
      ]),
      Application.aggregate<AggregateMonthRow>([
        { $project: { bucketDate: { $ifNull: ["$appliedAt", "$createdAt"] } } },
        { $match: { bucketDate: { $gte: monthlyWindowStart } } },
        { $group: { _id: { year: { $year: "$bucketDate" }, month: { $month: "$bucketDate" } }, count: { $sum: 1 } } },
      ]),
      getHiringFunnel(),
      countActiveJobs(),
      getJobDemandBuckets(),
      // The findings keep their own 30-day window: their sentences say "30 days".
      getPlatformAlerts(30),
    ]);

    // The headline figure is the currency with the most collected; any other
    // currency is listed beside it, never added in.
    const revenueTotals = [...currencyTotals(revenueAgg)]
      .map(([currency, total]) => ({ currency, total }))
      .sort((left, right) => right.total - left.total || left.currency.localeCompare(right.currency));
    const primaryRevenue = revenueTotals[0] ?? null;
    const revenueIn = (rows: CurrencyRow[]) => (primaryRevenue ? currencyTotals(rows).get(primaryRevenue.currency) ?? 0 : 0);

    const statusMap = new Map(appsByStatus.map((row) => [row._id ?? "unknown", row.count]));
    const applicationsByStatus = STATUS_ROWS.map((status) => {
      const count = statusMap.get(status) ?? 0;
      return {
        key: status,
        count,
        percent: totalApplications > 0 ? Number(((count / totalApplications) * 100).toFixed(1)) : 0,
      };
    }).filter((row) => row.count > 0 || ALWAYS_SHOWN_STATUSES.includes(row.key));

    return NextResponse.json({
      period: { key: period.key, days: period.days },
      totalJobs,
      totalApplications,
      totalPlacements,
      revenue: {
        currency: primaryRevenue?.currency ?? null,
        total: primaryRevenue?.total ?? 0,
        others: revenueTotals.slice(1),
      },
      // Each pair is this period against the equally long period before it.
      trends: {
        jobs: { current: currentJobs, previous: previousJobs },
        applications: { current: currentApplications, previous: previousApplications },
        placements: { current: currentPlacements, previous: previousPlacements },
        revenue: { current: revenueIn(currentRevenueAgg), previous: revenueIn(previousRevenueAgg) },
      },
      activitySeries: buildMonthlySeries(now, jobsByMonth, applicationsByMonth),
      applicationsByStatus,
      // Applications only, by the furthest stage each one reached — the
      // dashboard's funnel. The old one started at Jobs, a different population.
      conversion: {
        applications: funnel.applications,
        reachedInterview: funnel.reachedInterview,
        reachedOffer: funnel.reachedOffer,
        hired: funnel.hired,
      },
      jobHealth: {
        active: activeJobs,
        withoutApplications: jobDemand.none,
      },
      alerts,
    });
  } catch (error: unknown) {
    logger.error({ error }, "[Admin Analytics Route] Failed to build analytics payload");

    return NextResponse.json(
      { error: "Failed to load analytics data." },
      { status: 500 }
    );
  }
}, { resource: "users", action: "read" });
