/**
 * @jest-environment node
 *
 * The number-level suppression list end to end: the real webhook handler,
 * send.ts, the orchestrator step and the broadcast/schedule leg, over an
 * in-memory list. The case it guards: anyone can type a number on their
 * profile and tick the WhatsApp channel (which once counted as opt-in), and
 * before the list existed that undid the number owner's STOP.
 *
 * Also end to end: the channel toggle is a preference, not consent (optIn.ts),
 * and nothing is sent to a number until a START from it, carrying the
 * account's personal code, has verified it.
 */
export {};

/** The list's entries by number, written the way the model's helpers write them ($max on each time; a START never deletes). */
const listed = new Map<string, { optedOutAt?: Date; liftedAt?: Date }>();
const later = (a: Date | undefined, b: Date) => (a && a > b ? a : b);
jest.mock("@/models/WhatsAppSuppression", () => {
  // The real "is suppressed" rule, over the in-memory entries.
  const { isSuppressionInForce } = jest.requireActual("@/models/WhatsAppSuppression");
  return {
    __esModule: true,
    isSuppressionInForce,
    isNumberSuppressed: async (n: string) => isSuppressionInForce(listed.get(n)),
    suppressNumber: async (n: string, at: Date) => {
      const prev = listed.get(n) ?? {};
      listed.set(n, { ...prev, optedOutAt: later(prev.optedOutAt, at) });
    },
    liftSuppression: async (n: string, at: Date) => {
      const prev = listed.get(n);
      if (prev) listed.set(n, { ...prev, liftedAt: later(prev.liftedAt, at) });
    },
  };
});
/** Whether the number's entry suppresses it now (the rule every send reads). */
const isListed = async (n: string) => (await import("@/models/WhatsAppSuppression")).isNumberSuppressed(n);
jest.mock("@/lib/communications/whatsapp/config", () => ({ isWhatsAppEnabled: () => true, whatsAppMode: () => "live" }));
const sendTemplateMessage = jest.fn(async (..._a: unknown[]) => ({ messageId: "wamid.T" }));
const sendTextMessage = jest.fn(async (..._a: unknown[]) => ({ messageId: "wamid.X" }));
jest.mock("@/lib/communications/whatsapp/cloudApi", () => ({
  sendTemplateMessage: (...a: unknown[]) => sendTemplateMessage(...a),
  sendTextMessage: (...a: unknown[]) => sendTextMessage(...a),
  markMessageRead: jest.fn().mockResolvedValue(undefined),
}));
const logWhatsAppDelivery = jest.fn().mockResolvedValue(undefined);
jest.mock("@/models/WhatsAppMessageLog", () => ({
  __esModule: true,
  // exists: the START guidance's redelivery check (no reply sent yet).
  default: { countDocuments: jest.fn().mockResolvedValue(0), updateOne: jest.fn(), exists: jest.fn().mockResolvedValue(null) },
  logWhatsAppDelivery: (...a: unknown[]) => logWhatsAppDelivery(...a),
}));
jest.mock("@/models/WhatsAppTemplate", () => ({ __esModule: true, default: { updateOne: jest.fn() } }));
jest.mock("@/models/SystemConfig", () => ({
  getWhatsAppSettings: async () => ({ enabled: true, dailyCapPerUser: 3, automations: {} }),
  getForceUnsubscribedUserIds: async () => new Set(),
}));
jest.mock("@/lib/communications/whatsapp/automations", () => ({
  resolveAutomationBinding: async () => ({ key: "applicationStatus", templateName: "mployedin_application_status", language: "en", params: [] }),
}));
jest.mock("@/models/ConsentLog", () => ({ __esModule: true, default: { create: jest.fn().mockResolvedValue({}) } }));
jest.mock("@/models/NotificationPreference", () => ({
  __esModule: true,
  default: {
    updateMany: jest.fn().mockResolvedValue({ modifiedCount: 1 }),
    // The broadcast leg's eligibility read: WhatsApp ticked on the system category.
    find: () => ({ select: () => ({ lean: async () => [{ userId: USER_ID }] }) }),
  },
  getOrCreatePreferences: jest.fn().mockResolvedValue({}),
  CATEGORY_KEYS: ["jobs", "applications", "interviews", "offers", "profile_views", "marketing", "system", "placements", "commissions", "team"],
}));
jest.mock("@/lib/logger", () => ({ __esModule: true, default: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() } }));

const USER_ID = "64d000000000000000000009";
const PHONE = "+971501234567";
/** The account's personal START code (startCode.ts). */
const CODE = "K7P4QX";
/** The account's WhatsApp state as the database holds it: the User writes below land here, and a test can set it. */
let state: Record<string, unknown> = {};
/** Applies the `whatsapp.*` paths of a User update to `state`, so a STOP, a START or a toggle lands where the send paths read it. */
function applyToState(update: Record<string, Record<string, unknown> | undefined>): void {
  const next = { ...state };
  for (const [op, fields] of Object.entries(update)) {
    for (const [path, value] of Object.entries(fields ?? {})) {
      if (!path.startsWith("whatsapp.")) continue;
      const key = path.slice("whatsapp.".length);
      if (op === "$set") next[key] = value;
      else if (op === "$unset") delete next[key];
      else if (op === "$max") next[key] = next[key] && (next[key] as Date) > (value as Date) ? next[key] : value;
    }
  }
  state = next;
}
jest.mock("@/models/User", () => ({
  __esModule: true,
  default: {
    find: () => ({ select: () => ({ lean: async () => [{ _id: USER_ID, name: "Sara", locale: "en", phone: PHONE, whatsapp: state }] }) }),
    // `START <code>`: the account holding the code.
    findOne: (filter: Record<string, unknown>) => ({
      select: () => ({ lean: async () => ((filter["whatsapp.startCode"] as { $eq?: string } | undefined)?.$eq === CODE ? { _id: USER_ID, name: "Sara", locale: "en", phone: PHONE, whatsapp: state } : null) }),
    }),
    findById: () => ({ select: () => ({ lean: async () => ({ phone: PHONE, whatsapp: state }) }) }),
    updateMany: jest.fn(async (_filter: unknown, update: Record<string, Record<string, unknown>>) => {
      applyToState(update);
      return { modifiedCount: 1 };
    }),
    updateOne: jest.fn(async (_filter: unknown, update: Record<string, Record<string, unknown>>) => {
      applyToState(update);
      return { modifiedCount: 1 };
    }),
  },
}));

import { applyInboundMessage } from "@/lib/communications/whatsapp/webhookHandlers";
import { recordWhatsAppOptInChange } from "@/lib/communications/whatsapp/optIn";
import { deliverNotificationWhatsApp } from "@/lib/communications/whatsapp/notificationDelivery";
import { sendWhatsAppToUsers } from "@/lib/communications/whatsapp/audienceSend";
import { sendWhatsAppTemplate } from "@/lib/communications/whatsapp/send";

const STOP_AT = new Date("2026-10-02T10:00:00Z");
const RETICK_AT = new Date("2026-10-02T11:00:00Z");
const START_AT = new Date("2026-10-02T12:00:00Z");
const inbound = (text: string, timestamp: Date) =>
  ({ kind: "inbound_message", waMessageId: `wamid.${text}`, fromWaId: "971501234567", timestamp, type: "text", text }) as const;
const notification = () =>
  deliverNotificationWhatsApp({ userId: USER_ID, type: "application_status_update", category: "applications", recipient: { name: "Sara", role: "job_seeker", locale: "en" }, title: "Update", message: "Shortlisted" });
const broadcast = () =>
  sendWhatsAppToUsers([{ _id: USER_ID, name: "Sara", role: "job_seeker", phone: PHONE, whatsapp: state }], { templateName: "mployedin_admin_announcement", language: "en", params: [] }, { source: "broadcast", broadcastId: "b1" });

const VERIFIED_AT = new Date("2026-10-01T09:00:00Z");

beforeEach(() => {
  jest.clearAllMocks();
  listed.clear();
  // Opted in and verified by a START from the number the day before.
  state = { optInAt: VERIFIED_AT, verifiedNumber: PHONE, verifiedAt: VERIFIED_AT };
});

describe("a STOP from the number", () => {
  it("lists the number and still confirms the STOP to it", async () => {
    await applyInboundMessage(inbound("STOP", STOP_AT));
    expect(await isListed(PHONE)).toBe(true);
    expect(sendTextMessage).toHaveBeenCalledTimes(1);
    expect(sendTextMessage).toHaveBeenCalledWith(expect.objectContaining({ to: "971501234567" }));
  });

  it("holds even when the account's own opt-out is gone: orchestrator, broadcast and schedule all skip", async () => {
    await applyInboundMessage(inbound("STOP", STOP_AT));
    // An opt-in stamped after the STOP and the opt-out cleared, as re-ticking the channel did before the toggle
    // stopped counting as consent: the list belongs to the number and still holds.
    state = { optInAt: RETICK_AT, verifiedNumber: PHONE };

    expect(await notification()).toEqual({ status: "skipped", reason: "opted_out" });
    expect(await broadcast()).toEqual({ sent: 0, failed: 0, skipped: 1 });
    const schedule = await sendWhatsAppToUsers([{ _id: USER_ID, phone: PHONE, whatsapp: state }], { templateName: "t", language: "en", params: [] }, { source: "schedule", scheduleId: "s1" });
    expect(schedule).toEqual({ sent: 0, failed: 0, skipped: 1 });
    expect(sendTemplateMessage).not.toHaveBeenCalled();
    expect(logWhatsAppDelivery).toHaveBeenCalledWith(expect.objectContaining({ to: PHONE, status: "skipped", skipReason: "opted_out", source: "orchestrator" }));
    expect(logWhatsAppDelivery).toHaveBeenCalledWith(expect.objectContaining({ to: PHONE, status: "skipped", skipReason: "opted_out", source: "broadcast" }));
  });

  it("holds for a test send to the number, typed in any format", async () => {
    await applyInboundMessage(inbound("STOP", STOP_AT));
    const out = await sendWhatsAppTemplate({ to: "+971 50 123 4567", templateName: "hello_world", language: "en_US", params: [], source: "test" });
    expect(out).toEqual({ status: "skipped", reason: "opted_out" });
    expect(sendTemplateMessage).not.toHaveBeenCalled();
  });

  it("is lifted by a START from the number, and sends resume", async () => {
    await applyInboundMessage(inbound("STOP", STOP_AT));
    expect(state.optOutAt).toEqual(STOP_AT);
    await applyInboundMessage(inbound("START", START_AT));
    expect(await isListed(PHONE)).toBe(false);
    // The entry stays, with the START's time: a STOP redelivered later must not list the number again.
    expect(listed.get(PHONE)).toEqual({ optedOutAt: STOP_AT, liftedAt: START_AT });
    expect(state).toEqual(expect.objectContaining({ optInAt: START_AT, verifiedNumber: PHONE, verifiedAt: START_AT }));
    expect(state).not.toHaveProperty("optOutAt");
    expect((await notification()).status).toBe("sent");
    expect(sendTemplateMessage).toHaveBeenCalledTimes(1);
  });

  it("is not lifted by a stale START older than the STOP", async () => {
    await applyInboundMessage(inbound("STOP", START_AT));
    await applyInboundMessage(inbound("START", STOP_AT));
    expect(await isListed(PHONE)).toBe(true);
  });

  // C3: Meta redelivers a STOP whose first delivery answered 503. Arriving after a newer START, it must not
  // silently block a user who was just told their updates are on.
  it("redelivered after a newer START, an older STOP leaves the number unlisted and sends going out", async () => {
    await applyInboundMessage(inbound("STOP", STOP_AT));
    await applyInboundMessage(inbound("START", START_AT));
    await applyInboundMessage(inbound("STOP", STOP_AT));
    expect(await isListed(PHONE)).toBe(false);
    expect(listed.get(PHONE)).toEqual({ optedOutAt: STOP_AT, liftedAt: START_AT });
    expect((await notification()).status).toBe("sent");
  });

  // F8 with C3: STOP(t0), START(t1), STOP(t2), START(t3) delivered as t0, t3, t1, t2. The newest choice is START.
  it("out-of-order redeliveries end on the newest choice: an older START cannot move the opt-in back for a later-delivered STOP", async () => {
    const at = (h: number) => new Date(Date.UTC(2026, 9, 2, h));
    await applyInboundMessage(inbound("STOP", at(8)));
    await applyInboundMessage(inbound("START", at(12)));
    await applyInboundMessage(inbound("START", at(9)));
    expect(state).toEqual(expect.objectContaining({ optInAt: at(12), verifiedAt: at(12) }));
    await applyInboundMessage(inbound("STOP", at(10)));
    expect(state.optOutAt).toBeUndefined();
    expect(await isListed(PHONE)).toBe(false);
    expect((await notification()).status).toBe("sent");
  });

  it("a STOP newer than that START lists the number again", async () => {
    const LATER_STOP = new Date(START_AT.getTime() + 3_600_000);
    await applyInboundMessage(inbound("STOP", STOP_AT));
    await applyInboundMessage(inbound("START", START_AT));
    await applyInboundMessage(inbound("STOP", LATER_STOP));
    expect(await isListed(PHONE)).toBe(true);
    expect(await notification()).toEqual({ status: "skipped", reason: "opted_out" });
  });
});

describe("the channel toggle is a preference; a START is the consent", () => {
  const toggleOn = () => recordWhatsAppOptInChange({ userId: USER_ID, before: false, after: true, source: "notification_settings" });
  const toggleOff = () => recordWhatsAppOptInChange({ userId: USER_ID, before: true, after: false, source: "notification_settings" });
  /** The consent rows written, in order, as granted or not. */
  const ledger = async () => {
    const ConsentLog = (await import("@/models/ConsentLog")).default as unknown as { create: jest.Mock };
    return ConsentLog.create.mock.calls.map(([row]) => (row as { granted: boolean; source: string }));
  };

  // F3: for a number a START verified, off then on really resumes sends, so the ledger records the grant again.
  it("a verified account that turns the channel off and back on: withdrawal, then grant, and sends resume", async () => {
    await toggleOff();
    await toggleOn();
    expect(await ledger()).toEqual([
      expect.objectContaining({ granted: false, source: "notification_settings" }),
      expect.objectContaining({ granted: true, source: "notification_settings" }),
    ]);
    // Nothing stamped on the account: START stays the only thing that does.
    expect(state).toEqual({ optInAt: VERIFIED_AT, verifiedNumber: PHONE, verifiedAt: VERIFIED_AT });
    expect((await notification()).status).toBe("sent");
  });

  it("turning the channel on after a STOP does not resume sends; a START does", async () => {
    await applyInboundMessage(inbound("STOP", STOP_AT));
    await toggleOn();
    // An opted-out account gets no grant row from the toggle.
    expect((await ledger()).filter((row) => row.source === "notification_settings")).toEqual([]);
    // The number's list entry aside: the account's own STOP still stands after the toggle.
    listed.clear();
    expect(state.optOutAt).toEqual(STOP_AT);
    expect(await notification()).toEqual({ status: "skipped", reason: "opted_out" });
    expect(await broadcast()).toEqual({ sent: 0, failed: 0, skipped: 1 });
    expect(sendTemplateMessage).not.toHaveBeenCalled();

    await applyInboundMessage(inbound("START", START_AT));
    expect((await notification()).status).toBe("sent");
    expect(await broadcast()).toEqual({ sent: 1, failed: 0, skipped: 0 });
  });

  // H1: a stranger's number typed on a profile, with the channel ticked, receives nothing. K3: nor does a plain START
  // from that number switch the account on; only the account's own code does.
  it("a typed number with the channel on but no START gets nothing, on every path; a plain START verifies nothing; START with the account's code turns sends on", async () => {
    state = {};
    await toggleOn();
    expect(state).toEqual({});
    // An unverified account gets no grant row from the toggle.
    expect(await ledger()).toEqual([]);
    expect(await notification()).toEqual({ status: "skipped", reason: "not_verified" });
    expect(await broadcast()).toEqual({ sent: 0, failed: 0, skipped: 1 });
    expect(sendTemplateMessage).not.toHaveBeenCalled();
    expect(logWhatsAppDelivery).toHaveBeenCalledWith(expect.objectContaining({ to: PHONE, status: "skipped", skipReason: "not_verified", source: "orchestrator" }));
    expect(logWhatsAppDelivery).toHaveBeenCalledWith(expect.objectContaining({ to: PHONE, status: "skipped", skipReason: "not_verified", source: "broadcast" }));

    await applyInboundMessage(inbound("START", START_AT));
    expect(state.verifiedNumber).toBeUndefined();
    expect(await notification()).toEqual({ status: "skipped", reason: "not_verified" });
    // The sender is told how to do it instead.
    expect(sendTextMessage).toHaveBeenCalledWith(expect.objectContaining({ to: "971501234567", body: expect.stringMatching(/couldn't confirm this number/) }));

    await applyInboundMessage(inbound(`start ${CODE.toLowerCase()}`, new Date(START_AT.getTime() + 60_000)));
    expect(state.verifiedNumber).toBe(PHONE);
    expect((await notification()).status).toBe("sent");
  });
});
