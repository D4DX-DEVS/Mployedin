/**
 * @jest-environment node
 */
export {};

const getWhatsAppSettings = jest.fn();
const getForceUnsubscribedUserIds = jest.fn();
jest.mock("@/models/SystemConfig", () => ({
  getWhatsAppSettings: (...a: unknown[]) => getWhatsAppSettings(...a),
  getForceUnsubscribedUserIds: (...a: unknown[]) => getForceUnsubscribedUserIds(...a),
}));
const prefFind = jest.fn();
jest.mock("@/models/NotificationPreference", () => ({ __esModule: true, default: { find: (...a: unknown[]) => prefFind(...a) } }));
const sendWhatsAppTemplate = jest.fn();
jest.mock("@/lib/communications/whatsapp/send", () => ({ sendWhatsAppTemplate: (...a: unknown[]) => sendWhatsAppTemplate(...a) }));
jest.mock("@/lib/logger", () => ({ __esModule: true, default: { error: jest.fn(), info: jest.fn(), warn: jest.fn() } }));
const updateOne = jest.fn();
jest.mock("@/models/User", () => ({ __esModule: true, default: { updateOne: (...a: unknown[]) => updateOne(...a) } }));
const logWhatsAppDelivery = jest.fn().mockResolvedValue(undefined);
jest.mock("@/models/WhatsAppMessageLog", () => ({ __esModule: true, default: {}, logWhatsAppDelivery: (...a: unknown[]) => logWhatsAppDelivery(...a) }));
import logger from "@/lib/logger";

import { sendWhatsAppToUsers } from "@/lib/communications/whatsapp/audienceSend";

// u1 and u4 sent START from the number on their profile (verifiedNumber); the send gate requires it.
const users = [
  { _id: "u1", name: "Sara Ali", role: "job_seeker", phone: "+971501234567", whatsapp: { verifiedNumber: "+971501234567" } },
  { _id: "u2", name: "Omar", role: "employer", phone: "+971501234568", whatsapp: { optOutAt: new Date() } },
  { _id: "u3", name: "Noor", role: "agent", phone: undefined },
  { _id: "u4", name: "Lina", role: "job_seeker", phone: "+971501234569", whatsapp: { verifiedNumber: "+971501234569" } },
];
const template = { templateName: "mployedin_admin_announcement", language: "en", params: ["{{firstName}}", "{{message}}"] };

const DAY = 24 * 60 * 60 * 1000;
const ago = (ms: number) => new Date(Date.now() - ms);

beforeEach(() => {
  jest.clearAllMocks();
  getWhatsAppSettings.mockResolvedValue({ enabled: true, dailyCapPerUser: 3, automations: {} });
  getForceUnsubscribedUserIds.mockResolvedValue(new Set());
  // u1, u2 and u4 have WhatsApp on for system notices; u3 does not.
  prefFind.mockReturnValue({ select: () => ({ lean: async () => [{ userId: "u1" }, { userId: "u2" }, { userId: "u4" }] }) });
  sendWhatsAppTemplate.mockResolvedValue({ status: "sent", messageId: "w" });
  updateOne.mockResolvedValue({ modifiedCount: 1 });
});

describe("Meta's wa_id", () => {
  it("stores the wa_id each send returned on its user, writing only when it differs", async () => {
    sendWhatsAppTemplate.mockImplementation(async (i: { userId: string }) => ({ status: "sent", messageId: "w", waId: i.userId === "u1" ? "971501234567" : "971501234569" }));
    await sendWhatsAppToUsers(users, template, { source: "broadcast" });
    expect(updateOne).toHaveBeenCalledTimes(2);
    expect(updateOne).toHaveBeenCalledWith({ _id: "u1", "whatsapp.waId": { $ne: "971501234567" } }, { $set: { "whatsapp.waId": "971501234567" } });
    expect(updateOne).toHaveBeenCalledWith({ _id: "u4", "whatsapp.waId": { $ne: "971501234569" } }, { $set: { "whatsapp.waId": "971501234569" } });
  });

  it("a failing write never fails the send", async () => {
    sendWhatsAppTemplate.mockResolvedValue({ status: "sent", messageId: "w", waId: "971501234567" });
    updateOne.mockRejectedValue(new Error("write blocked"));
    expect(await sendWhatsAppToUsers(users, template, { source: "schedule", scheduleId: "s1" })).toEqual({ sent: 2, failed: 0, skipped: 2 });
  });

  it("writes nothing for a send with no wa_id (mock mode)", async () => {
    await sendWhatsAppToUsers(users, template, { source: "broadcast" });
    expect(updateOne).not.toHaveBeenCalled();
  });
});

describe("a number that cannot be sent to", () => {
  it("counts it as skipped with reason invalid_phone, logs the skip, and never calls send", async () => {
    const withBad = [...users, { _id: "u5", name: "Bad", role: "job_seeker", phone: "0501234567" }];
    prefFind.mockReturnValue({ select: () => ({ lean: async () => [{ userId: "u1" }, { userId: "u4" }, { userId: "u5" }] }) });
    const res = await sendWhatsAppToUsers(withBad, template, { source: "broadcast", broadcastId: "b1" });
    expect(res).toEqual({ sent: 2, failed: 0, skipped: 3 });
    expect(sendWhatsAppTemplate).toHaveBeenCalledTimes(2);
    expect(sendWhatsAppTemplate).not.toHaveBeenCalledWith(expect.objectContaining({ userId: "u5" }));
    expect(logWhatsAppDelivery).toHaveBeenCalledTimes(1);
    expect(logWhatsAppDelivery).toHaveBeenCalledWith(expect.objectContaining({
      userId: "u5", to: "0501234567", kind: "template", templateName: "mployedin_admin_announcement", templateLanguage: "en",
      source: "broadcast", category: "system", broadcastId: "b1", status: "skipped", skipReason: "invalid_phone",
    }));
  });
});

describe("sendWhatsAppToUsers", () => {
  it("sends only to opted-in users with a phone and no STOP, resolving tokens per recipient", async () => {
    const res = await sendWhatsAppToUsers(users, template, { source: "broadcast", broadcastId: "b1", tokens: { title: "Maintenance", message: "Down tonight" } });
    expect(res).toEqual({ sent: 2, failed: 0, skipped: 2 });
    expect(prefFind).toHaveBeenCalledWith({ userId: { $in: ["u1", "u2", "u3", "u4"] }, unsubscribedAll: { $ne: true }, "categories.system.enabled": { $ne: false }, "categories.system.channels": "whatsapp" });
    expect(sendWhatsAppTemplate).toHaveBeenCalledTimes(2);
    expect(sendWhatsAppTemplate).toHaveBeenCalledWith({
      to: "+971501234567", templateName: "mployedin_admin_announcement", language: "en", params: ["Sara", "Down tonight"],
      userId: "u1", source: "broadcast", category: "system", broadcastId: "b1", scheduleId: undefined,
    });
  });
  it("counts failed sends without aborting the batch", async () => {
    sendWhatsAppTemplate.mockResolvedValueOnce({ status: "failed", error: new Error("boom") });
    const res = await sendWhatsAppToUsers(users, template, { source: "schedule", scheduleId: "s1" });
    expect(res).toEqual({ sent: 1, failed: 1, skipped: 2 });
  });
  it("counts a send the suppression list skipped as skipped, not sent or failed, and stores no wa_id", async () => {
    sendWhatsAppTemplate.mockResolvedValueOnce({ status: "skipped", reason: "opted_out" });
    const res = await sendWhatsAppToUsers(users, template, { source: "broadcast", broadcastId: "b1" });
    expect(res).toEqual({ sent: 1, failed: 0, skipped: 3 });
    expect(updateOne).not.toHaveBeenCalled();
  });
  // The admin's force_unsubscribe override (getUserOverride) silences a user on every channel; the
  // orchestrator honours it, and the WhatsApp broadcast/schedule leg must too.
  describe("an admin force_unsubscribe override", () => {
    it("leaves the user out, counted as skipped, with one override read for the whole batch", async () => {
      getForceUnsubscribedUserIds.mockResolvedValue(new Set(["u4"]));
      const res = await sendWhatsAppToUsers(users, template, { source: "broadcast", broadcastId: "b1" });
      expect(res).toEqual({ sent: 1, failed: 0, skipped: 3 });
      expect(sendWhatsAppTemplate).toHaveBeenCalledTimes(1);
      expect(sendWhatsAppTemplate).not.toHaveBeenCalledWith(expect.objectContaining({ userId: "u4" }));
      expect(getForceUnsubscribedUserIds).toHaveBeenCalledTimes(1);
    });
    it("applies to schedules too", async () => {
      getForceUnsubscribedUserIds.mockResolvedValue(new Set(["u1", "u4"]));
      expect(await sendWhatsAppToUsers(users, template, { source: "schedule", scheduleId: "s1" })).toEqual({ sent: 0, failed: 0, skipped: 4 });
      expect(sendWhatsAppTemplate).not.toHaveBeenCalled();
    });
    it("is not read when WhatsApp is switched off", async () => {
      getWhatsAppSettings.mockResolvedValue({ enabled: false, dailyCapPerUser: 3, automations: {} });
      await sendWhatsAppToUsers(users, template, { source: "broadcast" });
      expect(getForceUnsubscribedUserIds).not.toHaveBeenCalled();
    });
  });
  it("is a no-op for an empty batch", async () => {
    expect(await sendWhatsAppToUsers([], template, { source: "broadcast" })).toEqual({ sent: 0, failed: 0, skipped: 0 });
    expect(prefFind).not.toHaveBeenCalled();
  });

  describe("master switch", () => {
    it("sends nothing and says so when WhatsApp is switched off in settings", async () => {
      getWhatsAppSettings.mockResolvedValue({ enabled: false, dailyCapPerUser: 3, automations: {} });
      const res = await sendWhatsAppToUsers(users, template, { source: "broadcast", broadcastId: "b1" });
      expect(res).toEqual({ sent: 0, failed: 0, skipped: 4 });
      expect(sendWhatsAppTemplate).not.toHaveBeenCalled();
      expect(prefFind).not.toHaveBeenCalled();
      expect(logger.warn).toHaveBeenCalledWith(expect.objectContaining({ source: "broadcast", broadcastId: "b1", skipped: 4 }), expect.stringContaining("switched off"));
    });
    it("reads the settings once per call, not once per recipient", async () => {
      await sendWhatsAppToUsers(users, template, { source: "broadcast" });
      expect(getWhatsAppSettings).toHaveBeenCalledTimes(1);
    });
    it("does not read the settings for an empty batch", async () => {
      await sendWhatsAppToUsers([], template, { source: "broadcast" });
      expect(getWhatsAppSettings).not.toHaveBeenCalled();
    });
  });

  describe("system category switched off", () => {
    it("asks only for preferences whose system category is not disabled (absent counts as on)", async () => {
      await sendWhatsAppToUsers(users, template, { source: "broadcast" });
      expect(prefFind.mock.calls[0][0]["categories.system.enabled"]).toEqual({ $ne: false });
    });
    it("skips a user whose system category is off even though it still lists whatsapp", async () => {
      // The database applies the filter above; u4 is the user it excludes.
      prefFind.mockReturnValue({ select: () => ({ lean: async () => [{ userId: "u1" }, { userId: "u2" }] }) });
      const res = await sendWhatsAppToUsers(users, template, { source: "broadcast" });
      expect(res).toEqual({ sent: 1, failed: 0, skipped: 3 });
      expect(sendWhatsAppTemplate).toHaveBeenCalledTimes(1);
      expect(sendWhatsAppTemplate).toHaveBeenCalledWith(expect.objectContaining({ userId: "u1" }));
    });
  });

  describe("opt-out rule (same as the per-user notification path)", () => {
    /** One verified user; `whatsapp` adds to the verified state. */
    const only = (u: { whatsapp?: object }) => [{ _id: "u1", name: "Sara", phone: "+971501234567", whatsapp: { verifiedNumber: "+971501234567", ...u.whatsapp } }];
    beforeEach(() => {
      prefFind.mockReturnValue({ select: () => ({ lean: async () => [{ userId: "u1" }] }) });
    });
    it("skips a user whose STOP is newer than their opt-in", async () => {
      const whatsapp = { optInAt: ago(2 * DAY), optOutAt: ago(DAY) };
      expect(await sendWhatsAppToUsers(only({ whatsapp }), template, { source: "broadcast" })).toEqual({ sent: 0, failed: 0, skipped: 1 });
      expect(sendWhatsAppTemplate).not.toHaveBeenCalled();
    });
    it("sends to a user who sent STOP and later opted back in", async () => {
      const whatsapp = { optOutAt: ago(2 * DAY), optInAt: ago(DAY) };
      expect(await sendWhatsAppToUsers(only({ whatsapp }), template, { source: "broadcast" })).toEqual({ sent: 1, failed: 0, skipped: 0 });
    });
    it("lets a tie go to the STOP", async () => {
      const t = ago(DAY);
      const whatsapp = { optOutAt: t, optInAt: new Date(t) };
      expect(await sendWhatsAppToUsers(only({ whatsapp }), template, { source: "broadcast" })).toEqual({ sent: 0, failed: 0, skipped: 1 });
    });
    it("skips a user whose opt-out date cannot be read", async () => {
      const whatsapp = { optOutAt: "not-a-date" };
      expect(await sendWhatsAppToUsers(only({ whatsapp }), template, { source: "broadcast" })).toEqual({ sent: 0, failed: 0, skipped: 1 });
      expect(sendWhatsAppTemplate).not.toHaveBeenCalled();
    });
    it("sends to a verified user with no STOP", async () => {
      expect(await sendWhatsAppToUsers(only({}), template, { source: "broadcast" })).toEqual({ sent: 1, failed: 0, skipped: 0 });
      expect(await sendWhatsAppToUsers(only({ whatsapp: { optInAt: ago(DAY) } }), template, { source: "broadcast" })).toEqual({ sent: 1, failed: 0, skipped: 0 });
    });
  });

  // H1: a number typed on a profile gets nothing until a START from it has verified it (verification.ts).
  describe("number verification (START), same rule as the per-user notification path", () => {
    const one = (whatsapp: object | null, phone = "+971501234567") => [{ _id: "u1", name: "Sara", phone, whatsapp }];
    beforeEach(() => {
      prefFind.mockReturnValue({ select: () => ({ lean: async () => [{ userId: "u1" }] }) });
    });

    it("skips a user who never sent START, counts it as skipped and writes a not_verified skip row against the normalised number", async () => {
      const res = await sendWhatsAppToUsers(one({ optInAt: ago(DAY) }, "+971 50 123 4567"), template, { source: "broadcast", broadcastId: "b1" });
      expect(res).toEqual({ sent: 0, failed: 0, skipped: 1 });
      expect(sendWhatsAppTemplate).not.toHaveBeenCalled();
      expect(logWhatsAppDelivery).toHaveBeenCalledTimes(1);
      expect(logWhatsAppDelivery).toHaveBeenCalledWith(expect.objectContaining({
        userId: "u1", to: "+971501234567", kind: "template", templateName: "mployedin_admin_announcement", templateLanguage: "en",
        source: "broadcast", category: "system", broadcastId: "b1", status: "skipped", skipReason: "not_verified",
      }));
    });

    it("skips a user whose whatsapp state is null, on schedules too", async () => {
      const res = await sendWhatsAppToUsers(one(null), template, { source: "schedule", scheduleId: "s1" });
      expect(res).toEqual({ sent: 0, failed: 0, skipped: 1 });
      expect(logWhatsAppDelivery).toHaveBeenCalledWith(expect.objectContaining({ source: "schedule", scheduleId: "s1", skipReason: "not_verified" }));
    });

    it("skips a user whose START came from another number", async () => {
      const res = await sendWhatsAppToUsers(one({ verifiedNumber: "+971507654321" }), template, { source: "broadcast" });
      expect(res).toEqual({ sent: 0, failed: 0, skipped: 1 });
      expect(sendWhatsAppTemplate).not.toHaveBeenCalled();
    });

    it("sends to a verified user whose phone is typed in another format", async () => {
      const res = await sendWhatsAppToUsers(one({ verifiedNumber: "+971501234567" }, "+971 50 123 4567"), template, { source: "broadcast" });
      expect(res).toEqual({ sent: 1, failed: 0, skipped: 0 });
    });

    it("writes no not_verified row for a user already left out by STOP, the preference or an invalid number", async () => {
      await sendWhatsAppToUsers(one({ optOutAt: ago(DAY) }), template, { source: "broadcast" });
      expect(logWhatsAppDelivery).not.toHaveBeenCalled();
      await sendWhatsAppToUsers(one(null, "0501234567"), template, { source: "broadcast" });
      expect(logWhatsAppDelivery).toHaveBeenCalledTimes(1);
      expect(logWhatsAppDelivery).toHaveBeenCalledWith(expect.objectContaining({ skipReason: "invalid_phone" }));
    });
  });

  it("passes a zero-variable template through with no params", async () => {
    await sendWhatsAppToUsers(users.slice(0, 1), { templateName: "hello_world", language: "en_US", params: [] }, { source: "schedule", scheduleId: "s1" });
    expect(sendWhatsAppTemplate).toHaveBeenCalledWith(expect.objectContaining({ templateName: "hello_world", language: "en_US", params: [], scheduleId: "s1", source: "schedule" }));
  });
  it("defaults the category to system and lets per-user tokens win over context tokens", async () => {
    await sendWhatsAppToUsers(users.slice(0, 1), { ...template, params: ["{{firstName}}", "{{role}}"] }, { source: "broadcast", tokens: { firstName: "Override", role: "x" } });
    expect(sendWhatsAppTemplate).toHaveBeenCalledWith(expect.objectContaining({ category: "system", params: ["Sara", "job_seeker"] }));
  });
});
