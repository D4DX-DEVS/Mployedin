/**
 * @jest-environment node
 *
 * getWhatsAppSettings() must hand back a complete settings object whichever way
 * the SystemConfig document comes off the database:
 *
 *  - a hydrated doc materialises the single-nested `automations.*` defaults in
 *    memory even when the collection has no such key (see the Mongoose nested
 *    default hydration trap), so the stored shape lies;
 *  - a lean/plain doc has only what is really stored;
 *  - a `$set: { "whatsapp.automations.offerUpdate.enabled": false }` on a doc
 *    that never had the key creates `{ enabled: false }` with no templateName
 *    or params, because update validators do not run.
 *
 * In every case a missing key must get its default, never `undefined`, and the
 * master switch must not flip off just because a field is absent. It must flip
 * off when the config cannot be read at all: the switch is the kill switch, so
 * it fails closed.
 */
import mongoose from "mongoose";
import SystemConfig, { getWhatsAppSettings, readWhatsAppSettings } from "@/models/SystemConfig";
import { AUTOMATION_DEFAULTS, AUTOMATION_KEYS, DEFAULT_AUTOMATION_PARAMS } from "@/lib/communications/whatsapp/automationDefaults";

const mockWarn = jest.fn();
jest.mock("@/lib/logger", () => ({ __esModule: true, default: { error: jest.fn(), info: jest.fn(), debug: jest.fn(), warn: (...a: unknown[]) => mockWarn(...a) } }));

const DEFAULT_PARAMS = ["{{firstName}}", "{{message}}"];

function allDefaults() {
  return Object.fromEntries(
    AUTOMATION_KEYS.map((k) => [k, { enabled: true, templateName: AUTOMATION_DEFAULTS[k].templateName, params: DEFAULT_PARAMS }]),
  );
}

function serve(doc: unknown) {
  jest.spyOn(SystemConfig, "findOne").mockResolvedValue(doc as never);
}

afterEach(() => {
  jest.restoreAllMocks();
  mockWarn.mockClear();
});

describe("getWhatsAppSettings", () => {
  it("gives every default for a document written before the field existed (hydrated)", async () => {
    // What the driver returns for an old doc: no `whatsapp` key at all.
    serve(SystemConfig.hydrate({ _id: new mongoose.Types.ObjectId(), key: "notification_system" }));
    expect(await getWhatsAppSettings()).toEqual({ enabled: true, dailyCapPerUser: 3, automations: allDefaults() });
    expect(mockWarn).not.toHaveBeenCalled();
  });

  it("gives every default for a brand-new document", async () => {
    serve(new SystemConfig({ key: "notification_system" }));
    expect(await getWhatsAppSettings()).toEqual({ enabled: true, dailyCapPerUser: 3, automations: allDefaults() });
  });

  it("gives every default for a plain (lean) document with no whatsapp key", async () => {
    serve({ key: "notification_system" });
    expect(await getWhatsAppSettings()).toEqual({ enabled: true, dailyCapPerUser: 3, automations: allDefaults() });
    expect(mockWarn).not.toHaveBeenCalled();
  });

  it("fills missing keys from defaults on a lean document that stored only some of them", async () => {
    serve({
      key: "notification_system",
      whatsapp: {
        enabled: false,
        dailyCapPerUser: 5,
        // A $set on one leaf creates the subdocument without templateName/params.
        automations: { offerUpdate: { enabled: false }, applicationStatus: { enabled: true, templateName: "custom_status", params: ["{{firstName}}"] } },
      },
    });
    const s = await getWhatsAppSettings();
    expect(s.enabled).toBe(false);
    expect(s.dailyCapPerUser).toBe(5);
    expect(s.automations.offerUpdate).toEqual({ enabled: false, templateName: AUTOMATION_DEFAULTS.offerUpdate.templateName, params: DEFAULT_PARAMS });
    expect(s.automations.applicationStatus).toEqual({ enabled: true, templateName: "custom_status", params: ["{{firstName}}"] });
    expect(s.automations.commissionPaid).toEqual({ enabled: true, templateName: AUTOMATION_DEFAULTS.commissionPaid.templateName, params: DEFAULT_PARAMS });
    expect(Object.keys(s.automations).sort()).toEqual([...AUTOMATION_KEYS].sort());
  });

  it("merges a partially stored hydrated document over the defaults", async () => {
    serve(
      SystemConfig.hydrate({
        _id: new mongoose.Types.ObjectId(),
        key: "notification_system",
        whatsapp: { enabled: false, automations: { interviewReminder: { enabled: false } } },
      }),
    );
    const s = await getWhatsAppSettings();
    expect(s.enabled).toBe(false);
    expect(s.dailyCapPerUser).toBe(3);
    expect(s.automations.interviewReminder.enabled).toBe(false);
    expect(s.automations.interviewReminder.templateName).toBe(AUTOMATION_DEFAULTS.interviewReminder.templateName);
    expect(s.automations.interviewReminder.params).toEqual(DEFAULT_PARAMS);
    expect(s.automations.interviewInvite).toEqual({ enabled: true, templateName: AUTOMATION_DEFAULTS.interviewInvite.templateName, params: DEFAULT_PARAMS });
  });

  it("keeps an admin's template binding and params", async () => {
    serve({
      key: "notification_system",
      whatsapp: { enabled: true, dailyCapPerUser: 10, automations: { commissionPaid: { enabled: true, templateName: "my_payout", params: ["{{firstName}}", "{{message}}", "{{extra}}"] } } },
    });
    const s = await getWhatsAppSettings();
    expect(s.dailyCapPerUser).toBe(10);
    expect(s.automations.commissionPaid).toEqual({ enabled: true, templateName: "my_payout", params: ["{{firstName}}", "{{message}}", "{{extra}}"] });
  });

  it("falls back to the default template name when the stored one is empty, but keeps an explicitly empty params list", async () => {
    serve({
      key: "notification_system",
      whatsapp: { automations: { offerUpdate: { enabled: true, templateName: "", params: [] } } },
    });
    const s = await getWhatsAppSettings();
    expect(s.automations.offerUpdate).toEqual({ enabled: true, templateName: AUTOMATION_DEFAULTS.offerUpdate.templateName, params: [] });
  });

  it("keeps a stored empty params list as empty (a template with no body variables), lean", async () => {
    serve({ key: "notification_system", whatsapp: { automations: { offerUpdate: { enabled: true, templateName: "hello_world", params: [] } } } });
    const s = await getWhatsAppSettings();
    expect(s.automations.offerUpdate).toEqual({ enabled: true, templateName: "hello_world", params: [] });
    expect(s.automations.applicationStatus.params).toEqual(DEFAULT_PARAMS);
  });

  it("keeps a stored empty params list as empty, hydrated", async () => {
    serve(
      SystemConfig.hydrate({
        _id: new mongoose.Types.ObjectId(),
        key: "notification_system",
        whatsapp: { automations: { offerUpdate: { enabled: true, templateName: "hello_world", params: [] } } },
      }),
    );
    const s = await getWhatsAppSettings();
    expect(s.automations.offerUpdate).toEqual({ enabled: true, templateName: "hello_world", params: [] });
    expect(s.automations.applicationStatus.params).toEqual(DEFAULT_PARAMS);
  });

  it.each([[undefined], [null], ["{{firstName}}"], [{ 0: "{{firstName}}" }]])("takes the default params when the stored params are absent or not a list (%p)", async (bad) => {
    serve({ key: "notification_system", whatsapp: { automations: { offerUpdate: { enabled: true, templateName: "custom_offer", params: bad } } } });
    const s = await getWhatsAppSettings();
    expect(s.automations.offerUpdate).toEqual({ enabled: true, templateName: "custom_offer", params: DEFAULT_PARAMS });
    expect(s.automations.offerUpdate.params).not.toBe(DEFAULT_AUTOMATION_PARAMS);
  });

  it("returns a copy of stored params, including an empty list", async () => {
    const stored = { enabled: true, templateName: "hello_world", params: [] as string[] };
    serve({ key: "notification_system", whatsapp: { automations: { offerUpdate: stored } } });
    const s = await getWhatsAppSettings();
    expect(s.automations.offerUpdate.params).not.toBe(stored.params);
    s.automations.offerUpdate.params.push("{{mutated}}");
    expect(stored.params).toEqual([]);
  });

  it.each([[0], [-2], [Number.NaN], [Number.POSITIVE_INFINITY], [0.5], ["5"], [null]])("falls back to a cap of 3 for a bad stored cap (%p)", async (bad) => {
    serve({ key: "notification_system", whatsapp: { dailyCapPerUser: bad } });
    expect((await getWhatsAppSettings()).dailyCapPerUser).toBe(3);
  });

  it.each([
    [1, 1],
    [2.5, 2],
    [7.9, 7],
    [20, 20],
    [21, 20],
    [1000, 20],
  ])("clamps a stored cap of %p to the integer %p", async (stored, expected) => {
    serve({ key: "notification_system", whatsapp: { dailyCapPerUser: stored } });
    expect((await getWhatsAppSettings()).dailyCapPerUser).toBe(expected);
  });

  it("fails closed when the config cannot be read: sends off, defaults elsewhere, and logs it", async () => {
    const err = new Error("db down");
    jest.spyOn(SystemConfig, "findOne").mockRejectedValue(err);
    expect(await getWhatsAppSettings()).toEqual({ enabled: false, dailyCapPerUser: 3, automations: allDefaults() });
    expect(mockWarn).toHaveBeenCalledTimes(1);
    expect(mockWarn.mock.calls[0][0]).toEqual({ err });
  });

  it("does not hand out the shared default params array", async () => {
    serve({ key: "notification_system" });
    const s = await getWhatsAppSettings();
    s.automations.applicationReceived.params.push("{{mutated}}");
    expect(AUTOMATION_DEFAULTS.applicationReceived.params).toEqual(DEFAULT_PARAMS);
    expect(DEFAULT_AUTOMATION_PARAMS).toEqual(DEFAULT_PARAMS);
    expect((await getWhatsAppSettings()).automations.applicationReceived.params).toEqual(DEFAULT_PARAMS);
  });

  it("keeps the default params frozen", () => {
    expect(Object.isFrozen(DEFAULT_AUTOMATION_PARAMS)).toBe(true);
    for (const k of AUTOMATION_KEYS) expect(Object.isFrozen(AUTOMATION_DEFAULTS[k].params)).toBe(true);
  });
});

describe("readWhatsAppSettings (for the admin editor)", () => {
  it("returns the same merged settings as the senders see", async () => {
    serve({ key: "notification_system", whatsapp: { enabled: false, dailyCapPerUser: 5 } });
    expect(await readWhatsAppSettings()).toEqual(await getWhatsAppSettings());
  });

  it("throws when the config cannot be read, so an editor never sees (and saves back) the fail-closed defaults", async () => {
    jest.spyOn(SystemConfig, "findOne").mockRejectedValue(new Error("db down"));
    await expect(readWhatsAppSettings()).rejects.toThrow("db down");
    // The senders' path is unchanged: still fails closed.
    expect((await getWhatsAppSettings()).enabled).toBe(false);
  });
});

describe("SystemConfig schema", () => {
  it("declares the whatsapp scheduler cron toggle, on by default", () => {
    const doc = new SystemConfig({ key: "notification_system" });
    expect(doc.cronJobs.whatsappScheduler.enabled).toBe(true);
  });

  it("defaults automation params to the shared default tokens, as a fresh array", () => {
    const doc = new SystemConfig({ key: "notification_system" });
    const params = doc.whatsapp.automations.offerUpdate.params;
    expect([...params]).toEqual(DEFAULT_PARAMS);
    expect(Object.isFrozen(params)).toBe(false);
  });

  it("caps the per-user daily limit between 1 and 20", async () => {
    const at = async (n: number) => {
      try {
        await new SystemConfig({ key: "k", whatsapp: { dailyCapPerUser: n } }).validate();
        return undefined;
      } catch (e) {
        return (e as mongoose.Error.ValidationError).errors["whatsapp.dailyCapPerUser"];
      }
    };
    expect(await at(0)).toBeDefined();
    expect(await at(21)).toBeDefined();
    expect(await at(1)).toBeUndefined();
    expect(await at(20)).toBeUndefined();
  });

  it("requires a template name on a stored automation", async () => {
    const doc = new SystemConfig({ key: "k", whatsapp: { automations: { offerUpdate: { enabled: true, templateName: "" } } } });
    await expect(doc.validate()).rejects.toThrow(/templateName/);
  });
});
