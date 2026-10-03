/**
 * @jest-environment node
 */
import { NextRequest, NextResponse } from "next/server";

let ctxRole = "admin";
const ADMIN_ID = "64d000000000000000000001";
const SCHEDULE_ID = "64d0000000000000000000aa";
jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
const logActivity = jest.fn().mockResolvedValue(undefined);
jest.mock("@/lib/audit/log", () => ({ logActivity: (...a: unknown[]) => logActivity(...a), actorFromCtx: () => ({ userId: ADMIN_ID, userRole: "admin" }) }));
jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: (req: NextRequest, ctx: unknown) => Promise<Response>) => async (req: NextRequest) => {
    try { return await handler(req, { userId: ADMIN_ID, role: ctxRole, locale: "en" }); } catch (err) { if (err instanceof NextResponse) return err; throw err; }
  },
}));
const inngestSend = jest.fn().mockResolvedValue(undefined);
jest.mock("@/lib/inngest/client", () => ({ inngest: { send: (...a: unknown[]) => inngestSend(...a) } }));
jest.mock("@/lib/logger", () => ({ __esModule: true, default: { error: jest.fn(), info: jest.fn(), warn: jest.fn() } }));
// The claim helpers' own DB behaviour is covered in scheduleRuntime.test.ts; here only how the route maps them.
const claimScheduleNow = jest.fn();
const releaseScheduleClaim = jest.fn();
jest.mock("@/lib/communications/whatsapp/scheduleRuntime", () => ({
  claimScheduleNow: (...a: unknown[]) => claimScheduleNow(...a),
  releaseScheduleClaim: (...a: unknown[]) => releaseScheduleClaim(...a),
}));
const getWhatsAppSettings = jest.fn();
jest.mock("@/models/SystemConfig", () => ({ getWhatsAppSettings: (...a: unknown[]) => getWhatsAppSettings(...a) }));
const existing = { _id: SCHEDULE_ID, name: "Weekly digest", enabled: true, kind: "recurring", cron: "0 9 * * 1", timezone: "Asia/Dubai", template: { templateName: "mployedin_admin_announcement", language: "en", params: [] }, audience: { targetAll: false, targetRoles: ["job_seeker"] }, nextRunAt: new Date("2026-10-05T05:00:00Z") };
const find = jest.fn((..._a: unknown[]) => ({ sort: () => ({ lean: async () => [existing] }) }));
const create = jest.fn(async (...a: unknown[]) => ({ toObject: () => ({ _id: SCHEDULE_ID, ...(a[0] as object) }) }));
const findById = jest.fn((..._a: unknown[]) => ({ lean: async () => existing as Record<string, unknown> | null }));
const findByIdAndUpdate = jest.fn(async (...a: unknown[]) => ({ toObject: () => ({ ...existing, ...(a[1] as { $set: Record<string, unknown> }).$set }) }));
const findByIdAndDelete = jest.fn(async (..._a: unknown[]) => existing as Record<string, unknown> | null);
jest.mock("@/models/WhatsAppSchedule", () => ({
  __esModule: true,
  default: {
    find: (...a: unknown[]) => find(...a),
    create: (...a: unknown[]) => create(...a),
    findById: (...a: unknown[]) => findById(...a),
    findByIdAndUpdate: (...a: unknown[]) => findByIdAndUpdate(...a),
    findByIdAndDelete: (...a: unknown[]) => findByIdAndDelete(...a),
  },
}));

import { GET as getRoute, POST as postRoute } from "@/app/api/admin/whatsapp/schedules/route";
import { PATCH as patchRoute, DELETE as deleteRoute } from "@/app/api/admin/whatsapp/schedules/[id]/route";
import { POST as runRoute } from "@/app/api/admin/whatsapp/schedules/[id]/run/route";
import { scheduleTimingError, scheduleAudienceError } from "@/lib/communications/whatsapp/schedule";

// withAuth routes take (req, { params }); none of these read the params, they take the id from the path.
const noParams = { params: Promise.resolve({}) };
const GET = (req: NextRequest) => getRoute(req, noParams);
const POST = (req: NextRequest) => postRoute(req, noParams);
const PATCH = (req: NextRequest) => patchRoute(req, noParams);
const DELETE = (req: NextRequest) => deleteRoute(req, noParams);
const RUN = (req: NextRequest) => runRoute(req, noParams);

const json = (method: string, url: string, body?: unknown) =>
  new NextRequest(url, { method, body: body === undefined ? undefined : JSON.stringify(body), headers: { "content-type": "application/json" } });
const base = "http://x/api/admin/whatsapp/schedules";
const valid = { name: "Weekly digest", kind: "recurring", cron: "0 9 * * 1", timezone: "Asia/Dubai", template: { templateName: "mployedin_admin_announcement", language: "en", params: ["{{firstName}}", "Jobs are waiting"] }, audience: { targetAll: false, targetRoles: ["job_seeker"] } };

const HOUR = 60 * 60 * 1000;
const inFuture = (ms: number) => new Date(Date.now() + ms);
/** What the update route sees on the next findById. */
const stored = (overrides: Record<string, unknown>) => findById.mockReturnValueOnce({ lean: async () => ({ ...existing, ...overrides }) });
const updateOf = () => findByIdAndUpdate.mock.calls[0][1] as { $set: Record<string, unknown>; $unset?: Record<string, unknown> };

beforeEach(() => {
  jest.clearAllMocks();
  ctxRole = "admin";
  getWhatsAppSettings.mockResolvedValue({ enabled: true });
  claimScheduleNow.mockResolvedValue({ ok: true, runId: "run-abc" });
  releaseScheduleClaim.mockResolvedValue(undefined);
  inngestSend.mockResolvedValue(undefined);
});

describe("/api/admin/whatsapp/schedules", () => {
  it("403s non-admins", async () => {
    ctxRole = "agent";
    expect((await GET(json("GET", base))).status).toBe(403);
    expect((await POST(json("POST", base, valid))).status).toBe(403);
    expect(create).not.toHaveBeenCalled();
  });
  it("lists schedules newest first", async () => {
    const res = await GET(json("GET", base));
    expect((await res.json()).schedules).toHaveLength(1);
  });
  it("creates a recurring schedule with its first nextRunAt and audits", async () => {
    const res = await POST(json("POST", base, valid));
    expect(res.status).toBe(201);
    const doc = create.mock.calls[0][0] as Record<string, unknown>;
    expect(doc.createdBy).toBe(ADMIN_ID);
    expect(doc.nextRunAt).toBeInstanceOf(Date);
    expect((doc.nextRunAt as Date).getUTCDay()).toBe(1); // a Monday, 09:00 Dubai
    expect((doc.nextRunAt as Date).getUTCHours()).toBe(5);
    expect(logActivity).toHaveBeenCalledWith(expect.objectContaining({ action: "admin.whatsapp.schedule.create", resourceId: SCHEDULE_ID }));
  });
  it("rejects a sub-hourly cron, a bad timezone and a one-off in the past", async () => {
    expect((await POST(json("POST", base, { ...valid, cron: "*/10 * * * *" }))).status).toBe(400);
    expect((await POST(json("POST", base, { ...valid, timezone: "Mars/Olympus" }))).status).toBe(400);
    expect((await POST(json("POST", base, { ...valid, kind: "once", cron: undefined, runAt: "2020-01-01T00:00:00Z" }))).status).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });

  it("refuses a timezone whose clocks shift by part of an hour (the once-per-hour floor lives in the pair)", async () => {
    expect((await POST(json("POST", base, { ...valid, timezone: "Australia/Lord_Howe" }))).status).toBe(400);
    expect((await POST(json("POST", base, { ...valid, timezone: "LHI" }))).status).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });
  it("rejects an empty audience (neither everyone nor any role)", async () => {
    const res = await POST(json("POST", base, { ...valid, audience: { targetAll: false, targetRoles: [] } }));
    expect(res.status).toBe(400);
    expect((await POST(json("POST", base, { ...valid, audience: {} }))).status).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });
  it("accepts everyone as the audience", async () => {
    expect((await POST(json("POST", base, { ...valid, audience: { targetAll: true } }))).status).toBe(201);
  });
  it("accepts a template with no body variables", async () => {
    const res = await POST(json("POST", base, { ...valid, template: { templateName: "hello_world", language: "en_US", params: [] } }));
    expect(res.status).toBe(201);
    expect((create.mock.calls[0][0] as { template: { params: string[] } }).template.params).toEqual([]);
  });
  it("rejects a recurring schedule without a cron and a cron that never fires", async () => {
    expect((await POST(json("POST", base, { ...valid, cron: undefined }))).status).toBe(400);
    // April and June have no 31st: it parses, but cron-parser can never produce a next run, so computeNextRunAt is null.
    const never = await POST(json("POST", base, { ...valid, cron: "0 0 31 4,6 *" }));
    expect(never.status).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });
  it("creates a one-time schedule at its run time and stores no cron", async () => {
    const runAt = inFuture(48 * HOUR).toISOString();
    const res = await POST(json("POST", base, { ...valid, kind: "once", runAt }));
    expect(res.status).toBe(201);
    const doc = create.mock.calls[0][0] as Record<string, unknown>;
    expect(doc.runAt).toEqual(new Date(runAt));
    expect(doc.nextRunAt).toEqual(new Date(runAt));
    expect(doc.cron).toBeUndefined();
  });
  it("stores no run time on a recurring schedule", async () => {
    await POST(json("POST", base, { ...valid, runAt: inFuture(48 * HOUR).toISOString() }));
    expect((create.mock.calls[0][0] as Record<string, unknown>).runAt).toBeUndefined();
  });
  it("saves a paused schedule whose one-time run is already past, with no next run", async () => {
    const res = await POST(json("POST", base, { ...valid, enabled: false, kind: "once", runAt: "2020-01-01T00:00:00Z" }));
    expect(res.status).toBe(201);
    expect((create.mock.calls[0][0] as Record<string, unknown>).nextRunAt).toBeNull();
  });
});

describe("/api/admin/whatsapp/schedules/[id]", () => {
  it("recomputes nextRunAt when the cron changes and audits", async () => {
    const res = await PATCH(json("PATCH", `${base}/${SCHEDULE_ID}`, { cron: "0 18 * * 5" }));
    expect(res.status).toBe(200);
    const $set = updateOf().$set;
    expect($set.cron).toBe("0 18 * * 5");
    expect(($set.nextRunAt as Date).getUTCDay()).toBe(5);
    expect($set.updatedBy).toBe(ADMIN_ID);
    expect(logActivity).toHaveBeenCalledWith(expect.objectContaining({ action: "admin.whatsapp.schedule.update", resourceId: SCHEDULE_ID }));
  });
  it("pauses without touching the timing", async () => {
    await PATCH(json("PATCH", `${base}/${SCHEDULE_ID}`, { enabled: false }));
    const $set = updateOf().$set;
    expect($set).toEqual({ enabled: false, updatedBy: ADMIN_ID });
  });
  it("rejects an invalid id and a missing schedule", async () => {
    expect((await PATCH(json("PATCH", `${base}/not-an-id`, { enabled: false }))).status).toBe(400);
    findById.mockReturnValueOnce({ lean: async () => null });
    expect((await PATCH(json("PATCH", `${base}/${SCHEDULE_ID}`, { enabled: false }))).status).toBe(404);
  });
  it("deletes and audits", async () => {
    const res = await DELETE(json("DELETE", `${base}/${SCHEDULE_ID}`));
    expect(res.status).toBe(200);
    expect(findByIdAndDelete).toHaveBeenCalledWith(SCHEDULE_ID);
    expect(logActivity).toHaveBeenCalledWith(expect.objectContaining({ action: "admin.whatsapp.schedule.delete", resourceId: SCHEDULE_ID }));
  });

  it("403s non-admins on every write", async () => {
    ctxRole = "agent";
    expect((await PATCH(json("PATCH", `${base}/${SCHEDULE_ID}`, { enabled: false }))).status).toBe(403);
    expect((await DELETE(json("DELETE", `${base}/${SCHEDULE_ID}`))).status).toBe(403);
    expect(findByIdAndUpdate).not.toHaveBeenCalled();
    expect(findByIdAndDelete).not.toHaveBeenCalled();
  });
  it("answers 400 for an empty patch and for a delete with a bad id, 404 for a delete of nothing", async () => {
    expect((await PATCH(json("PATCH", `${base}/${SCHEDULE_ID}`, {}))).status).toBe(400);
    expect((await DELETE(json("DELETE", `${base}/nope`))).status).toBe(400);
    findByIdAndDelete.mockResolvedValueOnce(null);
    expect((await DELETE(json("DELETE", `${base}/${SCHEDULE_ID}`))).status).toBe(404);
    expect(logActivity).not.toHaveBeenCalled();
  });

  describe("timing is validated as the merged result of stored schedule + patch", () => {
    it("refuses a sub-hourly cron and a timezone that breaks the floor, and writes nothing", async () => {
      expect((await PATCH(json("PATCH", `${base}/${SCHEDULE_ID}`, { cron: "*/10 * * * *" }))).status).toBe(400);
      expect((await PATCH(json("PATCH", `${base}/${SCHEDULE_ID}`, { timezone: "Mars/Olympus" }))).status).toBe(400);
      expect((await PATCH(json("PATCH", `${base}/${SCHEDULE_ID}`, { timezone: "Australia/Lord_Howe" }))).status).toBe(400);
      expect(findByIdAndUpdate).not.toHaveBeenCalled();
      expect(logActivity).not.toHaveBeenCalled();
    });
    it("recomputes nextRunAt when only the timezone changes", async () => {
      await PATCH(json("PATCH", `${base}/${SCHEDULE_ID}`, { timezone: "Asia/Kolkata" }));
      const { $set } = updateOf();
      expect($set.timezone).toBe("Asia/Kolkata");
      // Monday 09:00 in Kolkata is 03:30Z.
      expect(($set.nextRunAt as Date).getUTCHours()).toBe(3);
      expect(($set.nextRunAt as Date).getUTCMinutes()).toBe(30);
    });
    it("refuses switching a one-time schedule to recurring without a cron", async () => {
      stored({ kind: "once", cron: undefined, runAt: inFuture(48 * HOUR) });
      expect((await PATCH(json("PATCH", `${base}/${SCHEDULE_ID}`, { kind: "recurring" }))).status).toBe(400);
      expect(findByIdAndUpdate).not.toHaveBeenCalled();
    });
    it("switches a one-time schedule to recurring when a cron comes with it, dropping the run time", async () => {
      stored({ kind: "once", cron: undefined, runAt: inFuture(48 * HOUR) });
      const res = await PATCH(json("PATCH", `${base}/${SCHEDULE_ID}`, { kind: "recurring", cron: "0 8 * * *" }));
      expect(res.status).toBe(200);
      const { $set, $unset } = updateOf();
      expect($set.kind).toBe("recurring");
      expect($set.cron).toBe("0 8 * * *");
      expect($set.nextRunAt).toBeInstanceOf(Date);
      expect($set).not.toHaveProperty("runAt");
      expect($unset).toEqual({ runAt: 1 });
    });
    it("refuses switching a recurring schedule to one-time without a future run time", async () => {
      expect((await PATCH(json("PATCH", `${base}/${SCHEDULE_ID}`, { kind: "once" }))).status).toBe(400);
      expect((await PATCH(json("PATCH", `${base}/${SCHEDULE_ID}`, { kind: "once", runAt: "2020-01-01T00:00:00Z" }))).status).toBe(400);
      expect(findByIdAndUpdate).not.toHaveBeenCalled();
    });
    it("switches a recurring schedule to one-time at a future run time, dropping the cron", async () => {
      const runAt = inFuture(48 * HOUR);
      const res = await PATCH(json("PATCH", `${base}/${SCHEDULE_ID}`, { kind: "once", runAt: runAt.toISOString() }));
      expect(res.status).toBe(200);
      const { $set, $unset } = updateOf();
      expect($set.kind).toBe("once");
      expect($set.runAt).toEqual(runAt);
      expect($set.nextRunAt).toEqual(runAt);
      expect($set).not.toHaveProperty("cron");
      expect($unset).toEqual({ cron: 1 });
    });
    it("lets a spent, paused one-time schedule keep its past run time while its timezone is edited", async () => {
      stored({ enabled: false, kind: "once", cron: undefined, runAt: new Date("2020-01-01T00:00:00Z"), nextRunAt: null });
      const res = await PATCH(json("PATCH", `${base}/${SCHEDULE_ID}`, { timezone: "Asia/Kolkata" }));
      expect(res.status).toBe(200);
      expect(updateOf().$set.nextRunAt).toBeNull();
    });
    it("refuses a timing edit that would leave an enabled one-time schedule in the past", async () => {
      stored({ kind: "once", cron: undefined, runAt: inFuture(48 * HOUR) });
      expect((await PATCH(json("PATCH", `${base}/${SCHEDULE_ID}`, { runAt: "2020-01-01T00:00:00Z" }))).status).toBe(400);
    });
    it("refuses a cron that never fires", async () => {
      expect((await PATCH(json("PATCH", `${base}/${SCHEDULE_ID}`, { cron: "0 0 31 4,6 *" }))).status).toBe(400);
      expect(findByIdAndUpdate).not.toHaveBeenCalled();
    });
  });

  describe("resuming", () => {
    it("recomputes nextRunAt from now so a long-paused recurring schedule doesn't fire a stale occurrence", async () => {
      stored({ enabled: false, nextRunAt: new Date("2026-01-05T05:00:00Z") });
      const res = await PATCH(json("PATCH", `${base}/${SCHEDULE_ID}`, { enabled: true }));
      expect(res.status).toBe(200);
      const { $set } = updateOf();
      expect($set.enabled).toBe(true);
      expect(($set.nextRunAt as Date).getTime()).toBeGreaterThan(Date.now());
      expect($set).not.toHaveProperty("cron");
    });
    it("refuses to resume a one-time schedule whose run time is past", async () => {
      stored({ enabled: false, kind: "once", cron: undefined, runAt: new Date("2020-01-01T00:00:00Z"), nextRunAt: null });
      expect((await PATCH(json("PATCH", `${base}/${SCHEDULE_ID}`, { enabled: true }))).status).toBe(400);
      expect(findByIdAndUpdate).not.toHaveBeenCalled();
    });
    it("resumes a one-time schedule when a new future run time comes with it", async () => {
      const runAt = inFuture(24 * HOUR);
      stored({ enabled: false, kind: "once", cron: undefined, runAt: new Date("2020-01-01T00:00:00Z"), nextRunAt: null });
      const res = await PATCH(json("PATCH", `${base}/${SCHEDULE_ID}`, { enabled: true, runAt: runAt.toISOString() }));
      expect(res.status).toBe(200);
      expect(updateOf().$set.nextRunAt).toEqual(runAt);
    });
    it("leaves the timing alone when an already-enabled schedule is patched with enabled: true", async () => {
      await PATCH(json("PATCH", `${base}/${SCHEDULE_ID}`, { enabled: true }));
      expect(updateOf().$set).toEqual({ enabled: true, updatedBy: ADMIN_ID });
    });
  });

  describe("audience and content edits", () => {
    it("rejects an update that empties the audience", async () => {
      const res = await PATCH(json("PATCH", `${base}/${SCHEDULE_ID}`, { audience: { targetAll: false, targetRoles: [] } }));
      expect(res.status).toBe(400);
      expect(findByIdAndUpdate).not.toHaveBeenCalled();
    });
    it("saves a new audience, template and name without touching the timing", async () => {
      const template = { templateName: "hello_world", language: "en_US", params: [] };
      const res = await PATCH(json("PATCH", `${base}/${SCHEDULE_ID}`, { name: "Renamed", template, audience: { targetAll: true } }));
      expect(res.status).toBe(200);
      expect(updateOf().$set).toEqual({ name: "Renamed", template, audience: { targetAll: true, targetRoles: [] }, updatedBy: ADMIN_ID });
      expect(updateOf().$unset).toBeUndefined();
    });
  });
});

describe("POST /api/admin/whatsapp/schedules/[id]/run", () => {
  const runUrl = `${base}/${SCHEDULE_ID}/run`;

  it("claims the schedule, then queues a run event carrying the claimed run token, and audits", async () => {
    const res = await RUN(json("POST", runUrl));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ queued: true });
    expect(claimScheduleNow).toHaveBeenCalledWith(SCHEDULE_ID, expect.any(Date));
    expect(inngestSend).toHaveBeenCalledTimes(1);
    // The event id is derived from the claim's run token: Inngest drops a second event with the same id.
    expect(inngestSend).toHaveBeenCalledWith({ id: "wa-schedule-run-run-abc", name: "whatsapp/schedule.run", data: { scheduleId: SCHEDULE_ID, runAt: expect.any(String), runId: "run-abc" } });
    expect(releaseScheduleClaim).not.toHaveBeenCalled();
    expect(logActivity).toHaveBeenCalledWith(expect.objectContaining({ action: "admin.whatsapp.schedule.run", resourceId: SCHEDULE_ID }));
  });
  it("claims before it queues anything", async () => {
    await RUN(json("POST", runUrl));
    expect(claimScheduleNow.mock.invocationCallOrder[0]).toBeLessThan(inngestSend.mock.invocationCallOrder[0]);
  });
  it("403s non-admins and 400s a bad id, claiming nothing", async () => {
    ctxRole = "agent";
    expect((await RUN(json("POST", runUrl))).status).toBe(403);
    ctxRole = "admin";
    expect((await RUN(json("POST", `${base}/nope/run`))).status).toBe(400);
    expect(claimScheduleNow).not.toHaveBeenCalled();
    expect(inngestSend).not.toHaveBeenCalled();
    expect(logActivity).not.toHaveBeenCalled();
  });
  it("answers 404 for a missing schedule, queueing and auditing nothing", async () => {
    claimScheduleNow.mockResolvedValueOnce({ ok: false, reason: "not_found" });
    const res = await RUN(json("POST", runUrl));
    expect(res.status).toBe(404);
    expect(inngestSend).not.toHaveBeenCalled();
    expect(logActivity).not.toHaveBeenCalled();
  });

  describe("WhatsApp master switch", () => {
    it("answers 409 whatsapp_disabled when the switch is off, claiming, queueing and auditing nothing", async () => {
      getWhatsAppSettings.mockResolvedValue({ enabled: false });
      const res = await RUN(json("POST", runUrl));
      expect(res.status).toBe(409);
      expect((await res.json()).error).toBe("whatsapp_disabled");
      expect(claimScheduleNow).not.toHaveBeenCalled();
      expect(inngestSend).not.toHaveBeenCalled();
      expect(logActivity).not.toHaveBeenCalled();
    });
  });

  describe("claim refusals", () => {
    it.each([
      ["run_in_progress", "run_in_progress"],
      ["too_soon", "too_soon"],
    ])("maps %s to 409 %s, queueing and auditing nothing", async (reason, error) => {
      claimScheduleNow.mockResolvedValueOnce({ ok: false, reason });
      const res = await RUN(json("POST", runUrl));
      expect(res.status).toBe(409);
      expect((await res.json()).error).toBe(error);
      expect(inngestSend).not.toHaveBeenCalled();
      expect(releaseScheduleClaim).not.toHaveBeenCalled();
      expect(logActivity).not.toHaveBeenCalled();
    });
    it("a second click while the first run holds its claim queues nothing more", async () => {
      claimScheduleNow.mockResolvedValueOnce({ ok: true, runId: "run-1" }).mockResolvedValueOnce({ ok: false, reason: "run_in_progress" });
      expect((await RUN(json("POST", runUrl))).status).toBe(200);
      expect((await RUN(json("POST", runUrl))).status).toBe(409);
      expect(inngestSend).toHaveBeenCalledTimes(1);
      expect(inngestSend).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ runId: "run-1" }) }));
    });
  });

  describe("when the event cannot be queued", () => {
    it("releases exactly the claim it made, audits nothing, and lets the failure surface", async () => {
      claimScheduleNow.mockResolvedValueOnce({ ok: true, runId: "run-lost" });
      inngestSend.mockRejectedValueOnce(new Error("inngest unreachable"));
      await expect(RUN(json("POST", runUrl))).rejects.toThrow("inngest unreachable");
      expect(releaseScheduleClaim).toHaveBeenCalledTimes(1);
      expect(releaseScheduleClaim).toHaveBeenCalledWith(SCHEDULE_ID, "run-lost");
      expect(logActivity).not.toHaveBeenCalled();
    });
    it("still surfaces the send failure when releasing the claim fails too", async () => {
      inngestSend.mockRejectedValueOnce(new Error("inngest unreachable"));
      releaseScheduleClaim.mockRejectedValueOnce(new Error("db down"));
      await expect(RUN(json("POST", runUrl))).rejects.toThrow("inngest unreachable");
    });
  });

  it("never reads or gates on the schedule itself: a paused schedule or a spent one-off runs now", async () => {
    findById.mockClear();
    expect((await RUN(json("POST", runUrl))).status).toBe(200);
    expect(findById).not.toHaveBeenCalled();
  });
});

describe("scheduleTimingError / scheduleAudienceError", () => {
  const recurring = { kind: "recurring" as const, cron: "0 9 * * 1", timezone: "Asia/Dubai" };
  it("accepts good timing and names each problem otherwise", () => {
    expect(scheduleTimingError(recurring, true)).toBeNull();
    expect(scheduleTimingError({ ...recurring, cron: null }, true)).toMatch(/cron/i);
    expect(scheduleTimingError({ ...recurring, cron: "*/5 * * * *" }, true)).toMatch(/once per hour/);
    expect(scheduleTimingError({ ...recurring, timezone: "Mars/Olympus" }, true)).toMatch(/timezone/i);
    expect(scheduleTimingError({ ...recurring, timezone: "Australia/Lord_Howe" }, true)).toMatch(/part of an hour/);
    expect(scheduleTimingError({ ...recurring, cron: "0 0 31 4,6 *" }, true)).toMatch(/next run/i);
    expect(scheduleTimingError({ kind: "once", runAt: null, timezone: "Asia/Dubai" }, true)).toMatch(/run time/i);
  });
  it("checks any cron that comes with a one-time schedule against the floor", () => {
    const runAt = inFuture(48 * HOUR);
    expect(scheduleTimingError({ kind: "once", runAt, cron: "0 9 * * 1", timezone: "Asia/Dubai" }, true)).toBeNull();
    expect(scheduleTimingError({ kind: "once", runAt, cron: "*/5 * * * *", timezone: "Asia/Dubai" }, true)).toMatch(/once per hour/);
  });
  it("only demands a future one-time run while the schedule is enabled", () => {
    const past = { kind: "once" as const, runAt: new Date("2020-01-01T00:00:00Z"), timezone: "Asia/Dubai" };
    expect(scheduleTimingError(past, true)).toMatch(/future/);
    expect(scheduleTimingError(past, false)).toBeNull();
  });
  it("flags an audience that reaches nobody", () => {
    expect(scheduleAudienceError({ targetAll: false, targetRoles: [] })).toMatch(/audience/i);
    expect(scheduleAudienceError({ targetAll: true, targetRoles: [] })).toBeNull();
    expect(scheduleAudienceError({ targetAll: false, targetRoles: ["agent"] })).toBeNull();
  });
});
