import { connectDB } from "@/lib/db/mongoose";
import User from "@/models/User";
import Employer from "@/models/Employer";
import Job from "@/models/Job";
import Application from "@/models/Application";
import Interview from "@/models/Interview";
import Placement from "@/models/Placement";
import Invoice from "@/models/Invoice";
import Subscription from "@/models/Subscription";
import { NON_REVENUE_INVOICE_STATUSES } from "@/lib/invoices/status";
import { badRequest } from "./errors";

export const TIMESERIES_METRICS = {
  users: { model: User, dateField: "createdAt", desc: "New user accounts per bucket." },
  employers: { model: Employer, dateField: "createdAt", desc: "New employer profiles per bucket." },
  jobs: { model: Job, dateField: "createdAt", match: { deletedAt: null }, desc: "Jobs posted per bucket (excl. deleted)." },
  applications: { model: Application, dateField: "createdAt", desc: "Applications submitted per bucket." },
  interviews: { model: Interview, dateField: "scheduledAt", desc: "Interviews scheduled to take place in the bucket (by scheduledAt)." },
  placements: { model: Placement, dateField: "placedAt", desc: "Placements (hires) per bucket (by placedAt)." },
  invoices_paid_amount: {
    model: Invoice,
    dateField: "paidAt",
    match: { status: { $nin: NON_REVENUE_INVOICE_STATUSES }, paidAmount: { $gt: 0 } },
    sumField: "paidAmount",
    desc: "Sum of paidAmount of invoices by paidAt. Pass currency= (else mixed currencies are summed — avoid).",
  },
  subscriptions: { model: Subscription, dateField: "createdAt", desc: "New subscriptions per bucket." },
} as const;

export type TimeseriesMetric = keyof typeof TIMESERIES_METRICS;
export type TimeseriesInterval = "day" | "week" | "month";
export const TIMESERIES_INTERVALS: TimeseriesInterval[] = ["day", "week", "month"];

const MAX_BUCKETS = 400;
const DAY_MS = 24 * 60 * 60 * 1000;

/** UTC bucket start; weeks start Monday (matches $dateTrunc startOfWeek: "monday"). */
export function bucketStart(d: Date, interval: TimeseriesInterval): Date {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  if (interval === "month") return new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), 1));
  if (interval === "week") {
    const dow = (x.getUTCDay() + 6) % 7; // Monday = 0
    return new Date(x.getTime() - dow * DAY_MS);
  }
  return x;
}

function nextBucket(d: Date, interval: TimeseriesInterval): Date {
  if (interval === "month") return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
  return new Date(d.getTime() + (interval === "week" ? 7 : 1) * DAY_MS);
}

function defaultFrom(to: Date, interval: TimeseriesInterval): Date {
  if (interval === "month") return new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth() - 11, 1));
  return new Date(to.getTime() - (interval === "week" ? 12 * 7 : 30) * DAY_MS);
}

export interface TimeseriesInput {
  metric: string;
  interval?: string;
  from?: Date;
  to?: Date;
  currency?: string;
}

export async function getTimeseries(input: TimeseriesInput) {
  const metric = input.metric as TimeseriesMetric;
  const def = TIMESERIES_METRICS[metric];
  if (!def) {
    throw badRequest("invalid_metric", `metric must be one of ${Object.keys(TIMESERIES_METRICS).join(", ")}`);
  }
  const interval = (input.interval ?? "day") as TimeseriesInterval;
  if (!TIMESERIES_INTERVALS.includes(interval)) throw badRequest("invalid_interval", "interval must be day, week or month");

  const to = input.to ?? new Date();
  const from = input.from ?? defaultFrom(to, interval);
  if (from > to) throw badRequest("invalid_date", "from must be before to");

  // Seed every bucket so gaps read as 0, not missing.
  const buckets: Date[] = [];
  for (let b = bucketStart(from, interval); b <= to; b = nextBucket(b, interval)) {
    buckets.push(b);
    if (buckets.length > MAX_BUCKETS) {
      throw badRequest("range_too_large", `Range yields more than ${MAX_BUCKETS} ${interval} buckets — narrow from/to or use a larger interval`);
    }
  }

  const match: Record<string, unknown> = {
    ...("match" in def ? def.match : {}),
    [def.dateField]: { $gte: from, $lte: to },
  };
  if (input.currency) {
    if (!/^[A-Za-z]{3}$/.test(input.currency)) throw badRequest("invalid_param", "currency must be a 3-letter ISO code");
    match.currency = input.currency.toUpperCase();
  }

  await connectDB();
  const sumField = "sumField" in def ? def.sumField : undefined;
  const rows = await (def.model as unknown as {
    aggregate: <T>(p: Record<string, unknown>[]) => { exec: () => Promise<T[]> };
  })
    .aggregate<{ _id: Date; value: number }>([
      { $match: match },
      {
        $group: {
          _id: { $dateTrunc: { date: `$${def.dateField}`, unit: interval, startOfWeek: "monday", timezone: "UTC" } },
          value: { $sum: sumField ? { $ifNull: [`$${sumField}`, 0] } : 1 },
        },
      },
    ])
    .exec();

  const byTime = new Map(rows.map((r) => [new Date(r._id).getTime(), r.value]));
  const points = buckets.map((b) => ({ t: b.toISOString(), value: Math.round((byTime.get(b.getTime()) ?? 0) * 100) / 100 }));
  const total = points.reduce((a, p) => a + p.value, 0);

  return {
    metric,
    interval,
    from: from.toISOString(),
    to: to.toISOString(),
    ...(input.currency ? { currency: input.currency.toUpperCase() } : {}),
    description: def.desc,
    total: Math.round(total * 100) / 100,
    points,
  };
}
