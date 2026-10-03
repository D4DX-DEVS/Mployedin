/**
 * @jest-environment node
 */
export {};

const find = jest.fn();
const updateOne = jest.fn();
const findById = jest.fn();
jest.mock("@/models/WhatsAppSchedule", () => ({
  __esModule: true,
  default: { find: (...a: unknown[]) => find(...a), updateOne: (...a: unknown[]) => updateOne(...a), findById: (...a: unknown[]) => findById(...a) },
}));
const logger = { error: jest.fn(), warn: jest.fn(), info: jest.fn() };
jest.mock("@/lib/logger", () => ({ __esModule: true, default: { error: (...a: unknown[]) => logger.error(...a), warn: (...a: unknown[]) => logger.warn(...a), info: (...a: unknown[]) => logger.info(...a) } }));

import {
  beginScheduleRun,
  claimDueSchedules,
  claimScheduleNow,
  finalizeScheduleRun,
  MIN_RUN_GAP_MS,
  refreshScheduleLock,
  releaseScheduleClaim,
  SCHEDULE_LOCK_MS,
  SCHEDULE_RUN_LOCK_MS,
} from "@/lib/communications/whatsapp/scheduleRuntime";

const now = new Date("2026-09-29T12:03:00Z");
const minutesAgo = (m: number) => new Date(now.getTime() - m * 60 * 1000);
const recurring = { _id: "s1", kind: "recurring", cron: "0 16 * * *", timezone: "Asia/Dubai", nextRunAt: new Date("2026-09-29T12:00:00Z") };
const once = { _id: "s2", kind: "once", runAt: new Date("2026-09-29T12:00:00Z"), timezone: "Asia/Dubai", nextRunAt: new Date("2026-09-29T12:00:00Z") };

/** Bookkeeping must not bump updatedAt: it means "an admin edited this schedule". */
const NO_TIMESTAMPS = { timestamps: false };
/** An unconsumed claim holds the short lock; a started run holds the long one. */
const lockUntil = new Date(now.getTime() + SCHEDULE_LOCK_MS);
const runLockUntil = new Date(now.getTime() + SCHEDULE_RUN_LOCK_MS);
/** The lock clause the tick's find and its claim update both carry. */
const lockLapsed = [{ lockedUntil: { $exists: false } }, { lockedUntil: null }, { lockedUntil: { $lt: now } }];

function due(...rows: unknown[]) {
  find.mockReturnValue({ sort: () => ({ limit: () => ({ lean: async () => rows }) }) });
}

beforeEach(() => {
  jest.clearAllMocks();
  due(recurring, once);
  updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });
});

describe("lock periods", () => {
  it("keeps 10 minutes for an unconsumed claim and gives a started run 60 minutes", () => {
    expect(SCHEDULE_LOCK_MS).toBe(10 * 60 * 1000);
    expect(SCHEDULE_RUN_LOCK_MS).toBe(60 * 60 * 1000);
  });
});

describe("claimDueSchedules", () => {
  it("queries due, unlocked schedules and claims each atomically on its nextRunAt, stamping a fresh run token", async () => {
    const claimed = await claimDueSchedules(now);
    expect(find).toHaveBeenCalledWith({ enabled: true, nextRunAt: { $lte: now }, $or: [{ lockedUntil: { $exists: false } }, { lockedUntil: null }, { lockedUntil: { $lt: now } }] });
    expect(claimed).toEqual([
      { scheduleId: "s1", runAt: now.toISOString(), runId: expect.any(String) },
      { scheduleId: "s2", runAt: now.toISOString(), runId: expect.any(String) },
    ]);
    // recurring: locked, next occurrence computed (16:00 Dubai = 12:00Z tomorrow), token written. A pause or a
    // Run now claim that lands between the find and this update wins, because the filter requires enabled and
    // an unlocked row. The claim also drops runningRunId, so a stalled run whose lock lapsed is superseded.
    expect(updateOne.mock.calls[0]).toEqual([
      { _id: "s1", nextRunAt: recurring.nextRunAt, enabled: true, $or: lockLapsed },
      { $set: { lockedUntil: lockUntil, nextRunAt: new Date("2026-09-30T12:00:00.000Z"), activeRunId: claimed[0].runId }, $unset: { runningRunId: 1 } },
      NO_TIMESTAMPS,
    ]);
    // once: locked, disabled, no next run
    expect(updateOne.mock.calls[1]).toEqual([
      { _id: "s2", nextRunAt: once.nextRunAt, enabled: true, $or: lockLapsed },
      { $set: { lockedUntil: lockUntil, nextRunAt: null, enabled: false, activeRunId: claimed[1].runId }, $unset: { runningRunId: 1 } },
      NO_TIMESTAMPS,
    ]);
  });
  it("re-checks the lock in the claim update itself, so a Run now claim that landed after the find is never overwritten", async () => {
    await claimDueSchedules(now);
    for (const [filter] of updateOne.mock.calls) expect(filter.$or).toEqual(lockLapsed);
  });
  it("unsets runningRunId on every claim it writes", async () => {
    await claimDueSchedules(now);
    for (const [, update] of updateOne.mock.calls) expect(update.$unset).toEqual({ runningRunId: 1 });
  });
  it("gives every claimed run its own token", async () => {
    const claimed = await claimDueSchedules(now);
    expect(claimed[0].runId).not.toBe(claimed[1].runId);
    expect(claimed[0].runId.length).toBeGreaterThan(10);
  });
  it("skips a schedule another tick claimed first", async () => {
    updateOne.mockResolvedValueOnce({ modifiedCount: 0 }).mockResolvedValueOnce({ modifiedCount: 1 });
    expect(await claimDueSchedules(now)).toEqual([{ scheduleId: "s2", runAt: now.toISOString(), runId: expect.any(String) }]);
  });
  it("passes the limit through", async () => {
    const limit = jest.fn(() => ({ lean: async () => [] }));
    find.mockReturnValue({ sort: () => ({ limit }) });
    await claimDueSchedules(now, 5);
    expect(limit).toHaveBeenCalledWith(5);
  });

  describe("a recurring schedule whose next run cannot be computed", () => {
    // Nothing was sent, so lastRunAt is not stamped: stamping it would make Run now answer too_soon for an hour
    // after the admin fixes the cron.
    // The lock clause is repeated from the find, as in the normal claim: a Run now claim that landed since then
    // holds the lock, and switching the row off under it would drop that run's lock along with the schedule.
    const erroredUpdate = (id: string, nextRunAt: Date) => [
      { _id: id, nextRunAt, enabled: true, $or: lockLapsed },
      {
        $set: { nextRunAt: null, enabled: false, lastRunStatus: "error", lastRunSummary: { sent: 0, failed: 0, skipped: 0 } },
        $unset: { lockedUntil: 1 },
      },
      NO_TIMESTAMPS,
    ];

    it.each([
      ["an unparseable cron", { ...recurring, _id: "bad-cron", cron: "not a cron" }],
      ["a missing cron", { ...recurring, _id: "no-cron", cron: undefined }],
      ["an unknown timezone", { ...recurring, _id: "bad-zone", timezone: "Mars/Phobos" }],
    ])("is finalized as an error, disabled and never run (%s)", async (_label, row) => {
      due(row);
      expect(await claimDueSchedules(now)).toEqual([]);
      expect(updateOne).toHaveBeenCalledTimes(1);
      expect(updateOne.mock.calls[0]).toEqual(erroredUpdate(row._id, row.nextRunAt));
      expect(updateOne.mock.calls[0][1].$set).not.toHaveProperty("lastRunAt");
      expect(logger.error).toHaveBeenCalledWith(expect.objectContaining({ scheduleId: row._id }), expect.stringContaining("no next run"));
    });

    it("does not log (or claim) when another tick already handled it", async () => {
      due({ ...recurring, cron: "not a cron" });
      updateOne.mockResolvedValueOnce({ modifiedCount: 0 });
      expect(await claimDueSchedules(now)).toEqual([]);
      expect(logger.error).not.toHaveBeenCalled();
    });

    it("still claims the healthy schedules around it", async () => {
      due({ ...recurring, _id: "bad", cron: "not a cron" }, once);
      expect(await claimDueSchedules(now)).toEqual([{ scheduleId: "s2", runAt: now.toISOString(), runId: expect.any(String) }]);
    });
  });

  describe("once-per-hour backstop", () => {
    it("leaves a schedule untouched when it last ran under an hour ago, and logs it", async () => {
      due({ ...recurring, lastRunAt: minutesAgo(30) });
      expect(await claimDueSchedules(now)).toEqual([]);
      expect(updateOne).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith(expect.objectContaining({ scheduleId: "s1" }), expect.stringContaining("last ran"));
    });

    it("applies to a one-time schedule too, deferring rather than dropping it", async () => {
      due({ ...once, lastRunAt: minutesAgo(10) });
      expect(await claimDueSchedules(now)).toEqual([]);
      expect(updateOne).not.toHaveBeenCalled();
    });

    it("lets an hourly schedule through when its previous run finished a few minutes after it started", async () => {
      // Last run was claimed on the previous hour's tick and finalized ~3 min later:
      // 57 minutes ago. Refusing that would push every hourly schedule 5 minutes later each cycle.
      due({ ...recurring, lastRunAt: minutesAgo(57) });
      expect(await claimDueSchedules(now)).toEqual([{ scheduleId: "s1", runAt: now.toISOString(), runId: expect.any(String) }]);
      expect(logger.warn).not.toHaveBeenCalled();
    });

    it("runs a schedule that last ran more than an hour ago", async () => {
      due({ ...recurring, lastRunAt: minutesAgo(61) });
      expect(await claimDueSchedules(now)).toEqual([{ scheduleId: "s1", runAt: now.toISOString(), runId: expect.any(String) }]);
    });

    it("runs a schedule that has never run", async () => {
      due({ ...recurring, lastRunAt: undefined });
      expect(await claimDueSchedules(now)).toHaveLength(1);
    });
  });
});

describe("MIN_RUN_GAP_MS", () => {
  it("is the single 55-minute, finish-anchored gap (an hour minus one tick)", () => {
    expect(MIN_RUN_GAP_MS).toBe(55 * 60 * 1000);
  });
});

describe("claimScheduleNow", () => {
  const cutoff = new Date(now.getTime() - MIN_RUN_GAP_MS);

  it("claims in ONE atomic update: unlocked and not run within the gap, then locks, stamps a run token and drops any running run's ownership", async () => {
    const res = await claimScheduleNow("s1", now);
    expect(res).toEqual({ ok: true, runId: expect.any(String) });
    expect(updateOne).toHaveBeenCalledTimes(1);
    expect(findById).not.toHaveBeenCalled();
    const runId = (res as { runId: string }).runId;
    expect(updateOne.mock.calls[0]).toEqual([
      {
        _id: "s1",
        $and: [
          { $or: [{ lockedUntil: { $exists: false } }, { lockedUntil: null }, { lockedUntil: { $lte: now } }] },
          { $or: [{ lastRunAt: { $exists: false } }, { lastRunAt: null }, { lastRunAt: { $lte: cutoff } }] },
        ],
      },
      { $set: { lockedUntil: lockUntil, activeRunId: runId }, $unset: { runningRunId: 1 } },
      NO_TIMESTAMPS,
    ]);
  });
  it("does not require the schedule to be enabled (a paused or spent one-off can be run now)", async () => {
    await claimScheduleNow("s1", now);
    expect(JSON.stringify(updateOne.mock.calls[0][0])).not.toContain("enabled");
  });
  it("hands a different token to every claim", async () => {
    const a = await claimScheduleNow("s1", now);
    const b = await claimScheduleNow("s1", now);
    expect((a as { runId: string }).runId).not.toBe((b as { runId: string }).runId);
  });

  describe("when the atomic update matches nothing", () => {
    const lost = (row: unknown) => {
      updateOne.mockResolvedValueOnce({ modifiedCount: 0 });
      findById.mockReturnValue({ select: () => ({ lean: async () => row }) });
    };

    it("says not_found when the schedule is gone", async () => {
      lost(null);
      expect(await claimScheduleNow("gone", now)).toEqual({ ok: false, reason: "not_found" });
    });
    it("says run_in_progress while a lock is still live", async () => {
      lost({ lockedUntil: new Date(now.getTime() + 60_000), lastRunAt: minutesAgo(200) });
      expect(await claimScheduleNow("s1", now)).toEqual({ ok: false, reason: "run_in_progress" });
    });
    it("says run_in_progress rather than too_soon when both a live lock and a recent run apply", async () => {
      lost({ lockedUntil: new Date(now.getTime() + 60_000), lastRunAt: minutesAgo(5) });
      expect(await claimScheduleNow("s1", now)).toEqual({ ok: false, reason: "run_in_progress" });
    });
    it("says too_soon when the last run is inside the gap and nothing holds a lock", async () => {
      lost({ lastRunAt: minutesAgo(30) });
      expect(await claimScheduleNow("s1", now)).toEqual({ ok: false, reason: "too_soon" });
    });
    it("treats a lapsed lock as no lock", async () => {
      lost({ lockedUntil: new Date(now.getTime() - 60_000), lastRunAt: minutesAgo(30) });
      expect(await claimScheduleNow("s1", now)).toEqual({ ok: false, reason: "too_soon" });
    });
    it("reads only the two fields it classifies on", async () => {
      const select = jest.fn(() => ({ lean: async () => ({ lastRunAt: minutesAgo(1) }) }));
      updateOne.mockResolvedValueOnce({ modifiedCount: 0 });
      findById.mockReturnValue({ select });
      await claimScheduleNow("s1", now);
      expect(findById).toHaveBeenCalledWith("s1");
      expect(select).toHaveBeenCalledWith("lockedUntil lastRunAt");
    });
  });
});

describe("beginScheduleRun", () => {
  it("moves the claim token to runningRunId atomically and gives the started run the long lock", async () => {
    expect(await beginScheduleRun("s1", "run-1", now)).toBe(true);
    expect(updateOne).toHaveBeenCalledWith(
      { _id: "s1", $or: [{ activeRunId: "run-1" }, { runningRunId: "run-1" }] },
      { $set: { runningRunId: "run-1", lockedUntil: runLockUntil }, $unset: { activeRunId: 1 } },
      NO_TIMESTAMPS,
    );
  });
  it("is idempotent: a re-executed begin step for the run that already started still matches and returns true", async () => {
    // The token is already gone (moved to runningRunId) and the write changes nothing, so matchedCount, not modifiedCount, is what counts.
    updateOne.mockResolvedValueOnce({ matchedCount: 1, modifiedCount: 0 });
    expect(await beginScheduleRun("s1", "run-1", now)).toBe(true);
  });
  it("is false for a superseded or late event (it holds neither the token nor the run)", async () => {
    updateOne.mockResolvedValueOnce({ matchedCount: 0, modifiedCount: 0 });
    expect(await beginScheduleRun("s1", "run-1", now)).toBe(false);
  });
  it("never matches on an empty token (undefined in a filter would match every row that has no token)", async () => {
    expect(await beginScheduleRun("s1", "", now)).toBe(false);
    expect(await beginScheduleRun("s1", undefined as unknown as string, now)).toBe(false);
    expect(updateOne).not.toHaveBeenCalled();
  });
});

describe("releaseScheduleClaim", () => {
  it("drops the token and the lock, but only for the claim that is still current", async () => {
    await releaseScheduleClaim("s1", "run-1");
    expect(updateOne).toHaveBeenCalledWith({ _id: "s1", activeRunId: "run-1" }, { $unset: { activeRunId: 1, lockedUntil: 1 } }, NO_TIMESTAMPS);
  });
  it("does nothing for an empty token", async () => {
    await releaseScheduleClaim("s1", "");
    expect(updateOne).not.toHaveBeenCalled();
  });
});

describe("refreshScheduleLock", () => {
  it("renews the long lock only for the run that owns the schedule, and says so", async () => {
    expect(await refreshScheduleLock("s1", "run-1", now)).toBe(true);
    expect(updateOne).toHaveBeenCalledWith({ _id: "s1", runningRunId: "run-1" }, { $set: { lockedUntil: runLockUntil } }, NO_TIMESTAMPS);
  });
  it("is false when the run no longer owns the schedule (a newer claim superseded it), and does not renew anything for it", async () => {
    updateOne.mockResolvedValueOnce({ matchedCount: 0, modifiedCount: 0 });
    expect(await refreshScheduleLock("s1", "run-1", now)).toBe(false);
  });
  it("is true when the lock was already that far out (matched, nothing modified)", async () => {
    updateOne.mockResolvedValueOnce({ matchedCount: 1, modifiedCount: 0 });
    expect(await refreshScheduleLock("s1", "run-1", now)).toBe(true);
  });
  it("is false for an empty run id without querying (undefined in a filter would match every row that has no owner)", async () => {
    expect(await refreshScheduleLock("s1", "", now)).toBe(false);
    expect(await refreshScheduleLock("s1", undefined as unknown as string, now)).toBe(false);
    expect(updateOne).not.toHaveBeenCalled();
  });
});

describe("finalizeScheduleRun", () => {
  it("records the run, stamps lastRunAt, and releases the lock and the ownership of that run", async () => {
    await finalizeScheduleRun("s1", "run-1", "partial", { sent: 10, failed: 2, skipped: 3 });
    expect(updateOne).toHaveBeenCalledWith(
      { _id: "s1", runningRunId: "run-1" },
      { $set: { lastRunAt: expect.any(Date), lastRunStatus: "partial", lastRunSummary: { sent: 10, failed: 2, skipped: 3 } }, $unset: { runningRunId: 1, lockedUntil: 1 } },
      NO_TIMESTAMPS,
    );
  });
  it("leaves activeRunId alone, so a newer claim's token survives a late finalize", async () => {
    await finalizeScheduleRun("s1", "run-1", "success", { sent: 1, failed: 0, skipped: 0 });
    expect(updateOne.mock.calls[0][1].$unset).not.toHaveProperty("activeRunId");
  });
  it("with countAsRun: false records the outcome and releases the lock but leaves lastRunAt alone", async () => {
    await finalizeScheduleRun("s1", "run-1", "error", { sent: 0, failed: 0, skipped: 0 }, { countAsRun: false });
    const [filter, update, options] = updateOne.mock.calls[0];
    expect(filter).toEqual({ _id: "s1", runningRunId: "run-1" });
    expect(update.$set).toEqual({ lastRunStatus: "error", lastRunSummary: { sent: 0, failed: 0, skipped: 0 } });
    expect(update.$set).not.toHaveProperty("lastRunAt");
    expect(update.$unset).toEqual({ runningRunId: 1, lockedUntil: 1 });
    expect(options).toEqual(NO_TIMESTAMPS);
  });
  it("counts the run by default and when countAsRun is true", async () => {
    await finalizeScheduleRun("s1", "run-1", "success", { sent: 1, failed: 0, skipped: 0 }, { countAsRun: true });
    expect(updateOne.mock.calls[0][1].$set).toHaveProperty("lastRunAt");
  });
  it("for a superseded run (it no longer owns the schedule) matches nothing, logs a warning with the ids only, and returns", async () => {
    updateOne.mockResolvedValueOnce({ matchedCount: 0, modifiedCount: 0 });
    await expect(finalizeScheduleRun("s1", "run-1", "success", { sent: 5, failed: 0, skipped: 0 })).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledWith(expect.objectContaining({ scheduleId: "s1", runId: "run-1" }), expect.stringContaining("superseded by a newer claim or deleted"));
  });
  it("does not warn when the run finalizes normally", async () => {
    await finalizeScheduleRun("s1", "run-1", "success", { sent: 1, failed: 0, skipped: 0 });
    expect(logger.warn).not.toHaveBeenCalled();
  });
  it("never matches on an empty run id (undefined in a filter would match every row that has no owner)", async () => {
    await finalizeScheduleRun("s1", "", "success", { sent: 1, failed: 0, skipped: 0 });
    expect(updateOne).not.toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalled();
  });
});
