/**
 * Has a cron run arrived much later than its schedule says it should?
 *
 * A function's trigger lives in two places: the code, and Inngest Cloud's copy
 * of the function list, which only changes when the app is re-synced. Nothing
 * re-syncs it on a DigitalOcean deploy, so the two drift apart silently. From
 * 2026-09-23 the job-alert digest declared an hourly cron and mailed only the
 * seekers whose own clock read 9am — while Inngest went on firing the old
 * once-a-day 09:00 UTC trigger, which is midday for the whole Gulf and Indian
 * audience. Every run found nobody due and no alert went out for five weeks
 * (issue #11).
 *
 * Code cannot see Inngest's copy, but it can see the gap between one of its
 * own runs and the last. That gap is what this measures. Pure — the caller
 * reads the previous run and writes the result.
 */

/**
 * The message a cron records when an admin has switched it off.
 *
 * Shared so the drift check can tell "the job was paused" from "the schedule is
 * wrong": the first run after a re-enable always follows a long gap.
 */
export const ADMIN_DISABLED_SKIP_MESSAGE = "Skipped — disabled by admin";

/** The slice of a stored cron run (`SystemConfig.cronJobs.<key>`) this reads. */
export interface CronRunRecord {
  lastRunAt?: Date | string | null;
  lastRunStatus?: string | null;
  lastRunMessage?: string | null;
}

export interface CronDrift {
  drifted: boolean;
  /** Hours since the previous run, one decimal. Present only when drifted. */
  gapHours?: number;
  /** Admin-facing explanation. Present only when drifted. */
  message?: string;
}

/**
 * Compare this run with the previous one.
 *
 * `graceMinutes` absorbs a late start or a slow run: an hourly job whose
 * previous run finished 1h50m ago is on schedule, one that last ran yesterday
 * is not.
 */
export function detectCronDrift(
  previous: CronRunRecord | null | undefined,
  now: Date,
  expectedEveryMinutes = 60,
  graceMinutes = 60,
): CronDrift {
  if (!previous?.lastRunAt) return { drifted: false };
  if (previous.lastRunMessage === ADMIN_DISABLED_SKIP_MESSAGE) return { drifted: false };

  const last = new Date(previous.lastRunAt).getTime();
  if (!Number.isFinite(last)) return { drifted: false };

  const gapMs = now.getTime() - last;
  if (gapMs <= (expectedEveryMinutes + graceMinutes) * 60_000) return { drifted: false };

  const gapHours = Math.round((gapMs / 3_600_000) * 10) / 10;
  const every = expectedEveryMinutes === 60 ? "every hour" : `every ${expectedEveryMinutes} minutes`;
  return {
    drifted: true,
    gapHours,
    message:
      `Ran ${gapHours}h after the previous run; this job should run ${every}. ` +
      "The Inngest app likely needs a resync, or this is the first run after a pause.",
  };
}
