import type { Model } from "mongoose";
import Application from "@/models/Application";
import Employer from "@/models/Employer";
import Invoice from "@/models/Invoice";
import Job from "@/models/Job";
import Placement from "@/models/Placement";
import User from "@/models/User";
import { NON_REVENUE_INVOICE_STATUSES } from "@/lib/invoices/status";
import type { DashboardPeriod } from "./period";

const DAY_MS = 24 * 60 * 60 * 1000;

/** One point per day of the period, oldest first. */
export interface DailyTrend {
  /** ISO date (UTC day). */
  day: string;
  users: number;
  jobs: number;
  applications: number;
  placements: number;
}

export interface MonthlyRevenue {
  /** "2026-09" */
  month: string;
  currency: string;
  collected: number;
}

export interface TopEmployer {
  id: string;
  name: string;
  activeJobs: number;
  applications: number;
}

export interface DashboardTrends {
  daily: DailyTrend[];
  /** Collected payments per month for the last twelve months, per currency. */
  revenue: MonthlyRevenue[];
  /** The currency with the most collected money in the window; null when nothing was collected. */
  primaryCurrency: string | null;
  topEmployers: TopEmployer[];
}

const dayKey = (date: Date) => date.toISOString().slice(0, 10);

/** Counts of `dateField` per UTC day since `start`. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function dailyCounts(model: Model<any>, match: Record<string, unknown>, dateExpr: unknown): Promise<Map<string, number>> {
  const rows = await model.aggregate<{ _id: string; count: number }>([
    { $match: match },
    { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: dateExpr } }, count: { $sum: 1 } } },
  ]);
  return new Map(rows.map((row) => [row._id, row.count]));
}

export async function getDailyTrend(period: DashboardPeriod): Promise<DailyTrend[]> {
  const { start, now } = period;
  const since = { $gte: start };
  const [users, jobs, applications, placements] = await Promise.all([
    dailyCounts(User, { createdAt: since }, "$createdAt"),
    dailyCounts(Job, { deletedAt: null, createdAt: since }, "$createdAt"),
    dailyCounts(Application, { $or: [{ appliedAt: since }, { appliedAt: null, createdAt: since }] }, { $ifNull: ["$appliedAt", "$createdAt"] }),
    dailyCounts(Placement, { placedAt: since }, "$placedAt"),
  ]);
  const days: DailyTrend[] = [];
  for (let t = start.getTime(); t <= now.getTime(); t += DAY_MS) {
    const day = dayKey(new Date(t));
    days.push({
      day,
      users: users.get(day) ?? 0,
      jobs: jobs.get(day) ?? 0,
      applications: applications.get(day) ?? 0,
      placements: placements.get(day) ?? 0,
    });
  }
  return days;
}

export async function getMonthlyRevenue(now: Date, months = 12): Promise<MonthlyRevenue[]> {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1), 1));
  const rows = await Invoice.aggregate<{ _id: { month: string; currency: string }; collected: number }>([
    { $match: { status: { $nin: NON_REVENUE_INVOICE_STATUSES }, "payments.paymentDate": { $gte: start } } },
    { $unwind: "$payments" },
    { $match: { "payments.paymentDate": { $gte: start } } },
    {
      $group: {
        _id: { month: { $dateToString: { format: "%Y-%m", date: "$payments.paymentDate" } }, currency: { $ifNull: ["$currency", "AED"] } },
        collected: { $sum: "$payments.amount" },
      },
    },
    { $sort: { "_id.month": 1 } },
  ]);
  return rows.map((row) => ({ month: row._id.month, currency: row._id.currency, collected: row.collected }));
}

export async function getTopEmployers(period: DashboardPeriod, limit = 6): Promise<TopEmployer[]> {
  const rows = await Application.aggregate<{ _id: unknown; applications: number }>([
    { $match: { $or: [{ appliedAt: { $gte: period.start } }, { appliedAt: null, createdAt: { $gte: period.start } }] } },
    { $lookup: { from: "jobs", localField: "jobId", foreignField: "_id", as: "job", pipeline: [{ $project: { employerId: 1 } }] } },
    { $unwind: "$job" },
    { $group: { _id: "$job.employerId", applications: { $sum: 1 } } },
    { $sort: { applications: -1 } },
    { $limit: limit },
  ]);
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row._id);
  const [employers, activeJobs] = await Promise.all([
    Employer.find({ _id: { $in: ids } }).select("companyName").lean<{ _id: unknown; companyName?: string }[]>(),
    Job.aggregate<{ _id: unknown; count: number }>([
      { $match: { employerId: { $in: ids }, status: "active", deletedAt: null } },
      { $group: { _id: "$employerId", count: { $sum: 1 } } },
    ]),
  ]);
  const name = new Map(employers.map((e) => [String(e._id), e.companyName ?? ""]));
  const jobs = new Map(activeJobs.map((row) => [String(row._id), row.count]));
  return rows.map((row) => ({
    id: String(row._id),
    name: name.get(String(row._id)) ?? "",
    activeJobs: jobs.get(String(row._id)) ?? 0,
    applications: row.applications,
  }));
}

export async function getDashboardTrends(period: DashboardPeriod): Promise<DashboardTrends> {
  const [daily, revenue, topEmployers] = await Promise.all([getDailyTrend(period), getMonthlyRevenue(period.now), getTopEmployers(period)]);
  const byCurrency = new Map<string, number>();
  for (const row of revenue) byCurrency.set(row.currency, (byCurrency.get(row.currency) ?? 0) + row.collected);
  const primaryCurrency = [...byCurrency.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  return { daily, revenue, primaryCurrency, topEmployers };
}
