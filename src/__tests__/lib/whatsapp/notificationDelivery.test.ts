/**
 * @jest-environment node
 */
export {};

const getWhatsAppSettings = jest.fn();
jest.mock("@/models/SystemConfig", () => ({ getWhatsAppSettings: (...a: unknown[]) => getWhatsAppSettings(...a) }));
const countDocuments = jest.fn().mockResolvedValue(0);
const logWhatsAppDelivery = jest.fn().mockResolvedValue(undefined);
jest.mock("@/models/WhatsAppMessageLog", () => ({
  __esModule: true,
  default: { countDocuments: (...a: unknown[]) => countDocuments(...a) },
  logWhatsAppDelivery: (...a: unknown[]) => logWhatsAppDelivery(...a),
}));
const resolveAutomationBinding = jest.fn();
jest.mock("@/lib/communications/whatsapp/automations", () => ({ resolveAutomationBinding: (...a: unknown[]) => resolveAutomationBinding(...a) }));
const sendWhatsAppTemplate = jest.fn();
const sendWhatsAppText = jest.fn();
jest.mock("@/lib/communications/whatsapp/send", () => ({
  sendWhatsAppTemplate: (...a: unknown[]) => sendWhatsAppTemplate(...a),
  sendWhatsAppText: (...a: unknown[]) => sendWhatsAppText(...a),
}));
// The fresh read of the user's phone and WhatsApp state at send time.
let freshUser: unknown = null;
const select = jest.fn();
const findById = jest.fn();
const updateOne = jest.fn();
jest.mock("@/models/User", () => ({ __esModule: true, default: { findById: (...a: unknown[]) => findById(...a), updateOne: (...a: unknown[]) => updateOne(...a) } }));
jest.mock("@/lib/logger", () => ({ __esModule: true, default: { error: jest.fn(), info: jest.fn(), warn: jest.fn() } }));

import { deliverNotificationWhatsApp, type DeliveryInput } from "@/lib/communications/whatsapp/notificationDelivery";
import { toWaRecipient } from "@/lib/communications/whatsapp/phone";

const settings = { enabled: true, dailyCapPerUser: 3, automations: {} };
const recipient = { name: "Sara Ali", role: "job_seeker", locale: "en", phone: "+971501234567", whatsapp: null };
const input = { userId: "u1", type: "application_status_update", category: "applications", recipient, title: "Application update", message: "Your application for Nurse was shortlisted.", params: { status: "shortlisted" } };
const binding = { key: "applicationStatus", templateName: "t", language: "en", params: [] };

/**
 * The fixture user has sent START from the number on their profile (the send gate requires it), unless a
 * test sets `verifiedNumber` itself: a test about another gate should not trip over this one.
 */
function verified(fresh: unknown): unknown {
  if (!fresh || typeof fresh !== "object") return fresh;
  const f = fresh as { phone?: string; whatsapp?: Record<string, unknown> | null };
  if (f.whatsapp && "verifiedNumber" in f.whatsapp) return fresh;
  const wa = toWaRecipient(f.phone);
  return { ...f, whatsapp: { ...(f.whatsapp ?? {}), ...(wa ? { verifiedNumber: `+${wa}` } : {}) } };
}

/** The fresh read mirrors the snapshot's phone and WhatsApp state unless a test says the user changed since. */
function deliver(i: DeliveryInput, fresh?: unknown) {
  freshUser = verified(fresh !== undefined ? fresh : i.recipient ? { phone: i.recipient.phone, whatsapp: i.recipient.whatsapp } : null);
  return deliverNotificationWhatsApp(i);
}

beforeEach(() => {
  jest.clearAllMocks();
  freshUser = null;
  findById.mockReturnValue({ select });
  select.mockReturnValue({ lean: async () => freshUser });
  getWhatsAppSettings.mockResolvedValue(settings);
  countDocuments.mockResolvedValue(0);
  sendWhatsAppTemplate.mockResolvedValue({ status: "sent", messageId: "wamid.1" });
  sendWhatsAppText.mockResolvedValue({ status: "sent", messageId: "wamid.2" });
  updateOne.mockResolvedValue({ modifiedCount: 1 });
});

describe("deliverNotificationWhatsApp", () => {
  it("sends the bound template with resolved tokens", async () => {
    resolveAutomationBinding.mockResolvedValue({ key: "applicationStatus", templateName: "mployedin_application_status", language: "en", params: ["{{firstName}}", "{{message}}"] });
    const out = await deliver(input);
    expect(out).toEqual({ status: "sent", messageId: "wamid.1", via: "template" });
    expect(sendWhatsAppTemplate).toHaveBeenCalledWith({
      to: "+971501234567", templateName: "mployedin_application_status", language: "en",
      params: ["Sara", "Your application for Nurse was shortlisted."],
      userId: "u1", source: "orchestrator", category: "applications", notificationType: "application_status_update",
    });
  });

  it("falls back to free text inside the 24 h window when no template is bound", async () => {
    resolveAutomationBinding.mockResolvedValue(null);
    const out = await deliver({ ...input, recipient: { ...recipient, whatsapp: { lastInboundAt: new Date(Date.now() - 60_000) } } });
    expect(out).toEqual({ status: "sent", messageId: "wamid.2", via: "text" });
    expect(sendWhatsAppText).toHaveBeenCalledWith(expect.objectContaining({ body: "Application update\n\nYour application for Nurse was shortlisted." }));
  });

  it("skips and logs when no template is bound and the window is closed", async () => {
    resolveAutomationBinding.mockResolvedValue(null);
    const out = await deliver(input);
    expect(out).toEqual({ status: "skipped", reason: "no_template_outside_window" });
    expect(logWhatsAppDelivery).toHaveBeenCalledWith(expect.objectContaining({ status: "skipped", skipReason: "no_template_outside_window", to: "+971501234567", notificationType: "application_status_update" }));
    expect(sendWhatsAppTemplate).not.toHaveBeenCalled();
    expect(sendWhatsAppText).not.toHaveBeenCalled();
  });

  it.each([
    ["disabled_by_admin", { settings: { ...settings, enabled: false } }],
    ["no_phone", { recipient: { ...recipient, phone: undefined } }],
    ["invalid_phone", { recipient: { ...recipient, phone: "0501234567" } }],
    ["opted_out", { recipient: { ...recipient, whatsapp: { optOutAt: new Date() } } }],
    ["not_verified", { recipient: { ...recipient, whatsapp: { verifiedNumber: undefined } } }],
    ["daily_cap", { count: 3 }],
  ])("skips with %s", async (reason, over: { settings?: unknown; recipient?: unknown; count?: number }) => {
    if (over.settings) getWhatsAppSettings.mockResolvedValue(over.settings);
    if (over.count !== undefined) countDocuments.mockResolvedValue(over.count);
    resolveAutomationBinding.mockResolvedValue({ key: "applicationStatus", templateName: "t", language: "en", params: [] });
    const out = await deliver({ ...input, recipient: (over.recipient ?? recipient) as typeof recipient });
    expect(out).toEqual({ status: "skipped", reason });
    expect(sendWhatsAppTemplate).not.toHaveBeenCalled();
    if (reason !== "no_phone") expect(logWhatsAppDelivery).toHaveBeenCalledWith(expect.objectContaining({ status: "skipped", skipReason: reason }));
  });

  it("counts the cap over the orchestrator's own sends to the number in the last 24 h", async () => {
    resolveAutomationBinding.mockResolvedValue({ key: "applicationStatus", templateName: "t", language: "en", params: [] });
    await deliver(input, { phone: "+971 50 123 4567", whatsapp: null });
    const filter = countDocuments.mock.calls[0][0] as { to: string; userId?: string; source: string; status: { $in: string[] }; sentAt: { $gte: Date } };
    // Per number, not per account: several accounts typing one number share its cap. `to` is stored as send.ts normalises it.
    expect(filter.to).toBe("+971501234567");
    expect(filter).not.toHaveProperty("userId");
    expect(filter.source).toBe("orchestrator");
    expect(filter.status.$in.sort()).toEqual(["delivered", "mock", "read", "sent"]);
    expect(Date.now() - filter.sentAt.$gte.getTime()).toBeGreaterThan(23 * 60 * 60 * 1000);
  });

  it("reports a number on the suppression list (send skipped it) as skipped opted_out, storing no wa_id", async () => {
    resolveAutomationBinding.mockResolvedValue({ key: "applicationStatus", templateName: "t", language: "en", params: [] });
    sendWhatsAppTemplate.mockResolvedValue({ status: "skipped", reason: "opted_out" });
    expect(await deliver(input)).toEqual({ status: "skipped", reason: "opted_out" });
    expect(updateOne).not.toHaveBeenCalled();
    // send.ts wrote the skip row; nothing here writes a second one.
    expect(logWhatsAppDelivery).not.toHaveBeenCalled();
  });

  it("reports a suppressed number on the free-text path the same way", async () => {
    resolveAutomationBinding.mockResolvedValue(null);
    sendWhatsAppText.mockResolvedValue({ status: "skipped", reason: "opted_out" });
    const out = await deliver({ ...input, recipient: { ...recipient, whatsapp: { lastInboundAt: new Date(Date.now() - 60_000) } } });
    expect(out).toEqual({ status: "skipped", reason: "opted_out" });
  });

  it("reports failed when the send fails", async () => {
    resolveAutomationBinding.mockResolvedValue({ key: "applicationStatus", templateName: "t", language: "en", params: [] });
    sendWhatsAppTemplate.mockResolvedValue({ status: "failed", error: new Error("Template paused"), errorKind: "template_error" });
    expect(await deliver(input)).toEqual({ status: "failed", reason: "Template paused" });
  });
});

describe("opt-out (STOP) handling", () => {
  const HOUR = 60 * 60 * 1000;
  const ago = (ms: number) => new Date(Date.now() - ms);

  beforeEach(() => resolveAutomationBinding.mockResolvedValue(binding));

  it("skips when optOutAt is later than optInAt", async () => {
    const whatsapp = { optInAt: ago(48 * HOUR), optOutAt: ago(HOUR) };
    const out = await deliver({ ...input, recipient: { ...recipient, whatsapp } });
    expect(out).toEqual({ status: "skipped", reason: "opted_out" });
    expect(sendWhatsAppTemplate).not.toHaveBeenCalled();
    expect(logWhatsAppDelivery).toHaveBeenCalledWith(expect.objectContaining({ status: "skipped", skipReason: "opted_out" }));
  });

  it("sends when the user opted back in after the STOP", async () => {
    const whatsapp = { optOutAt: ago(48 * HOUR), optInAt: ago(HOUR) };
    const out = await deliver({ ...input, recipient: { ...recipient, whatsapp } });
    expect(out).toEqual({ status: "sent", messageId: "wamid.1", via: "template" });
  });

  it("reads dates that went through JSON as ISO strings (Inngest step results)", async () => {
    const stopped = { optInAt: ago(48 * HOUR).toISOString(), optOutAt: ago(HOUR).toISOString() };
    expect(await deliver({ ...input, recipient: { ...recipient, whatsapp: stopped } })).toEqual({ status: "skipped", reason: "opted_out" });
    const restarted = { optOutAt: ago(48 * HOUR).toISOString(), optInAt: ago(HOUR).toISOString() };
    expect((await deliver({ ...input, recipient: { ...recipient, whatsapp: restarted } })).status).toBe("sent");
  });

  it("treats an unreadable optOutAt as opted out rather than sending", async () => {
    const out = await deliver({ ...input, recipient: { ...recipient, whatsapp: { optOutAt: "not-a-date" } } });
    expect(out).toEqual({ status: "skipped", reason: "opted_out" });
  });

  it("ignores a null optOutAt", async () => {
    const out = await deliver({ ...input, recipient: { ...recipient, whatsapp: { optOutAt: null, optInAt: ago(HOUR) } } });
    expect(out.status).toBe("sent");
  });
});

// H1: anyone can type any number on a profile. Nothing goes to it until a START from that number
// (signed by Meta) has verified it; the rule is verification.ts.
describe("number verification (START)", () => {
  beforeEach(() => resolveAutomationBinding.mockResolvedValue(binding));

  it("skips with not_verified, logs the skip against the normalised number, and neither counts nor sends", async () => {
    // Opted in under the old toggle, never sent START.
    const out = await deliver(input, { phone: "+971 50 123 4567", whatsapp: { optInAt: new Date(), verifiedNumber: undefined } });
    expect(out).toEqual({ status: "skipped", reason: "not_verified" });
    expect(logWhatsAppDelivery).toHaveBeenCalledWith(expect.objectContaining({
      userId: "u1", to: "+971501234567", source: "orchestrator", category: "applications", notificationType: "application_status_update",
      status: "skipped", skipReason: "not_verified",
    }));
    expect(countDocuments).not.toHaveBeenCalled();
    expect(sendWhatsAppTemplate).not.toHaveBeenCalled();
    expect(sendWhatsAppText).not.toHaveBeenCalled();
  });

  it("skips when the START came from another number than the one on the profile", async () => {
    const out = await deliver(input, { phone: "+971501234567", whatsapp: { verifiedNumber: "+971507654321" } });
    expect(out).toEqual({ status: "skipped", reason: "not_verified" });
    expect(sendWhatsAppTemplate).not.toHaveBeenCalled();
  });

  it("sends when the verified number is the profile phone, however the phone was typed", async () => {
    const out = await deliver(input, { phone: "+971 50 123 4567", whatsapp: { verifiedNumber: "+971501234567" } });
    expect(out).toEqual({ status: "sent", messageId: "wamid.1", via: "template" });
  });

  it("a STOP is reported as opted_out even when the number is also unverified", async () => {
    const out = await deliver(input, { phone: recipient.phone, whatsapp: { optOutAt: new Date(), verifiedNumber: undefined } });
    expect(out).toEqual({ status: "skipped", reason: "opted_out" });
  });

  it("takes verification from the fresh read, not the orchestrator's snapshot", async () => {
    const snapshotVerified = { ...input, recipient: { ...recipient, whatsapp: { verifiedNumber: "+971501234567" } } };
    expect(await deliver(snapshotVerified, { phone: recipient.phone, whatsapp: { verifiedNumber: undefined } })).toEqual({ status: "skipped", reason: "not_verified" });
    const snapshotUnverified = { ...input, recipient: { ...recipient, whatsapp: { verifiedNumber: undefined } } };
    expect((await deliver(snapshotUnverified, { phone: recipient.phone, whatsapp: { verifiedNumber: "+971501234567" } })).status).toBe("sent");
  });

  it("gates free text inside the 24 h window too", async () => {
    resolveAutomationBinding.mockResolvedValue(null);
    const out = await deliver(input, { phone: recipient.phone, whatsapp: { lastInboundAt: new Date(), verifiedNumber: undefined } });
    expect(out).toEqual({ status: "skipped", reason: "not_verified" });
    expect(sendWhatsAppText).not.toHaveBeenCalled();
  });
});

describe("fresh read at send time", () => {
  const HOUR = 60 * 60 * 1000;
  const optedIn = { optInAt: new Date(Date.now() - 48 * HOUR) };
  const stoppedSince = { optInAt: new Date(Date.now() - 48 * HOUR), optOutAt: new Date(Date.now() - 60_000) };

  beforeEach(() => resolveAutomationBinding.mockResolvedValue(binding));

  it("skips when the snapshot says opted in but the fresh read says STOP", async () => {
    const out = await deliver({ ...input, recipient: { ...recipient, whatsapp: optedIn } }, { phone: recipient.phone, whatsapp: stoppedSince });
    expect(out).toEqual({ status: "skipped", reason: "opted_out" });
    expect(sendWhatsAppTemplate).not.toHaveBeenCalled();
    expect(sendWhatsAppText).not.toHaveBeenCalled();
    expect(logWhatsAppDelivery).toHaveBeenCalledWith(expect.objectContaining({ status: "skipped", skipReason: "opted_out", to: "+971501234567" }));
  });

  it("sends when the snapshot says STOP but the fresh read says the user opted back in", async () => {
    const restarted = { optOutAt: new Date(Date.now() - 48 * HOUR), optInAt: new Date(Date.now() - 60_000) };
    const out = await deliver({ ...input, recipient: { ...recipient, whatsapp: stoppedSince } }, { phone: recipient.phone, whatsapp: restarted });
    expect(out.status).toBe("sent");
  });

  it("sends to the number on the fresh read when it changed since the snapshot", async () => {
    await deliver(input, { phone: "+971507654321", whatsapp: null });
    expect(sendWhatsAppTemplate).toHaveBeenCalledWith(expect.objectContaining({ to: "+971507654321" }));
  });

  it("opens the free-text window from the fresh lastInboundAt", async () => {
    resolveAutomationBinding.mockResolvedValue(null);
    const out = await deliver(input, { phone: recipient.phone, whatsapp: { lastInboundAt: new Date(Date.now() - 60_000) } });
    expect(out).toEqual({ status: "sent", messageId: "wamid.2", via: "text" });
  });

  it("skips with no_phone, and no log row, when the user no longer exists", async () => {
    const out = await deliver(input, null);
    expect(out).toEqual({ status: "skipped", reason: "no_phone" });
    expect(logWhatsAppDelivery).not.toHaveBeenCalled();
    expect(sendWhatsAppTemplate).not.toHaveBeenCalled();
  });

  it("skips with no_phone when the number was removed since the snapshot", async () => {
    const out = await deliver(input, { phone: undefined, whatsapp: null });
    expect(out).toEqual({ status: "skipped", reason: "no_phone" });
    expect(sendWhatsAppTemplate).not.toHaveBeenCalled();
  });

  it("reads only the phone and WhatsApp state, by the notification's userId", async () => {
    await deliver(input);
    expect(findById).toHaveBeenCalledWith("u1");
    expect(select).toHaveBeenCalledWith("phone whatsapp");
  });
});

describe("gate order", () => {
  it("applies the daily cap to free text inside the window too", async () => {
    resolveAutomationBinding.mockResolvedValue(null);
    countDocuments.mockResolvedValue(3);
    const out = await deliver({ ...input, recipient: { ...recipient, whatsapp: { lastInboundAt: new Date() } } });
    expect(out).toEqual({ status: "skipped", reason: "daily_cap" });
    expect(sendWhatsAppText).not.toHaveBeenCalled();
  });

  it("when the master switch is off, reads only the number for the skipped row: no binding lookup, no count", async () => {
    getWhatsAppSettings.mockResolvedValue({ ...settings, enabled: false });
    await deliver(input);
    expect(findById).toHaveBeenCalledWith("u1");
    expect(countDocuments).not.toHaveBeenCalled();
    expect(resolveAutomationBinding).not.toHaveBeenCalled();
  });

  it("takes the number for the master-switch skip row from the fresh read, not the orchestrator's snapshot", async () => {
    getWhatsAppSettings.mockResolvedValue({ ...settings, enabled: false });
    // The orchestrator no longer puts the phone in its step output (Inngest stores it).
    const { phone: _phone, whatsapp: _whatsapp, ...snapshot } = recipient;
    await deliver({ ...input, recipient: snapshot }, { phone: "+971507654321", whatsapp: null });
    expect(logWhatsAppDelivery).toHaveBeenCalledWith(expect.objectContaining({ skipReason: "disabled_by_admin", to: "+971507654321" }));
  });

  it("sends from the fresh read when the snapshot carries no phone or WhatsApp state", async () => {
    resolveAutomationBinding.mockResolvedValue(binding);
    const { phone: _phone, whatsapp: _whatsapp, ...snapshot } = recipient;
    const out = await deliver({ ...input, recipient: snapshot }, { phone: recipient.phone, whatsapp: null });
    expect(out.status).toBe("sent");
    expect(sendWhatsAppTemplate).toHaveBeenCalledWith(expect.objectContaining({ to: "+971501234567" }));
  });

  it("reports a mock send as mock", async () => {
    resolveAutomationBinding.mockResolvedValue(binding);
    sendWhatsAppTemplate.mockResolvedValue({ status: "mock", messageId: "mock-1" });
    expect(await deliver(input)).toEqual({ status: "mock", messageId: "mock-1", via: "template" });
  });
});

describe("Meta's wa_id", () => {
  beforeEach(() => resolveAutomationBinding.mockResolvedValue(binding));

  it("stores the wa_id Meta returned on the user, writing only when it differs", async () => {
    sendWhatsAppTemplate.mockResolvedValue({ status: "sent", messageId: "wamid.1", waId: "5215512345678" });
    expect(await deliver(input)).toEqual({ status: "sent", messageId: "wamid.1", via: "template" });
    expect(updateOne).toHaveBeenCalledWith({ _id: "u1", "whatsapp.waId": { $ne: "5215512345678" } }, { $set: { "whatsapp.waId": "5215512345678" } });
  });

  it("stores it after a free-text send too", async () => {
    resolveAutomationBinding.mockResolvedValue(null);
    sendWhatsAppText.mockResolvedValue({ status: "sent", messageId: "wamid.2", waId: "971501234567" });
    await deliver(input, { phone: recipient.phone, whatsapp: { lastInboundAt: new Date(Date.now() - 60_000) } });
    expect(updateOne).toHaveBeenCalledWith({ _id: "u1", "whatsapp.waId": { $ne: "971501234567" } }, { $set: { "whatsapp.waId": "971501234567" } });
  });

  it("a failing write never fails the send", async () => {
    sendWhatsAppTemplate.mockResolvedValue({ status: "sent", messageId: "wamid.1", waId: "971501234567" });
    updateOne.mockRejectedValue(new Error("write blocked"));
    expect(await deliver(input)).toEqual({ status: "sent", messageId: "wamid.1", via: "template" });
  });

  it("writes nothing when the outcome carries no wa_id (mock mode)", async () => {
    sendWhatsAppTemplate.mockResolvedValue({ status: "mock", messageId: "mock-1" });
    await deliver(input);
    expect(updateOne).not.toHaveBeenCalled();
  });
});

describe("skipped log rows", () => {
  it("writes no row for a recipient with no phone, whatever the reason", async () => {
    const noPhone = { ...input, recipient: { ...recipient, phone: undefined } };
    expect(await deliver(noPhone)).toEqual({ status: "skipped", reason: "no_phone" });
    expect(await deliver({ ...input, recipient: null })).toEqual({ status: "skipped", reason: "no_phone" });
    getWhatsAppSettings.mockResolvedValue({ ...settings, enabled: false });
    expect(await deliver(noPhone)).toEqual({ status: "skipped", reason: "disabled_by_admin" });
    expect(await deliver({ ...input, recipient: null })).toEqual({ status: "skipped", reason: "disabled_by_admin" });
    expect(logWhatsAppDelivery).not.toHaveBeenCalled();
  });

  it("stores `to` normalised (+digits) when the number is valid", async () => {
    resolveAutomationBinding.mockResolvedValue(null);
    await deliver({ ...input, recipient: { ...recipient, phone: "971501234567" } });
    expect(logWhatsAppDelivery).toHaveBeenCalledWith(expect.objectContaining({ skipReason: "no_template_outside_window", to: "+971501234567" }));
  });

  it("normalises `to` on a master-switch skip too", async () => {
    getWhatsAppSettings.mockResolvedValue({ ...settings, enabled: false });
    await deliver({ ...input, recipient: { ...recipient, phone: "971501234567" } });
    expect(logWhatsAppDelivery).toHaveBeenCalledWith(expect.objectContaining({ skipReason: "disabled_by_admin", to: "+971501234567" }));
  });

  it("keeps the raw input as `to` only for an invalid number", async () => {
    await deliver({ ...input, recipient: { ...recipient, phone: "0501234567" } });
    expect(logWhatsAppDelivery).toHaveBeenCalledWith(expect.objectContaining({ skipReason: "invalid_phone", to: "0501234567" }));
  });
});
