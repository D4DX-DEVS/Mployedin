/**
 * @jest-environment node
 */
import { NextRequest, NextResponse } from "next/server";

let ctxRole = "admin";
let mode: "live" | "mock" = "mock";
jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
const logActivity = jest.fn().mockResolvedValue(undefined);
jest.mock("@/lib/audit/log", () => ({ logActivity: (...a: unknown[]) => logActivity(...a), actorFromCtx: () => ({ userId: "admin1", userRole: "admin" }) }));
jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: (req: NextRequest, ctx: unknown) => Promise<Response>) => async (req: NextRequest) => {
    try { return await handler(req, { userId: "admin1", role: ctxRole, locale: "en" }); } catch (err) { if (err instanceof NextResponse) return err; throw err; }
  },
}));
// Env-independent: a developer's shell may or may not carry WHATSAPP_* keys.
jest.mock("@/lib/communications/whatsapp/config", () => ({ whatsAppMode: () => mode }));
interface FakeSettings { enabled: boolean; dailyCapPerUser: number; automations: Record<string, { enabled: boolean; templateName: string; params: string[] }> }
const initialSettings = (): FakeSettings => ({ enabled: true, dailyCapPerUser: 3, automations: { offerUpdate: { enabled: true, templateName: "mployedin_offer_update", params: ["{{firstName}}", "{{message}}"] } } });
let settings = initialSettings();
const findOneAndUpdate = jest.fn().mockResolvedValue({});
const readWhatsAppSettings = jest.fn(async () => settings);
jest.mock("@/models/SystemConfig", () => ({
  __esModule: true,
  default: { findOneAndUpdate: (...a: unknown[]) => findOneAndUpdate(...a) },
  getWhatsAppSettings: async () => settings,
  readWhatsAppSettings: () => readWhatsAppSettings(),
}));

import { GET, PATCH } from "@/app/api/admin/whatsapp/config/route";
import {
  TEMPLATE_NAME_RE,
  broadcastWhatsAppSchema,
  templateLanguageSchema,
  whatsAppConfigUpdateSchema,
  whatsAppScheduleCreateSchema,
  whatsAppScheduleUpdateSchema,
  whatsAppTestSendSchema,
} from "@/lib/validators/whatsapp";

const noParams = { params: Promise.resolve({}) };
const get = () => GET(new NextRequest("http://x/api/admin/whatsapp/config"), noParams);
const patch = (body: unknown) =>
  PATCH(new NextRequest("http://x/api/admin/whatsapp/config", { method: "PATCH", body: JSON.stringify(body), headers: { "content-type": "application/json" } }), noParams);
const setArg = () => (findOneAndUpdate.mock.calls[0][1] as { $set: Record<string, unknown> }).$set;

beforeEach(() => {
  jest.clearAllMocks();
  findOneAndUpdate.mockReset().mockResolvedValue({});
  settings = initialSettings();
  readWhatsAppSettings.mockImplementation(async () => settings);
  ctxRole = "admin";
  mode = "mock";
});

/** Make the next writes visible to the settings read, as Mongo would: whole-automation $set only. */
function persistWrites() {
  findOneAndUpdate.mockImplementation(async (_filter: unknown, update: { $set: Record<string, unknown> }) => {
    for (const [path, value] of Object.entries(update.$set)) {
      const m = /^whatsapp\.automations\.(\w+)$/.exec(path);
      if (m) settings.automations[m[1]] = value as FakeSettings["automations"][string];
    }
    return {};
  });
}

describe("/api/admin/whatsapp/config", () => {
  it("403s non-admins on both verbs and writes nothing", async () => {
    ctxRole = "employer";
    expect((await get()).status).toBe(403);
    expect((await patch({ enabled: false })).status).toBe(403);
    expect(findOneAndUpdate).not.toHaveBeenCalled();
    expect(logActivity).not.toHaveBeenCalled();
  });

  it("returns settings and mode", async () => {
    expect(await (await get()).json()).toEqual({ config: settings, mode: "mock" });
    mode = "live";
    expect((await (await get()).json()).mode).toBe("live");
  });

  it("GET answers 503 when the settings cannot be read, rather than the senders' fail-closed defaults an editor would save back", async () => {
    readWhatsAppSettings.mockImplementation(async () => {
      throw new Error("db down");
    });
    const res = await get();
    expect(res.status).toBe(503);
    expect(await res.json()).not.toHaveProperty("config");
  });

  describe("when the settings cannot be read", () => {
    const unreadable = async () => {
      throw new Error("db down");
    };

    it("PATCH answers 503 and writes nothing when an automation has to be merged over a value that cannot be read", async () => {
      // The merge base would be the fail-closed defaults, not what the admin has saved: saving over them corrupts the stored automation.
      readWhatsAppSettings.mockImplementation(unreadable);
      const res = await patch({ automations: { offerUpdate: { enabled: false } } });
      expect(res.status).toBe(503);
      expect(await res.json()).toEqual({ error: "Service unavailable" });
      expect(findOneAndUpdate).not.toHaveBeenCalled();
      expect(logActivity).not.toHaveBeenCalled();
    });

    it("PATCH answers 503 and writes nothing even when the request also carries the switch and the cap", async () => {
      readWhatsAppSettings.mockImplementation(unreadable);
      const res = await patch({ enabled: false, dailyCapPerUser: 5, automations: { offerUpdate: { params: ["{{firstName}}"] } } });
      expect(res.status).toBe(503);
      expect(findOneAndUpdate).not.toHaveBeenCalled();
    });

    it("PATCH of just the switch and the cap needs no merge read, so it saves, and answers 200 without a config", async () => {
      readWhatsAppSettings.mockImplementation(unreadable);
      const res = await patch({ enabled: false });
      expect(res.status).toBe(200);
      expect(findOneAndUpdate).toHaveBeenCalledTimes(1);
      expect(logActivity).toHaveBeenCalledTimes(1);
      // Not the fail-closed defaults: the page keeps what it sent (AutomationsTab falls back when the answer has no config).
      expect(await res.json()).toEqual({ mode: "mock" });
    });

    it("PATCH answers 200 without a config when only the read after the write fails; the write stands", async () => {
      readWhatsAppSettings.mockImplementationOnce(async () => settings).mockImplementationOnce(unreadable);
      const res = await patch({ automations: { offerUpdate: { enabled: false } } });
      expect(res.status).toBe(200);
      expect(setArg()["whatsapp.automations.offerUpdate"]).toEqual({ enabled: false, templateName: "mployedin_offer_update", params: ["{{firstName}}", "{{message}}"] });
      expect(logActivity).toHaveBeenCalledTimes(1);
      expect(await res.json()).toEqual({ mode: "mock" });
    });
  });

  describe("an enabled automation with a blank parameter", () => {
    it("is refused with 400 and nothing is written", async () => {
      for (const blank of ["", "   "]) {
        const res = await patch({ automations: { offerUpdate: { enabled: true, templateName: "custom_offer", params: ["{{firstName}}", blank] } } });
        expect(res.status).toBe(400);
      }
      expect(findOneAndUpdate).not.toHaveBeenCalled();
      expect(logActivity).not.toHaveBeenCalled();
    });

    it("is refused when the request only switches on an automation whose stored params have a blank", async () => {
      settings.automations.offerUpdate = { enabled: false, templateName: "mployedin_offer_update", params: ["{{firstName}}", ""] };
      expect((await patch({ automations: { offerUpdate: { enabled: true } } })).status).toBe(400);
      expect(findOneAndUpdate).not.toHaveBeenCalled();
    });

    it("is accepted while the automation stays off (it never sends)", async () => {
      expect((await patch({ automations: { offerUpdate: { enabled: false, templateName: "custom_offer", params: ["{{firstName}}", ""] } } })).status).toBe(200);
      expect(findOneAndUpdate).toHaveBeenCalledTimes(1);
    });
  });

  it("writes the switch and the cap as dotted paths, stamps updatedBy, and audits", async () => {
    const res = await patch({ enabled: false, dailyCapPerUser: 5 });
    expect(res.status).toBe(200);
    expect(findOneAndUpdate).toHaveBeenCalledWith(
      { key: "notification_system" },
      { $set: { "whatsapp.enabled": false, "whatsapp.dailyCapPerUser": 5, updatedBy: "admin1" } },
      { upsert: true, returnDocument: "after" },
    );
    expect(logActivity).toHaveBeenCalledWith(
      expect.objectContaining({ action: "admin.whatsapp.config.update", resource: "notifications", changes: { after: setArg() } }),
    );
    expect(await res.json()).toEqual({ config: settings, mode: "mock" });
  });

  it("sets a changed automation as one whole object, never a leaf path", async () => {
    const res = await patch({ enabled: false, dailyCapPerUser: 5, automations: { offerUpdate: { enabled: false, templateName: "custom_offer", params: ["{{firstName}}"] } } });
    expect(res.status).toBe(200);
    expect(findOneAndUpdate).toHaveBeenCalledWith(
      { key: "notification_system" },
      { $set: { "whatsapp.enabled": false, "whatsapp.dailyCapPerUser": 5, "whatsapp.automations.offerUpdate": { enabled: false, templateName: "custom_offer", params: ["{{firstName}}"] }, updatedBy: "admin1" } },
      { upsert: true, returnDocument: "after" },
    );
    expect(Object.keys(setArg()).some((k) => k.startsWith("whatsapp.automations.offerUpdate."))).toBe(false);
    expect(logActivity).toHaveBeenCalledWith(expect.objectContaining({ action: "admin.whatsapp.config.update", resource: "notifications" }));
  });

  it("fills the fields the request left out from the current effective automation", async () => {
    await patch({ automations: { offerUpdate: { enabled: false } } });
    expect(setArg()["whatsapp.automations.offerUpdate"]).toEqual({ enabled: false, templateName: "mployedin_offer_update", params: ["{{firstName}}", "{{message}}"] });
    findOneAndUpdate.mockClear();
    await patch({ automations: { offerUpdate: { templateName: "custom_offer" } } });
    expect(setArg()["whatsapp.automations.offerUpdate"]).toEqual({ enabled: true, templateName: "custom_offer", params: ["{{firstName}}", "{{message}}"] });
    findOneAndUpdate.mockClear();
    await patch({ automations: { offerUpdate: { params: ["{{message}}"] } } });
    expect(setArg()["whatsapp.automations.offerUpdate"]).toEqual({ enabled: true, templateName: "mployedin_offer_update", params: ["{{message}}"] });
  });

  it("stores an explicitly empty params list as empty (a template with no body variables)", async () => {
    expect((await patch({ automations: { offerUpdate: { templateName: "no_variables", params: [] } } })).status).toBe(200);
    expect(setArg()["whatsapp.automations.offerUpdate"]).toEqual({ enabled: true, templateName: "no_variables", params: [] });
  });

  it("keeps a stored empty params list when a later PATCH changes only the switch or the template", async () => {
    persistWrites();
    expect((await patch({ automations: { offerUpdate: { templateName: "hello_world", params: [] } } })).status).toBe(200);
    expect(settings.automations.offerUpdate).toEqual({ enabled: true, templateName: "hello_world", params: [] });

    findOneAndUpdate.mockClear();
    expect((await patch({ automations: { offerUpdate: { enabled: false } } })).status).toBe(200);
    expect(setArg()["whatsapp.automations.offerUpdate"]).toEqual({ enabled: false, templateName: "hello_world", params: [] });

    findOneAndUpdate.mockClear();
    expect((await patch({ automations: { offerUpdate: { templateName: "another_plain_template" } } })).status).toBe(200);
    expect(setArg()["whatsapp.automations.offerUpdate"]).toEqual({ enabled: false, templateName: "another_plain_template", params: [] });
  });

  it("does not hand the stored params array to Mongo by reference", async () => {
    await patch({ automations: { offerUpdate: { enabled: false } } });
    const written = (setArg()["whatsapp.automations.offerUpdate"] as { params: string[] }).params;
    expect(written).toEqual(settings.automations.offerUpdate.params);
    expect(written).not.toBe(settings.automations.offerUpdate.params);
  });

  it("writes only the automations the request names", async () => {
    await patch({ automations: { offerUpdate: { enabled: false }, applicationStatus: undefined } });
    expect(Object.keys(setArg()).sort()).toEqual(["updatedBy", "whatsapp.automations.offerUpdate"]);
  });

  it.each([
    ["an empty update", {}],
    ["an empty automations object", { automations: {} }],
    ["an automation with nothing to change", { automations: { offerUpdate: {} } }],
    ["an automation key that does not exist", { automations: { notAnAutomation: { enabled: true } } }],
    ["a bad template name", { automations: { offerUpdate: { templateName: "Has Spaces" } } }],
    ["an upper-case template name", { automations: { offerUpdate: { templateName: "Offer_Update" } } }],
    ["a non-boolean switch", { enabled: "yes" }],
    ["a cap of 0", { dailyCapPerUser: 0 }],
    ["a cap of 21", { dailyCapPerUser: 21 }],
    ["a fractional cap", { dailyCapPerUser: 2.5 }],
    ["more than 10 params", { automations: { offerUpdate: { params: Array.from({ length: 11 }, () => "x") } } }],
    ["a param over 1024 characters", { automations: { offerUpdate: { params: ["x".repeat(1025)] } } }],
  ])("rejects %s and writes nothing", async (_label, body) => {
    expect((await patch(body)).status).toBe(400);
    expect(findOneAndUpdate).not.toHaveBeenCalled();
    expect(logActivity).not.toHaveBeenCalled();
  });

  it("rejects a body that is not JSON", async () => {
    const res = await PATCH(new NextRequest("http://x/api/admin/whatsapp/config", { method: "PATCH", body: "{nope", headers: { "content-type": "application/json" } }), noParams);
    expect(res.status).toBe(400);
    expect(findOneAndUpdate).not.toHaveBeenCalled();
  });
});

describe("whatsapp validators", () => {
  it("matches Meta template names and language codes", () => {
    expect(TEMPLATE_NAME_RE.test("hello_world")).toBe(true);
    expect(TEMPLATE_NAME_RE.test("Hello")).toBe(false);
    expect(TEMPLATE_NAME_RE.test("a b")).toBe(false);
    expect(TEMPLATE_NAME_RE.test("")).toBe(false);
    for (const ok of ["en", "ar", "en_US", "ar_AE"]) expect(templateLanguageSchema.safeParse(ok).success).toBe(true);
    for (const bad of ["EN", "eng", "en_us", "en-US", ""]) expect(templateLanguageSchema.safeParse(bad).success).toBe(false);
  });

  it("whatsAppConfigUpdateSchema accepts a partial automations map", () => {
    expect(whatsAppConfigUpdateSchema.safeParse({ automations: { offerUpdate: { enabled: true } } }).success).toBe(true);
    expect(whatsAppConfigUpdateSchema.safeParse({}).success).toBe(true);
  });

  it("whatsAppTestSendSchema fills the hello_world defaults", () => {
    expect(whatsAppTestSendSchema.parse({ to: "+971501234567" })).toEqual({ to: "+971501234567", templateName: "hello_world", language: "en_US", params: [] });
    expect(whatsAppTestSendSchema.safeParse({ to: "123" }).success).toBe(false);
    expect(whatsAppTestSendSchema.safeParse({ to: "+971501234567", templateName: "Bad Name" }).success).toBe(false);
  });

  it("broadcastWhatsAppSchema needs a template and a language", () => {
    expect(broadcastWhatsAppSchema.parse({ templateName: "promo", language: "en" })).toEqual({ templateName: "promo", language: "en", params: [] });
    expect(broadcastWhatsAppSchema.safeParse({ templateName: "promo" }).success).toBe(false);
    expect(broadcastWhatsAppSchema.safeParse({ language: "en" }).success).toBe(false);
  });

  const template = { templateName: "promo", language: "en" };
  const audience = { targetRoles: ["job_seeker"] };

  it("whatsAppScheduleCreateSchema requires runAt for once and cron for recurring", () => {
    const base = { name: "Weekly nudge", template, audience };
    expect(whatsAppScheduleCreateSchema.safeParse({ ...base, kind: "once" }).success).toBe(false);
    expect(whatsAppScheduleCreateSchema.safeParse({ ...base, kind: "once", runAt: "2026-10-05T09:00:00+04:00" }).success).toBe(true);
    expect(whatsAppScheduleCreateSchema.safeParse({ ...base, kind: "recurring" }).success).toBe(false);
    const ok = whatsAppScheduleCreateSchema.parse({ ...base, kind: "recurring", cron: "0 9 * * 1" });
    expect(ok).toMatchObject({ enabled: true, timezone: "Asia/Dubai", audience: { targetAll: false, targetRoles: ["job_seeker"] } });
    expect(whatsAppScheduleCreateSchema.safeParse({ ...base, kind: "once", runAt: "tomorrow" }).success).toBe(false);
    expect(whatsAppScheduleCreateSchema.safeParse({ ...base, kind: "once", runAt: "2026-10-05T09:00:00Z", audience: { targetRoles: ["owner"] } }).success).toBe(false);
  });

  it("whatsAppScheduleUpdateSchema is fully partial", () => {
    expect(whatsAppScheduleUpdateSchema.safeParse({}).success).toBe(true);
    expect(whatsAppScheduleUpdateSchema.safeParse({ enabled: false }).success).toBe(true);
    expect(whatsAppScheduleUpdateSchema.safeParse({ template }).success).toBe(true);
    expect(whatsAppScheduleUpdateSchema.safeParse({ kind: "weekly" }).success).toBe(false);
  });
});
