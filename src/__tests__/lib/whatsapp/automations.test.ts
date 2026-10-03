/**
 * @jest-environment node
 */
export {};

const find = jest.fn();
jest.mock("@/models/WhatsAppTemplate", () => ({ __esModule: true, default: { find: (...a: unknown[]) => find(...a) } }));

import { automationForType, resolveTemplateLanguage, AUTOMATION_DEFAULTS, AUTOMATION_KEYS, DEFAULT_AUTOMATION_PARAMS } from "@/lib/communications/whatsapp/automationDefaults";
import { resolveAutomationBinding } from "@/lib/communications/whatsapp/automations";

const rows = (langs: string[]) => ({ select: () => ({ lean: async () => langs.map((language) => ({ language })) }) });
const settings = {
  enabled: true,
  dailyCapPerUser: 3,
  automations: Object.fromEntries(AUTOMATION_KEYS.map((k) => [k, { enabled: true, templateName: AUTOMATION_DEFAULTS[k].templateName, params: ["{{firstName}}", "{{message}}"] }])),
} as Parameters<typeof resolveAutomationBinding>[2];

/** Settings whose offerUpdate carries the given params; `undefined`/`null` model a document that never stored the field. */
function withOfferParams(params: string[] | null | undefined): typeof settings {
  const offerUpdate = { ...settings.automations.offerUpdate, params } as unknown as typeof settings.automations.offerUpdate;
  return { ...settings, automations: { ...settings.automations, offerUpdate } };
}

function live() {
  process.env.WHATSAPP_ACCESS_TOKEN = "tok";
  process.env.WHATSAPP_PHONE_NUMBER_ID = "555";
  process.env.WHATSAPP_APP_SECRET = "sec";
  process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = "verify";
}
/** Mock mode: no Cloud API credentials. Set explicitly so a test does not depend on the ambient env. */
function mockMode() {
  for (const k of ["WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_APP_SECRET", "WHATSAPP_WEBHOOK_VERIFY_TOKEN"]) process.env[k] = "";
}
afterEach(() => {
  jest.clearAllMocks();
  mockMode();
});

describe("automationForType", () => {
  it.each([
    ["application_received", "applicationReceived"],
    ["application_status_update", "applicationStatus"],
    ["application_update", "applicationStatus"],
    ["application_invite", "interviewInvite"],
    ["interview_scheduled", "interviewScheduled"],
    ["interview_update", "interviewScheduled"],
    ["interview_reminder", "interviewReminder"],
    ["offer_update", "offerUpdate"],
    ["payment", "commissionPaid"],
  ])("%s → %s", (type, key) => expect(automationForType(type)).toBe(key));
  it("has no automation for rejections or mentions", () => {
    expect(automationForType("mention")).toBeNull();
    expect(automationForType("job_rejected")).toBeNull();
  });
});

describe("resolveTemplateLanguage", () => {
  it("is ar for Arabic users, en otherwise", () => {
    expect(resolveTemplateLanguage("ar")).toBe("ar");
    expect(resolveTemplateLanguage("en")).toBe("en");
    expect(resolveTemplateLanguage(undefined)).toBe("en");
  });
});

describe("resolveAutomationBinding", () => {
  it("prefers the user's language when that translation is approved", async () => {
    live();
    find.mockReturnValue(rows(["en", "ar"]));
    const b = await resolveAutomationBinding("application_status_update", "ar", settings);
    expect(b).toEqual({ key: "applicationStatus", templateName: "mployedin_application_status", language: "ar", params: ["{{firstName}}", "{{message}}"] });
    expect(find).toHaveBeenCalledWith({ name: "mployedin_application_status", status: "APPROVED", language: { $in: ["ar", "en", "en_US"] } });
  });
  it("falls back to English", async () => {
    live();
    find.mockReturnValue(rows(["en_US"]));
    expect((await resolveAutomationBinding("offer_update", "ar", settings))?.language).toBe("en_US");
  });
  it("returns null when nothing is approved, the automation is off, or the type has none", async () => {
    live();
    find.mockReturnValue(rows([]));
    expect(await resolveAutomationBinding("offer_update", "en", settings)).toBeNull();
    const off = { ...settings, automations: { ...settings.automations, offerUpdate: { ...settings.automations.offerUpdate, enabled: false } } };
    expect(await resolveAutomationBinding("offer_update", "en", off)).toBeNull();
    expect(await resolveAutomationBinding("mention", "en", settings)).toBeNull();
  });
  it("skips the approval lookup in mock mode so dev sees mock rows", async () => {
    mockMode();
    const b = await resolveAutomationBinding("interview_scheduled", "en", settings);
    expect(b?.language).toBe("en");
    expect(find).not.toHaveBeenCalled();
  });

  it("uses the default template when the settings object has no entry for that automation", async () => {
    live();
    find.mockReturnValue(rows(["en"]));
    const noOffer = { ...settings, automations: { ...settings.automations } } as typeof settings;
    delete (noOffer.automations as Partial<typeof settings.automations>).offerUpdate;
    const b = await resolveAutomationBinding("offer_update", "en", noOffer);
    expect(b).toEqual({ key: "offerUpdate", templateName: "mployedin_offer_update", language: "en", params: ["{{firstName}}", "{{message}}"] });
    expect(find).toHaveBeenCalledWith({ name: "mployedin_offer_update", status: "APPROVED", language: { $in: ["en", "en_US"] } });

    const noAutomations = { enabled: true, dailyCapPerUser: 3 } as typeof settings;
    expect((await resolveAutomationBinding("offer_update", "en", noAutomations))?.templateName).toBe("mployedin_offer_update");
  });

  it("returns null without a lookup when the automation has an empty template name", async () => {
    live();
    const blankName = { ...settings, automations: { ...settings.automations, offerUpdate: { ...settings.automations.offerUpdate, templateName: "" } } };
    expect(await resolveAutomationBinding("offer_update", "en", blankName)).toBeNull();
    expect(find).not.toHaveBeenCalled();
  });

  it("keeps an explicitly empty params list: a template with no body variables gets no parameters", async () => {
    live();
    find.mockReturnValue(rows(["en"]));
    const noVariables = withOfferParams([]);
    expect((await resolveAutomationBinding("offer_update", "en", noVariables))?.params).toEqual([]);
    mockMode();
    expect((await resolveAutomationBinding("offer_update", "en", noVariables))?.params).toEqual([]);
  });

  it.each([[undefined], [null]])("falls back to the default params when the automation has none (%p)", async (absent) => {
    live();
    find.mockReturnValue(rows(["en"]));
    const b = await resolveAutomationBinding("offer_update", "en", withOfferParams(absent));
    expect(b?.params).toEqual(["{{firstName}}", "{{message}}"]);
  });

  it("prefers en over en_US when both are approved, whatever order the database returns them", async () => {
    live();
    find.mockReturnValue(rows(["en_US", "en"]));
    expect((await resolveAutomationBinding("offer_update", "en", settings))?.language).toBe("en");
    find.mockReturnValue(rows(["en_US", "en"]));
    expect((await resolveAutomationBinding("offer_update", "ar", settings))?.language).toBe("en");
  });

  it("does not repeat a language in the lookup when the user's language is English", async () => {
    live();
    find.mockReturnValue(rows(["en"]));
    await resolveAutomationBinding("offer_update", "en", settings);
    expect(find).toHaveBeenCalledWith({ name: "mployedin_offer_update", status: "APPROVED", language: { $in: ["en", "en_US"] } });
  });

  it("returns copies of params, never the shared or the stored array", async () => {
    live();
    find.mockReturnValue(rows(["en"]));
    const fromSettings = await resolveAutomationBinding("offer_update", "en", settings);
    expect(fromSettings?.params).toEqual(["{{firstName}}", "{{message}}"]);
    expect(fromSettings?.params).not.toBe(settings.automations.offerUpdate.params);
    fromSettings?.params.push("{{mutated}}");
    expect(settings.automations.offerUpdate.params).toEqual(["{{firstName}}", "{{message}}"]);

    const noParams = withOfferParams(undefined);
    const fromDefault = await resolveAutomationBinding("offer_update", "en", noParams);
    expect(fromDefault?.params).not.toBe(DEFAULT_AUTOMATION_PARAMS);
    fromDefault?.params.push("{{mutated}}");
    expect(DEFAULT_AUTOMATION_PARAMS).toEqual(["{{firstName}}", "{{message}}"]);

    const emptyStored: string[] = [];
    const fromEmpty = await resolveAutomationBinding("offer_update", "en", withOfferParams(emptyStored));
    expect(fromEmpty?.params).not.toBe(emptyStored);
    fromEmpty?.params.push("{{mutated}}");
    expect(emptyStored).toEqual([]);

    mockMode();
    const mockBinding = await resolveAutomationBinding("offer_update", "en", noParams);
    expect(mockBinding?.params).not.toBe(DEFAULT_AUTOMATION_PARAMS);
    expect(mockBinding?.params).toEqual(["{{firstName}}", "{{message}}"]);
  });
});
