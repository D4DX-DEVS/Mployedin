// src/lib/communications/whatsapp/scheduleRuntime.ts
/**
 * DB side of schedules: atomic claiming for the tick and for Run now, and run
 * bookkeeping for the runner.
 *
 * A schedule is sent to its audience at most once per claim, in layers:
 *  1. Each path claims atomically: the tick's claim is a conditional update on
 *     {_id, nextRunAt, lock}, Run now's one on the lock and the run gap, so two
 *     overlapping ticks, two clicks, or a click and a tick never both win.
 *  2. The claim writes a single-use token (`activeRunId`) and carries it in the run
 *     event; the runner consumes it in its first step (beginScheduleRun), which moves
 *     it to `runningRunId`, so an event whose claim was superseded finds neither and
 *     sends nothing.
 *  3. A started run keeps that ownership while it streams: it checks it
 *     (refreshScheduleLock) before every batch and closes with it (finalizeScheduleRun),
 *     and every new claim clears it, so a run whose lock lapsed and was superseded
 *     stops at its next batch.
 *  4. A duplicate event carrying the same token is NOT stopped here: beginScheduleRun
 *     must stay idempotent for a re-executed begin step, and a duplicate event looks
 *     exactly like one. Inngest drops it instead (idempotency on the runner, an event
 *     id on both producers; see inngest/whatsappSchedules.ts).
 *
 * Every write here is runtime bookkeeping and passes `timestamps: false`, so
 * `updatedAt` keeps meaning "an admin edited this schedule".
 */
import { randomUUID } from "node:crypto";
import logger from "@/lib/logger";
import WhatsAppSchedule from "@/models/WhatsAppSchedule";
import { computeNextRunAt } from "./schedule";

/**
 * A claim that has not started yet holds this lock (claim -> begin-run). If the event
 * is never consumed it lapses, and the tick or Run now may claim again.
 */
export const SCHEDULE_LOCK_MS = 10 * 60 * 1000;

/**
 * A started run holds this lock, renewed before every batch. It is far longer than
 * SCHEDULE_LOCK_MS because Inngest's concurrency limit counts executing steps, not runs:
 * with the runner at concurrency 1, the runs queued by each 5-minute tick (up to 20 per
 * tick, so the queue can grow past 20 while earlier ones are still streaming) plus Run now
 * runs interleave their batch steps in one slot, so the gap between two batches of one run
 * grows with how many runs are queued.
 *
 * ponytail: a run that crashes mid-way (there is no onFailure handler yet) holds the lock for
 * up to this long, which holds off both Run now (it answers `run_in_progress`) and the tick
 * (it skips the schedule until the lock lapses); a run that stalls longer than this between
 * two batches is superseded by the next claim, so the users in its already-sent batches get
 * the message again from the new run; and if that superseding Run now then fails to queue
 * its event, the stalled run has already lost ownership and is never finished, so it records
 * no `lastRunStatus`. All three are accepted limits.
 */
export const SCHEDULE_RUN_LOCK_MS = 60 * 60 * 1000;

const TICK_MS = 5 * 60 * 1000;
/**
 * Runtime backstop for the once-per-hour floor that validation enforces at write
 * time: a row that bypassed validation (a direct edit, a cron the validator later
 * tightened) is not run again within an hour of its last run, and neither is a
 * Run now. One tick of slack is deliberate: `lastRunAt` is stamped when a run
 * finishes, a few minutes after the tick that claimed it, so a strict 60 would
 * refuse every legitimate hourly schedule and push it five minutes later each cycle.
 */
export const MIN_RUN_GAP_MS = 60 * 60 * 1000 - TICK_MS;

const NO_TIMESTAMPS = { timestamps: false } as const;

interface DueSchedule {
  _id: unknown;
  kind: "once" | "recurring";
  cron?: string;
  runAt?: Date;
  timezone: string;
  nextRunAt?: Date;
  lastRunAt?: Date;
}

/** One claimed occurrence: the payload of its `whatsapp/schedule.run` event. */
export interface ClaimedSchedule {
  scheduleId: string;
  runAt: string;
  runId: string;
}

const lockUntil = (now: Date): Date => new Date(now.getTime() + SCHEDULE_LOCK_MS);
const runLockUntil = (now: Date): Date => new Date(now.getTime() + SCHEDULE_RUN_LOCK_MS);

/** No lock, or one that has lapsed: the tick's find and its claim update must agree on this. */
const lockLapsed = (now: Date) => [{ lockedUntil: { $exists: false } }, { lockedUntil: null }, { lockedUntil: { $lt: now } }];

export async function claimDueSchedules(now: Date, limit = 20): Promise<ClaimedSchedule[]> {
  const due = (await WhatsAppSchedule.find({
    enabled: true,
    nextRunAt: { $lte: now },
    $or: lockLapsed(now),
  })
    .sort({ nextRunAt: 1 })
    .limit(limit)
    .lean()) as DueSchedule[];

  const claimed: ClaimedSchedule[] = [];
  for (const s of due) {
    const scheduleId = String(s._id);

    // Left untouched, not advanced: the occurrence stays due and runs on the first
    // tick after the gap has passed, instead of being dropped.
    if (s.lastRunAt && now.getTime() - new Date(s.lastRunAt).getTime() < MIN_RUN_GAP_MS) {
      logger.warn({ scheduleId, lastRunAt: s.lastRunAt }, "[whatsapp-schedule] not run: it last ran less than an hour ago");
      continue;
    }

    const next = s.kind === "recurring" ? computeNextRunAt({ kind: "recurring", cron: s.cron, timezone: s.timezone }, now) : null;

    // Both updates below require `enabled: true`, so a pause that lands between the
    // find above and this write wins instead of being claimed over.
    if (s.kind === "recurring" && !next) {
      // null is "cannot compute" for a recurring row (bad cron or timezone), not "finished".
      // Sending now would fire a schedule that can never fire again, so it is recorded as
      // an error and switched off where the admin will see it, and nothing is sent.
      // lastRunAt is deliberately not stamped: nothing ran, and stamping it would make Run
      // now answer too_soon for an hour after the admin fixes the cron.
      // The lock clause is repeated from the find, as in the claim below: a Run now claim that landed
      // since then holds the lock, and switching the row off must not clear it.
      const res = await WhatsAppSchedule.updateOne(
        { _id: s._id, nextRunAt: s.nextRunAt, enabled: true, $or: lockLapsed(now) },
        {
          $set: { nextRunAt: null, enabled: false, lastRunStatus: "error", lastRunSummary: { sent: 0, failed: 0, skipped: 0 } },
          $unset: { lockedUntil: 1 },
        },
        NO_TIMESTAMPS,
      );
      if (res.modifiedCount === 1) {
        logger.error({ scheduleId, cron: s.cron, timezone: s.timezone }, "[whatsapp-schedule] recurring schedule has no next run (invalid cron or timezone); switched off and not sent");
      }
      continue;
    }

    const runId = randomUUID();
    const $set: Record<string, unknown> = { lockedUntil: lockUntil(now), nextRunAt: next, activeRunId: runId };
    if (s.kind === "once") $set.enabled = false;
    // The lock clause is repeated from the find: a Run now claim that landed since then holds the
    // lock and must not be overwritten. runningRunId is dropped so a stalled run is superseded.
    const res = await WhatsAppSchedule.updateOne(
      { _id: s._id, nextRunAt: s.nextRunAt, enabled: true, $or: lockLapsed(now) },
      { $set, $unset: { runningRunId: 1 } },
      NO_TIMESTAMPS,
    );
    if (res.modifiedCount === 1) claimed.push({ scheduleId, runAt: now.toISOString(), runId });
  }
  return claimed;
}

/**
 * Run now: claim a run of this schedule in ONE atomic update, so two clicks (or a click and a
 * tick) can never both win. It requires no live lock and no run within MIN_RUN_GAP_MS, and
 * deliberately not `enabled`: a paused schedule, or a one-off the tick already spent, can be
 * run by hand. On a miss the row is read once, only to say why.
 */
export async function claimScheduleNow(
  scheduleId: string,
  now: Date,
): Promise<{ ok: true; runId: string } | { ok: false; reason: "not_found" | "run_in_progress" | "too_soon" }> {
  const runId = randomUUID();
  const res = await WhatsAppSchedule.updateOne(
    {
      _id: scheduleId,
      $and: [
        { $or: [{ lockedUntil: { $exists: false } }, { lockedUntil: null }, { lockedUntil: { $lte: now } }] },
        { $or: [{ lastRunAt: { $exists: false } }, { lastRunAt: null }, { lastRunAt: { $lte: new Date(now.getTime() - MIN_RUN_GAP_MS) } }] },
      ],
    },
    { $set: { lockedUntil: lockUntil(now), activeRunId: runId }, $unset: { runningRunId: 1 } },
    NO_TIMESTAMPS,
  );
  if (res.modifiedCount === 1) return { ok: true, runId };

  const row = (await WhatsAppSchedule.findById(scheduleId).select("lockedUntil lastRunAt").lean()) as { lockedUntil?: Date | null; lastRunAt?: Date | null } | null;
  if (!row) return { ok: false, reason: "not_found" };
  if (row.lockedUntil && new Date(row.lockedUntil).getTime() > now.getTime()) return { ok: false, reason: "run_in_progress" };
  return { ok: false, reason: "too_soon" };
}

/**
 * Gives a claim back when its event could not be queued. Matches on the token, so it never
 * releases a newer claim. An empty token is refused here because `undefined` in a filter
 * is sent as null, which matches every row that has no token.
 */
export async function releaseScheduleClaim(scheduleId: string, runId: string): Promise<void> {
  if (!runId) return;
  await WhatsAppSchedule.updateOne({ _id: scheduleId, activeRunId: runId }, { $unset: { activeRunId: 1, lockedUntil: 1 } }, NO_TIMESTAMPS);
}

/**
 * Consumes the single-use claim token and takes ownership of the run: true for the event that
 * holds the token, false for one whose claim was superseded after its lock lapsed. Matches on
 * `matchedCount`, so a begin step that executes twice for the same run (a replay) still answers
 * true instead of looking superseded. For the same reason it cannot refuse a duplicate event
 * with the same token; Inngest's idempotency on the runner does that. Gives the run the long lock.
 */
export async function beginScheduleRun(scheduleId: string, runId: string, now: Date): Promise<boolean> {
  if (!runId) return false;
  const res = await WhatsAppSchedule.updateOne(
    { _id: scheduleId, $or: [{ activeRunId: runId }, { runningRunId: runId }] },
    { $set: { runningRunId: runId, lockedUntil: runLockUntil(now) }, $unset: { activeRunId: 1 } },
    NO_TIMESTAMPS,
  );
  return res.matchedCount === 1;
}

/**
 * Called at the start of every batch: renews the run's lock, but only while the run still owns the
 * schedule. False means a newer claim superseded it (its lock had lapsed), and the caller must stop
 * without sending that batch. An empty `runId` is refused here for the same reason as above.
 */
export async function refreshScheduleLock(scheduleId: string, runId: string, now: Date): Promise<boolean> {
  if (!runId) return false;
  const res = await WhatsAppSchedule.updateOne({ _id: scheduleId, runningRunId: runId }, { $set: { lockedUntil: runLockUntil(now) } }, NO_TIMESTAMPS);
  return res.matchedCount === 1;
}

/**
 * Records how a run ended and releases its lock and ownership, but only while the run still owns the
 * schedule: a superseded run changes nothing (and does not touch `activeRunId`, so a newer claim's
 * token survives). `lastRunAt` is the clock the once-per-hour gap is measured from, so it is stamped
 * only when the run counts: pass `countAsRun: false` when nothing was sent (switch off, no audience).
 */
export async function finalizeScheduleRun(
  scheduleId: string,
  runId: string,
  status: "success" | "error" | "partial",
  summary: { sent: number; failed: number; skipped: number },
  options: { countAsRun?: boolean } = {},
): Promise<void> {
  if (!runId) {
    logger.warn({ scheduleId }, "[whatsapp-schedule] run not finalized: no run id");
    return;
  }
  const { countAsRun = true } = options;
  const $set: Record<string, unknown> = { lastRunStatus: status, lastRunSummary: summary };
  if (countAsRun) $set.lastRunAt = new Date();
  const res = await WhatsAppSchedule.updateOne({ _id: scheduleId, runningRunId: runId }, { $set, $unset: { runningRunId: 1, lockedUntil: 1 } }, NO_TIMESTAMPS);
  if (res.matchedCount === 0) logger.warn({ scheduleId, runId }, "[whatsapp-schedule] run not finalized: it was superseded by a newer claim or deleted");
}
