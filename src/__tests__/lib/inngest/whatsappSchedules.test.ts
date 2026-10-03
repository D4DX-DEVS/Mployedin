/**
 * @jest-environment node
 */
export {};

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
const logger = { error: jest.fn(), info: jest.fn(), warn: jest.fn() };
jest.mock("@/lib/logger", () => ({ __esModule: true, default: { error: (...a: unknown[]) => logger.error(...a), info: (...a: unknown[]) => logger.info(...a), warn: (...a: unknown[]) => logger.warn(...a) } }));
const inngestSend = jest.fn().mockResolvedValue(undefined);
jest.mock("@/lib/inngest/client", () => ({ inngest: { createFunction: (config: unknown, handler: unknown) => ({ config, handler }), send: (...a: unknown[]) => inngestSend(...a) } }));
const isCronEnabled = jest.fn().mockResolvedValue(true);
const updateCronRunStatus = jest.fn().mockResolvedValue(undefined);
const getWhatsAppSettings = jest.fn();
jest.mock("@/models/SystemConfig", () => ({
  isCronEnabled: (...a: unknown[]) => isCronEnabled(...a),
  updateCronRunStatus: (...a: unknown[]) => updateCronRunStatus(...a),
  getWhatsAppSettings: (...a: unknown[]) => getWhatsAppSettings(...a),
}));
// Call order across the runtime helpers and the audience read, to prove the lock is renewed before each batch reads.
const order: string[] = [];
const claimDueSchedules = jest.fn().mockResolvedValue([{ scheduleId: "s1", runAt: "2026-09-29T12:00:00.000Z", runId: "run-1" }]);
const finalizeScheduleRun = jest.fn().mockResolvedValue(undefined);
const beginScheduleRun = jest.fn().mockResolvedValue(true);
const refreshScheduleLock = jest.fn(async (..._a: unknown[]) => { order.push("refresh"); return true; });
jest.mock("@/lib/communications/whatsapp/scheduleRuntime", () => ({
  claimDueSchedules: (...a: unknown[]) => claimDueSchedules(...a),
  finalizeScheduleRun: (...a: unknown[]) => finalizeScheduleRun(...a),
  beginScheduleRun: (...a: unknown[]) => beginScheduleRun(...a),
  refreshScheduleLock: (...a: unknown[]) => refreshScheduleLock(...a),
}));
const schedule = { _id: "s1", name: "Weekly jobs digest", template: { templateName: "mployedin_admin_announcement", language: "en", params: ["{{firstName}}", "{{message}}"] }, audience: { targetAll: false, targetRoles: ["job_seeker"] } };
const findById = jest.fn((..._a: unknown[]): { lean: () => Promise<unknown> } => ({ lean: async () => schedule }));
jest.mock("@/models/WhatsAppSchedule", () => ({ __esModule: true, default: { findById: (...a: unknown[]) => findById(...a) } }));
let pages: unknown[][] = [[{ _id: "u1", name: "A", phone: "+9715" }], []];
const userFind = jest.fn((..._a: unknown[]) => {
  order.push("find");
  return { sort: () => ({ limit: () => ({ select: () => ({ lean: async () => pages.shift() ?? [] }) }) }) };
});
jest.mock("@/models/User", () => ({ __esModule: true, default: { find: (...a: unknown[]) => userFind(...a) } }));
// broadcastRecipientQuery is deliberately NOT mocked: its real shape (a bare role string for one role) is what the runner must walk.
const sendWhatsAppToUsers = jest.fn().mockResolvedValue({ sent: 1, failed: 0, skipped: 0 });
jest.mock("@/lib/communications/whatsapp/audienceSend", () => ({ sendWhatsAppToUsers: (...a: unknown[]) => sendWhatsAppToUsers(...a) }));

import { whatsappScheduleTick, whatsappScheduleRunner } from "@/lib/inngest/whatsappSchedules";

const step = { run: async <T,>(_n: string, fn: () => Promise<T>) => fn() };
type Fn = { config: { id: string; concurrency?: { limit: number }; idempotency?: string; triggers: unknown[] }; handler: (a: { event?: { data: unknown }; step: typeof step }) => Promise<Record<string, unknown>> };
const tick = whatsappScheduleTick as unknown as Fn;
const runner = whatsappScheduleRunner as unknown as Fn;
const runEvent = { data: { scheduleId: "s1", runAt: "x", runId: "run-1" } };
const NO_AUDIENCE = { ...schedule, audience: { targetAll: false, targetRoles: [] as string[] } };

beforeEach(() => {
  jest.clearAllMocks();
  order.length = 0;
  pages = [[{ _id: "u1", name: "A", phone: "+9715" }], []];
  beginScheduleRun.mockResolvedValue(true);
  getWhatsAppSettings.mockResolvedValue({ enabled: true, dailyCapPerUser: 3, automations: {} });
});

describe("whatsappScheduleTick", () => {
  it("runs every five minutes", () => {
    expect(tick.config.id).toBe("whatsapp-schedule-tick");
    expect(tick.config.triggers).toEqual([{ cron: "*/5 * * * *" }]);
  });
  it("is limited to one concurrent run (free Inngest plan)", () => {
    expect(tick.config.concurrency).toEqual({ limit: 1 });
  });
  it("emits one run event per claimed schedule, carrying its run token and an event id derived from it, and records status", async () => {
    const res = await tick.handler({ step });
    expect(inngestSend).toHaveBeenCalledWith([{ id: "wa-schedule-run-run-1", name: "whatsapp/schedule.run", data: { scheduleId: "s1", runAt: "2026-09-29T12:00:00.000Z", runId: "run-1" } }]);
    expect(updateCronRunStatus).toHaveBeenCalledWith("whatsappScheduler", "success", "1 schedule(s) triggered");
    expect(res).toEqual({ triggered: 1 });
  });
  it("gives every emitted run event its own id, so Inngest drops a re-sent copy of any one of them", async () => {
    claimDueSchedules.mockResolvedValueOnce([
      { scheduleId: "s1", runAt: "2026-09-29T12:00:00.000Z", runId: "run-1" },
      { scheduleId: "s2", runAt: "2026-09-29T12:00:00.000Z", runId: "run-2" },
    ]);
    await tick.handler({ step });
    const sent = inngestSend.mock.calls[0][0] as { id: string; data: { runId: string } }[];
    expect(sent.map((e) => e.id)).toEqual(["wa-schedule-run-run-1", "wa-schedule-run-run-2"]);
    expect(sent.every((e) => e.id === `wa-schedule-run-${e.data.runId}`)).toBe(true);
  });
  it("emits nothing and records nothing when no schedule is due: two steps, not three, every five minutes", async () => {
    claimDueSchedules.mockResolvedValueOnce([]);
    const names: string[] = [];
    const res = await tick.handler({ step: { run: async <T,>(n: string, fn: () => Promise<T>) => { names.push(n); return fn(); } } });
    expect(inngestSend).not.toHaveBeenCalled();
    expect(updateCronRunStatus).not.toHaveBeenCalled();
    expect(names).toEqual(["check-enabled", "claim-due"]);
    expect(res).toEqual({ triggered: 0 });
  });
  it("does nothing when the admin disabled the cron", async () => {
    isCronEnabled.mockResolvedValueOnce(false);
    const res = await tick.handler({ step });
    expect(isCronEnabled).toHaveBeenCalledWith("whatsappScheduler");
    expect(claimDueSchedules).not.toHaveBeenCalled();
    expect(res).toEqual({ skipped: true, reason: "disabled by admin" });
  });
});

describe("whatsappScheduleRunner", () => {
  it("runs one at a time and listens for the schedule run event", () => {
    expect(runner.config.id).toBe("whatsapp-schedule-runner");
    expect(runner.config.concurrency).toEqual({ limit: 1 });
    expect(runner.config.triggers).toEqual([{ event: "whatsapp/schedule.run" }]);
  });
  it("lets Inngest start at most one run per run token, so a duplicate event never starts a second run", () => {
    // The DB cannot tell a re-executed begin step from a duplicate event carrying the same runId; only the
    // Inngest run identity can, so the runner is deduplicated on the token at the Inngest layer.
    expect(runner.config.idempotency).toBe("event.data.runId");
  });
  it("streams the audience in batches, sends, and finalizes", async () => {
    const res = await runner.handler({ event: runEvent, step });
    expect(sendWhatsAppToUsers).toHaveBeenCalledWith([{ _id: "u1", name: "A", phone: "+9715" }], schedule.template, { source: "schedule", category: "system", scheduleId: "s1", tokens: { title: "Weekly jobs digest" } });
    expect(finalizeScheduleRun).toHaveBeenCalledWith("s1", "run-1", "success", { sent: 1, failed: 0, skipped: 0 });
    expect(res).toEqual({ sent: 1, failed: 0, skipped: 0, batches: 1 });
  });
  it("walks the audience by _id cursor and sums every batch", async () => {
    pages = [[{ _id: "u1" }], [{ _id: "u2" }], []];
    sendWhatsAppToUsers.mockResolvedValueOnce({ sent: 1, failed: 0, skipped: 0 }).mockResolvedValueOnce({ sent: 0, failed: 0, skipped: 1 });
    const res = await runner.handler({ event: runEvent, step });
    expect(userFind).toHaveBeenNthCalledWith(1, { isActive: true, role: "job_seeker" });
    expect(userFind).toHaveBeenNthCalledWith(2, { isActive: true, role: "job_seeker", _id: { $gt: "u1" } });
    expect(userFind).toHaveBeenNthCalledWith(3, { isActive: true, role: "job_seeker", _id: { $gt: "u2" } });
    expect(finalizeScheduleRun).toHaveBeenCalledWith("s1", "run-1", "success", { sent: 1, failed: 0, skipped: 1 });
    expect(res).toEqual({ sent: 1, failed: 0, skipped: 1, batches: 2 });
  });
  it("marks partial when some sends failed and error when none succeeded", async () => {
    sendWhatsAppToUsers.mockResolvedValueOnce({ sent: 1, failed: 1, skipped: 0 });
    await runner.handler({ event: runEvent, step });
    expect(finalizeScheduleRun).toHaveBeenLastCalledWith("s1", "run-1", "partial", { sent: 1, failed: 1, skipped: 0 });
    pages = [[{ _id: "u1" }], []];
    sendWhatsAppToUsers.mockResolvedValueOnce({ sent: 0, failed: 1, skipped: 0 });
    await runner.handler({ event: runEvent, step });
    expect(finalizeScheduleRun).toHaveBeenLastCalledWith("s1", "run-1", "error", { sent: 0, failed: 1, skipped: 0 });
  });
  it("skips a deleted schedule", async () => {
    findById.mockReturnValueOnce({ lean: async () => null });
    expect(await runner.handler({ event: { data: { scheduleId: "gone", runAt: "x", runId: "run-1" } }, step })).toEqual({ skipped: true, reason: "schedule not found" });
    expect(sendWhatsAppToUsers).not.toHaveBeenCalled();
    expect(finalizeScheduleRun).not.toHaveBeenCalled();
  });

  describe("single-use run token", () => {
    it("consumes the token as its very first step, with the event's schedule and run ids", async () => {
      const names: string[] = [];
      const recording = { run: async <T,>(n: string, fn: () => Promise<T>) => { names.push(n); return fn(); } };
      await runner.handler({ event: runEvent, step: recording });
      expect(beginScheduleRun).toHaveBeenCalledWith("s1", "run-1", expect.any(Date));
      expect(names[0]).toBe("begin-run");
      expect(findById).toHaveBeenCalledTimes(1);
      expect(beginScheduleRun.mock.invocationCallOrder[0]).toBeLessThan(findById.mock.invocationCallOrder[0]);
    });
    it("sends nothing for a superseded or late event (begin refused the token)", async () => {
      beginScheduleRun.mockResolvedValueOnce(false);
      const res = await runner.handler({ event: runEvent, step });
      expect(res).toEqual({ skipped: true, reason: "stale_or_duplicate_run" });
      expect(findById).not.toHaveBeenCalled();
      expect(getWhatsAppSettings).not.toHaveBeenCalled();
      expect(userFind).not.toHaveBeenCalled();
      expect(sendWhatsAppToUsers).not.toHaveBeenCalled();
      expect(finalizeScheduleRun).not.toHaveBeenCalled();
      // A refusal is rare and means a send was suppressed, so it is visible at warn, with the schedule id only.
      expect(logger.warn).toHaveBeenCalledWith({ scheduleId: "s1" }, expect.stringContaining("stale or duplicate"));
      expect(logger.info).not.toHaveBeenCalled();
    });
    it("sends nothing for an event that carries no run token, without touching the database", async () => {
      const res = await runner.handler({ event: { data: { scheduleId: "s1", runAt: "x" } }, step });
      expect(res).toEqual({ skipped: true, reason: "stale_or_duplicate_run" });
      expect(beginScheduleRun).not.toHaveBeenCalled();
      expect(userFind).not.toHaveBeenCalled();
      expect(sendWhatsAppToUsers).not.toHaveBeenCalled();
      expect(finalizeScheduleRun).not.toHaveBeenCalled();
    });
    it("logs no phone numbers or names when it skips", async () => {
      beginScheduleRun.mockResolvedValueOnce(false);
      await runner.handler({ event: runEvent, step });
      expect(JSON.stringify(logger.warn.mock.calls)).not.toMatch(/\+9715|Weekly jobs digest|run-1/);
    });
  });

  describe("lock renewal and ownership", () => {
    it("renews the schedule lock, for this run, at the start of every batch step before that batch reads its users", async () => {
      pages = [[{ _id: "u1" }], [{ _id: "u2" }], []];
      sendWhatsAppToUsers.mockResolvedValue({ sent: 1, failed: 0, skipped: 0 });
      await runner.handler({ event: runEvent, step });
      expect(refreshScheduleLock).toHaveBeenCalledTimes(3); // two batches with users plus the empty one that ends the walk
      expect(refreshScheduleLock).toHaveBeenCalledWith("s1", "run-1", expect.any(Date));
      expect(order).toEqual(["refresh", "find", "refresh", "find", "refresh", "find"]);
    });

    it("stops without sending that batch, finalizing or touching the schedule when a batch finds the run superseded", async () => {
      pages = [[{ _id: "u1" }], [{ _id: "u2" }], []];
      sendWhatsAppToUsers.mockResolvedValue({ sent: 1, failed: 0, skipped: 0 });
      refreshScheduleLock.mockResolvedValueOnce(true).mockResolvedValueOnce(false);
      const names: string[] = [];
      const recording = { run: async <T,>(n: string, fn: () => Promise<T>) => { names.push(n); return fn(); } };
      const res = await runner.handler({ event: runEvent, step: recording });
      expect(res).toEqual({ superseded: true });
      // batch-0 ran normally; batch-1 was refused before it read a single user.
      expect(sendWhatsAppToUsers).toHaveBeenCalledTimes(1);
      expect(userFind).toHaveBeenCalledTimes(1);
      expect(names).toEqual(["begin-run", "load-schedule", "check-whatsapp-enabled", "batch-0", "batch-1"]);
      expect(finalizeScheduleRun).not.toHaveBeenCalled();
    });
    it("stops at the very first batch too, sending nothing", async () => {
      refreshScheduleLock.mockResolvedValueOnce(false);
      const res = await runner.handler({ event: runEvent, step });
      expect(res).toEqual({ superseded: true });
      expect(userFind).not.toHaveBeenCalled();
      expect(sendWhatsAppToUsers).not.toHaveBeenCalled();
      expect(finalizeScheduleRun).not.toHaveBeenCalled();
    });
    it("logs the supersession at warn with the schedule id only (no PII)", async () => {
      refreshScheduleLock.mockResolvedValueOnce(false);
      await runner.handler({ event: runEvent, step });
      // A missing row also fails the ownership check, so the wording must not claim it was always a newer claim.
      expect(logger.warn).toHaveBeenCalledWith(expect.objectContaining({ scheduleId: "s1" }), expect.stringContaining("superseded by a newer claim or deleted"));
      expect(JSON.stringify(logger.warn.mock.calls)).not.toMatch(/\+9715|Weekly jobs digest/);
    });
    it("hands its own run id to finalize, so only the run that still owns the schedule can close it", async () => {
      await runner.handler({ event: { data: { scheduleId: "s1", runAt: "x", runId: "run-9" } }, step });
      expect(refreshScheduleLock).toHaveBeenCalledWith("s1", "run-9", expect.any(Date));
      expect(finalizeScheduleRun).toHaveBeenCalledWith("s1", "run-9", "success", expect.any(Object));
    });
  });

  describe("WhatsApp master switch", () => {
    it("sends nothing when the switch is off, and records the run as an error that does not count as a run", async () => {
      getWhatsAppSettings.mockResolvedValue({ enabled: false, dailyCapPerUser: 3, automations: {} });
      const res = await runner.handler({ event: runEvent, step });
      expect(userFind).not.toHaveBeenCalled();
      expect(sendWhatsAppToUsers).not.toHaveBeenCalled();
      expect(finalizeScheduleRun).toHaveBeenCalledWith("s1", "run-1", "error", { sent: 0, failed: 0, skipped: 0 }, { countAsRun: false });
      expect(logger.warn).toHaveBeenCalledWith(expect.objectContaining({ scheduleId: "s1" }), expect.stringContaining("switched off"));
      expect(res).toEqual({ skipped: true, reason: "whatsapp switched off" });
    });
    it("does not look at the switch for a schedule that no longer exists", async () => {
      findById.mockReturnValueOnce({ lean: async () => null });
      await runner.handler({ event: { data: { scheduleId: "gone", runAt: "x", runId: "run-1" } }, step });
      expect(getWhatsAppSettings).not.toHaveBeenCalled();
    });
  });

  describe("runtime audience guard", () => {
    it("never streams an empty audience (that query is every active user, staff included); records an error that does not count as a run", async () => {
      findById.mockReturnValueOnce({ lean: async () => NO_AUDIENCE });
      const res = await runner.handler({ event: runEvent, step });
      expect(userFind).not.toHaveBeenCalled();
      expect(sendWhatsAppToUsers).not.toHaveBeenCalled();
      expect(finalizeScheduleRun).toHaveBeenCalledWith("s1", "run-1", "error", { sent: 0, failed: 0, skipped: 0 }, { countAsRun: false });
      expect(logger.error).toHaveBeenCalledWith(expect.objectContaining({ scheduleId: "s1" }), expect.stringContaining("audience"));
      expect(res).toEqual({ skipped: true, reason: "no audience" });
    });
    it("still sends to everyone when the schedule targets all", async () => {
      findById.mockReturnValueOnce({ lean: async () => ({ ...schedule, audience: { targetAll: true, targetRoles: [] } }) });
      await runner.handler({ event: runEvent, step });
      expect(userFind).toHaveBeenNthCalledWith(1, { isActive: true });
      expect(sendWhatsAppToUsers).toHaveBeenCalledTimes(1);
    });
  });
});
