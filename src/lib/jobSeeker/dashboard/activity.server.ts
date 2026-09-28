import type { Types } from "mongoose";
import Application from "@/models/Application";
import Interview from "@/models/Interview";
import ProfileView from "@/models/ProfileView";

/** A count in the current calendar week and the one before it. */
export interface WeekWindow {
  current: number;
  previous: number;
}

import { EMPTY_STATUS_BREAKDOWN, type StatusBreakdown } from "./status";

export type { StatusBreakdown };

export interface DailySeries {
  /** ISO dates (YYYY-MM-DD, UTC) for the last seven days, oldest first. */
  days: string[];
  applications: number[];
  profileViews: number[];
}

export interface SeekerActivity {
  week: { applications: WeekWindow; interviews: WeekWindow; profileViews: WeekWindow };
  series: DailySeries;
  statusBreakdown: StatusBreakdown;
}

/** Sunday 00:00 of the week containing `now`, and of the week before — the same window /api/dashboard/stats has always used. */
export function weekBounds(now: Date): { startOfWeek: Date; startOfPrevWeek: Date } {
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());
  startOfWeek.setHours(0, 0, 0, 0);
  const startOfPrevWeek = new Date(startOfWeek);
  startOfPrevWeek.setDate(startOfWeek.getDate() - 7);
  return { startOfWeek, startOfPrevWeek };
}

const DAY_MS = 24 * 60 * 60 * 1000;

function isoDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** The seven UTC days ending today, oldest first. */
export function lastSevenDays(now: Date): string[] {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Array.from({ length: 7 }, (_, i) => isoDay(new Date(today - (6 - i) * DAY_MS)));
}

async function dailyCounts(
  model: typeof Application | typeof ProfileView,
  match: Record<string, unknown>,
  dateField: string,
  days: string[],
): Promise<number[]> {
  const from = new Date(`${days[0]}T00:00:00.000Z`);
  const rows = (await model.aggregate([
    { $match: { ...match, [dateField]: { $gte: from } } },
    { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: `$${dateField}` } }, count: { $sum: 1 } } },
  ])) as Array<{ _id: string; count: number }>;
  const byDay = new Map(rows.map((r) => [r._id, r.count]));
  return days.map((d) => byDay.get(d) ?? 0);
}

/**
 * What the seeker's home and /api/dashboard/stats both need beyond the plain
 * totals: week-over-week windows for the deltas, seven-day series for the
 * sparklines and the application pipeline by status. Every figure is counted
 * from stored records.
 *
 * `seekerId` is the JobSeeker profile id (Application / Interview key);
 * `userId` is the User id, which is what ProfileView.jobSeekerId stores.
 */
export async function getSeekerActivity(
  seekerId: Types.ObjectId,
  userId: Types.ObjectId | string,
  now: Date = new Date(),
): Promise<SeekerActivity> {
  const { startOfWeek, startOfPrevWeek } = weekBounds(now);
  const days = lastSevenDays(now);
  const notCancelled = { $nin: ["cancelled"] };

  const [
    appsCurr,
    appsPrev,
    interviewsCurr,
    interviewsPrev,
    viewsCurr,
    viewsPrev,
    applicationsDaily,
    viewsDaily,
    statusRows,
  ] = await Promise.all([
    Application.countDocuments({ jobSeekerId: seekerId, appliedAt: { $gte: startOfWeek } }),
    Application.countDocuments({ jobSeekerId: seekerId, appliedAt: { $gte: startOfPrevWeek, $lt: startOfWeek } }),
    Interview.countDocuments({ jobSeekerId: seekerId, status: notCancelled, scheduledAt: { $gte: startOfWeek } }),
    Interview.countDocuments({ jobSeekerId: seekerId, status: notCancelled, scheduledAt: { $gte: startOfPrevWeek, $lt: startOfWeek } }),
    ProfileView.countDocuments({ jobSeekerId: userId, viewedAt: { $gte: startOfWeek } }),
    ProfileView.countDocuments({ jobSeekerId: userId, viewedAt: { $gte: startOfPrevWeek, $lt: startOfWeek } }),
    dailyCounts(Application, { jobSeekerId: seekerId }, "appliedAt", days),
    dailyCounts(ProfileView, { jobSeekerId: userId }, "viewedAt", days),
    Application.aggregate([{ $match: { jobSeekerId: seekerId } }, { $group: { _id: "$status", count: { $sum: 1 } } }]) as Promise<
      Array<{ _id: string; count: number }>
    >,
  ]);

  const statusBreakdown: StatusBreakdown = { ...EMPTY_STATUS_BREAKDOWN };
  for (const row of statusRows) {
    if (row._id in statusBreakdown) statusBreakdown[row._id as keyof StatusBreakdown] = row.count;
  }

  return {
    week: {
      applications: { current: appsCurr, previous: appsPrev },
      interviews: { current: interviewsCurr, previous: interviewsPrev },
      profileViews: { current: viewsCurr, previous: viewsPrev },
    },
    series: { days, applications: applicationsDaily, profileViews: viewsDaily },
    statusBreakdown,
  };
}
