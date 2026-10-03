// src/lib/communications/whatsapp/schedule.ts
/**
 * Pure schedule math for admin WhatsApp schedules. Frequency floor: the minute
 * field must be one number, so a schedule fires at most once per hour — a
 * runaway every-five-minutes campaign would burn the number's quality rating
 * in an afternoon.
 */
import { CronExpressionParser } from "cron-parser";
import { isValidTimeZone } from "@/lib/datetime/zone";

export interface ScheduleTiming {
  kind: "once" | "recurring";
  runAt?: Date | string | null;
  cron?: string | null;
  timezone: string;
}

const HOUR_MS = 60 * 60 * 1000;
// A little over a year, so every DST change in a zone's yearly cycle falls inside the scan.
const DST_SCAN_MS = 400 * 24 * HOUR_MS;
const DST_SCAN_STEP_MS = 12 * HOUR_MS;

/** UTC offset in minutes of `fmt`'s zone at an instant ("GMT+05:30" -> 330). */
function offsetMinutes(fmt: Intl.DateTimeFormat, at: number): number {
  const label = fmt.formatToParts(at).find((p) => p.type === "timeZoneName")?.value ?? "";
  const m = /([+\-−])(\d{2}):(\d{2})$/.exec(label);
  return m ? (m[1] === "+" ? 1 : -1) * (Number(m[2]) * 60 + Number(m[3])) : 0;
}

/**
 * Whether the zone's clocks move by a part of an hour at a DST change. Of the
 * ~420 IANA zones only Australia/Lord_Howe does (30 minutes). The one-number
 * minute rule gives one fire per wall-clock hour, but that shift folds two
 * wall-clock hours into 30 real minutes, and cron-parser 5.x then fires
 * "59 * * * *" at 14:59Z and 15:29Z on the April fall-back and throws "loop limit
 * exceeded" for "0 9 * * *" and "0 * * * *", leaving the schedule with no next
 * run. The frequency floor can't be kept there, so the zone is refused.
 */
function hasSubHourDstShift(timeZone: string): boolean {
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" });
  const start = Date.now();
  let previous = offsetMinutes(fmt, start);
  for (let t = start + DST_SCAN_STEP_MS; t <= start + DST_SCAN_MS; t += DST_SCAN_STEP_MS) {
    const current = offsetMinutes(fmt, t);
    if ((current - previous) % 60 !== 0) return true;
    previous = current;
  }
  return false;
}

export function validateCronExpression(expr: string): string | null {
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) return "Cron needs five fields: minute hour day-of-month month day-of-week";
  if (!/^\d{1,2}$/.test(fields[0]) || Number(fields[0]) > 59) {
    return "Minute must be a single number (0–59) so a schedule runs at most once per hour";
  }
  // cron-parser's Jenkins "H" token picks a random value on every parse(), so the
  // schedule would drift to a new hour or day each time its next run is computed, and
  // it also does so in malformed spellings (*/H, 1/H, H#2). A blacklist of H forms
  // misses some, so refuse any H at all; THU is the only day or month name containing one.
  if (fields.some((f) => /h/i.test(f.replace(/thu/gi, "")))) {
    return "The H (hash) token isn't supported because it picks a different time on every run — use a fixed value";
  }
  try {
    CronExpressionParser.parse(expr.trim());
  } catch (err) {
    return `Invalid cron expression: ${err instanceof Error ? err.message : "unparseable"}`;
  }
  return null;
}

export function validateTimezone(tz: string): string | null {
  if (!isValidTimeZone(tz)) return "Unknown timezone — use an IANA name such as Asia/Dubai";
  if (hasSubHourDstShift(tz)) {
    return "This timezone changes its clocks by part of an hour, which schedules can't follow reliably — pick a neighbouring timezone such as Australia/Sydney";
  }
  return null;
}

/**
 * Next fire time strictly after `from`. Null means "no next run could be computed":
 * a one-time schedule that is already past or has no `runAt`, or a recurring one with a
 * missing or invalid cron or timezone. Callers must not read null as "finished" for a
 * recurring schedule; that is an error to surface, not a completed run.
 */
export function computeNextRunAt(timing: ScheduleTiming, from: Date = new Date()): Date | null {
  if (timing.kind === "once") {
    if (!timing.runAt) return null;
    const d = new Date(timing.runAt);
    return Number.isNaN(d.getTime()) || d.getTime() <= from.getTime() ? null : d;
  }
  if (!timing.cron) return null;
  // cron-parser reads a missing zone as the server's own, so a schedule row with no
  // zone would quietly fire on UTC (production) or local time (dev) instead.
  if (!isValidTimeZone(timing.timezone)) return null;
  try {
    return CronExpressionParser.parse(timing.cron.trim(), { currentDate: from, tz: timing.timezone }).next().toDate();
  } catch {
    return null;
  }
}

/**
 * Why a schedule's timing can't be saved, or null when it can. The create route passes
 * the request, the update route the stored schedule merged with the patch, so the
 * once-per-hour floor (the cron minute field plus the zone check) holds on every write.
 * A cron is checked whenever one is present, even beside a one-time schedule. A recurring
 * cron that parses but never fires (day 31 of April) is refused here too, since
 * computeNextRunAt would give a schedule that silently never runs. `enabled` decides
 * whether a one-time run in the past is an error: a paused, already-fired schedule keeps
 * its old run time until the admin picks a new one.
 */
export function scheduleTimingError(timing: ScheduleTiming, enabled: boolean): string | null {
  const tz = validateTimezone(timing.timezone);
  if (tz) return tz;
  if (timing.cron) {
    const cron = validateCronExpression(timing.cron);
    if (cron) return cron;
  }
  if (timing.kind === "recurring") {
    if (!timing.cron) return "A recurring schedule needs a cron expression";
    return computeNextRunAt(timing) ? null : "We couldn't work out the next run time for this cron expression";
  }
  if (!timing.runAt || Number.isNaN(new Date(timing.runAt).getTime())) return "A one-time schedule needs a run time";
  if (enabled && !computeNextRunAt(timing)) return "Run time must be in the future";
  return null;
}

/** A schedule that reaches nobody is a mistake, not a quiet no-op: refuse it at save time. */
export function scheduleAudienceError(audience: { targetAll?: boolean; targetRoles?: readonly string[] }): string | null {
  if (audience.targetAll || (audience.targetRoles?.length ?? 0) > 0) return null;
  return "Choose an audience: everyone, or at least one role";
}

/**
 * Id of a `whatsapp/schedule.run` event, derived from the claim's run token. Inngest drops a
 * second event with the same id within 24 hours, so a re-sent copy of one claim's event never
 * queues a second run. Both producers (the tick and Run now) use this one form.
 */
export function scheduleRunEventId(runId: string): string {
  return `wa-schedule-run-${runId}`;
}
