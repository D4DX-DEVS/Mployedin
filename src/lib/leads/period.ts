import { dayStartInZone, weekStartInZone } from "@/lib/datetime/zonedMonth";

/**
 * Time windows the agent home counts leads by. The dashboard card and the
 * leads list (`?period=`) both build their query here, so a card always
 * equals the list it opens.
 */
export const LEAD_PERIODS = ["converted_today", "active_week"] as const;
export type LeadPeriod = (typeof LEAD_PERIODS)[number];

const OPEN_STATUSES = ["new", "contacted", "interested", "negotiating"];

export function isLeadPeriod(value: unknown): value is LeadPeriod {
  return typeof value === "string" && (LEAD_PERIODS as readonly string[]).includes(value);
}

/**
 * - converted_today: won since local midnight.
 * - active_week: still open, and added or contacted since Monday. `updatedAt`
 *   is not used: the follow-up reminder cron touches every open lead.
 */
export function leadPeriodFilter(period: LeadPeriod, timeZone: string, now: Date): Record<string, unknown> {
  if (period === "converted_today") {
    return { status: "converted", convertedAt: { $gte: dayStartInZone(timeZone, now) } };
  }
  const weekStart = weekStartInZone(timeZone, now);
  return {
    status: { $in: OPEN_STATUSES },
    $or: [{ createdAt: { $gte: weekStart } }, { lastContactedAt: { $gte: weekStart } }],
  };
}
