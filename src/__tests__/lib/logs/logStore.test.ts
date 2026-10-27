/**
 * @jest-environment node
 *
 * LOGS_STORE=dual against the real Worker handler on SQLite (global fetch is
 * routed into worker.fetch), and the plugin on every log model.
 */
import { Schema, Types } from "mongoose";
import worker from "../../../../workers/mployedin-data/src/index";
import { TEST_SECRET, testEnv, type TestEnv } from "../../../../workers/mployedin-data/src/__tests__/testEnv";
import logger from "@/lib/logger";
import {
  LOG_BATCH_BYTES,
  chunkLogWrites,
  d1LogMirror,
  logsStore,
  mirrorLogDocs,
  mirrorLogErase,
  mirrorLogWrites,
  resetLogMirrorForTests,
} from "@/lib/logs/logStore";
import AuditLog from "@/models/AuditLog";
import ConsentLog from "@/models/ConsentLog";
import EmailLog from "@/models/EmailLog";
import WhatsAppMessageLog from "@/models/WhatsAppMessageLog";
import ActivityEvent from "@/models/ActivityEvent";
import ProfileView from "@/models/ProfileView";
import CompanyProfileView from "@/models/CompanyProfileView";
import ResourceDownloadLog from "@/models/ResourceDownloadLog";

const AT = new Date("2026-10-20T10:00:00.000Z");
const audit = (extra: Record<string, unknown> = {}) => ({
  _id: new Types.ObjectId(),
  action: "login",
  resource: "user",
  actorRole: "admin",
  createdAt: AT,
  ...extra,
});

describe("logStore", () => {
  const saved = { ...process.env };
  const realFetch = global.fetch;
  let env: TestEnv;

  beforeEach(() => {
    resetLogMirrorForTests();
    env = testEnv();
    process.env.DATA_WORKER_URL = "https://data.test";
    process.env.DATA_WORKER_SECRET = TEST_SECRET;
    process.env.LOGS_STORE = "dual";
    global.fetch = jest.fn((input: RequestInfo | URL, init?: RequestInit) => worker.fetch(new Request(input, init), env)) as typeof fetch;
  });
  afterEach(() => {
    process.env = { ...saved };
    global.fetch = realFetch;
    jest.restoreAllMocks();
  });

  const count = (table: string) => (env.DB_LOGS.raw.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;

  it("is dual only when asked for and the Worker is configured", () => {
    expect(logsStore({})).toBe("mongo");
    expect(logsStore({ LOGS_STORE: "dual" })).toBe("mongo");
    expect(logsStore({ LOGS_STORE: "DUAL", DATA_WORKER_URL: "https://x", DATA_WORKER_SECRET: TEST_SECRET })).toBe("dual");
    expect(logsStore({ LOGS_STORE: "d1", DATA_WORKER_URL: "https://x", DATA_WORKER_SECRET: TEST_SECRET })).toBe("mongo");
  });

  it("copies documents under their Mongo id, and does nothing on mongo", async () => {
    const doc = audit();
    await mirrorLogDocs("audit_log", [doc, audit({ action: undefined })]);
    expect(env.DB_LOGS.raw.prepare("SELECT id, action FROM audit_log").all()).toEqual([{ id: String(doc._id), action: "login" }]);

    process.env.LOGS_STORE = "mongo";
    await mirrorLogDocs("audit_log", [audit()]);
    expect(count("audit_log")).toBe(1);
  });

  it("never fails the caller when the Worker is down, says so once, and backs off", async () => {
    global.fetch = jest.fn(() => Promise.reject(new Error("down"))) as typeof fetch;
    const error = jest.spyOn(logger, "error").mockImplementation(() => logger);
    await expect(mirrorLogDocs("audit_log", [audit()])).resolves.toBeUndefined();
    await expect(
      mirrorLogWrites("profile_view", [{ table: "profile_view", op: "update", where: { id: "x" }, row: { notified_at: 1 } }]),
    ).resolves.toBeUndefined();
    // The second mirror did not wait on the sick Worker.
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(error.mock.calls.map((c) => (c[0] as { event?: string }).event)).toEqual(["log_mirror_failed"]);
  });

  it("sizes requests by bytes as well as rows", () => {
    const big = (i: number) => ({ table: "audit_log" as const, row: { id: `a${i}`, meta: { blob: "x".repeat(50_000) } } });
    const chunks = chunkLogWrites(Array.from({ length: 70 }, (_, i) => big(i)));
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) expect(JSON.stringify(chunk).length).toBeLessThan(LOG_BATCH_BYTES + 60_000);
    expect(chunks.flat()).toHaveLength(70);
    expect(chunkLogWrites(Array.from({ length: 1200 }, (_, i) => ({ table: "audit_log" as const, row: { id: `s${i}` } }))).map((c) => c.length)).toEqual([500, 500, 200]);
  });

  it("mirrors a forward-only WhatsApp receipt", async () => {
    const id = new Types.ObjectId();
    await mirrorLogDocs("whatsapp_log", [
      { _id: id, to: "+447700900001", waMessageId: "wamid.9", kind: "text", source: "notification", category: "jobs", status: "sent", sentAt: AT },
    ]);
    const receipt = (status: string, lower: string[]) =>
      mirrorLogWrites("whatsapp_log", [
        { table: "whatsapp_log", op: "update", where: { wa_message_id: "wamid.9" }, row: { status, status_at: AT.getTime() }, onlyIf: { status: lower } },
      ]);
    await receipt("read", ["sent", "delivered"]);
    await receipt("delivered", ["sent"]);
    expect(env.DB_LOGS.raw.prepare("SELECT status FROM whatsapp_log").get()).toEqual({ status: "read" });
  });

  it("erases in D1 and throws when it cannot, so an erasure is never reported done falsely", async () => {
    const userId = String(new Types.ObjectId());
    await mirrorLogDocs("consent_log", [
      { _id: new Types.ObjectId(), userId, userName: "Ada", consentType: "marketing", granted: true, ipAddress: "203.0.113.1", createdAt: AT },
    ]);
    await mirrorLogErase("consent_log", "user_id", [userId]);
    expect(env.DB_LOGS.raw.prepare("SELECT user_name, ip_address FROM consent_log").get()).toEqual({ user_name: "Deleted User", ip_address: null });

    global.fetch = jest.fn(() => Promise.reject(new Error("down"))) as typeof fetch;
    await expect(mirrorLogErase("consent_log", "user_id", [userId])).rejects.toThrow("data worker unreachable");
  });

  it("erases in D1 even after LOGS_STORE went back to mongo: D1 may still hold the rows", async () => {
    const userId = String(new Types.ObjectId());
    await mirrorLogDocs("consent_log", [
      { _id: new Types.ObjectId(), userId, userName: "Ada", consentType: "marketing", granted: true, createdAt: AT },
    ]);
    process.env.LOGS_STORE = "mongo";
    await mirrorLogErase("consent_log", "user_id", [userId]);
    expect(env.DB_LOGS.raw.prepare("SELECT user_name FROM consent_log").get()).toEqual({ user_name: "Deleted User" });

    delete process.env.DATA_WORKER_URL;
    global.fetch = jest.fn() as typeof fetch;
    await expect(mirrorLogErase("consent_log", "user_id", [userId])).resolves.toBeUndefined();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  function pluginHooks() {
    const hooks: { pre: Array<(this: unknown) => void>; post: Record<string, Array<(...a: unknown[]) => Promise<void>>> } = { pre: [], post: {} };
    d1LogMirror("audit_log")({
      pre: (_name: string, fn: (this: unknown) => void) => hooks.pre.push(fn),
      post: (name: string, fn: (...a: unknown[]) => Promise<void>) => (hooks.post[name] ??= []).push(fn),
    } as never);
    return hooks;
  }

  it("the plugin mirrors inserts (create / save of a new document, insertMany)", async () => {
    const hooks = pluginHooks();
    const doc = { ...audit(), isNew: true, $locals: {} as Record<string, unknown> };
    hooks.pre[0].call(doc);
    await hooks.post.save[0](doc);
    await hooks.post.insertMany[0]([audit(), audit()]);
    expect(count("audit_log")).toBe(3);
  });

  it("the plugin ignores a re-save of a loaded document (a stale snapshot must not overwrite D1)", async () => {
    const hooks = pluginHooks();
    const loaded = { ...audit(), isNew: false, $locals: {} as Record<string, unknown> };
    hooks.pre[0].call(loaded);
    await hooks.post.save[0](loaded);
    expect(count("audit_log")).toBe(0);
  });

  it("the plugin mirrors the rows that did go in when an unordered insertMany partly fails", async () => {
    const hooks = pluginHooks();
    const [, onError] = hooks.post.insertMany;
    expect(onError.length).toBe(3); // Kareem's error-handler shape
    const error = Object.assign(new Error("E11000 duplicate key"), { insertedDocs: [audit()] });
    await onError(error, [], () => undefined);
    expect(count("audit_log")).toBe(1);
  });

  it("real Mongoose hooks: a successful insertMany mirrors once, a partial failure mirrors the inserted rows and keeps the error", async () => {
    const schema = new Schema({ action: String, resource: String });
    d1LogMirror("audit_log")(schema);
    type Hooks = { execPost(name: string, ctx: unknown, args: unknown[], opts?: { error?: unknown }): Promise<unknown> };
    const hooks = (schema as unknown as { s: { hooks: Hooks } }).s.hooks;

    await hooks.execPost("insertMany", null, [[audit()]]);
    expect(count("audit_log")).toBe(1);

    const error = Object.assign(new Error("E11000 duplicate key"), { insertedDocs: [audit(), audit()] });
    await expect(hooks.execPost("insertMany", null, [[]], { error })).rejects.toBe(error);
    expect(count("audit_log")).toBe(3);
  });

  it("is applied to every log model", () => {
    const tagged = (model: { schema: unknown }) =>
      (model.schema as { plugins: Array<{ fn: { d1Table?: string } }> }).plugins.map((p) => p.fn.d1Table).filter(Boolean);
    expect({
      AuditLog: tagged(AuditLog),
      ConsentLog: tagged(ConsentLog),
      EmailLog: tagged(EmailLog),
      WhatsAppMessageLog: tagged(WhatsAppMessageLog),
      ActivityEvent: tagged(ActivityEvent),
      ProfileView: tagged(ProfileView),
      CompanyProfileView: tagged(CompanyProfileView),
      ResourceDownloadLog: tagged(ResourceDownloadLog),
    }).toEqual({
      AuditLog: ["audit_log"],
      ConsentLog: ["consent_log"],
      EmailLog: ["email_log"],
      WhatsAppMessageLog: ["whatsapp_log"],
      ActivityEvent: ["activity_event"],
      ProfileView: ["profile_view"],
      CompanyProfileView: ["company_profile_view"],
      ResourceDownloadLog: ["resource_download"],
    });
  });
});
