/**
 * @jest-environment node
 */
export {};

const userFind = jest.fn();
/** `User.findOne({ "whatsapp.startCode": { $eq, $type: "string" } })`: the account a `START <code>` names. */
const userFindOne = jest.fn();
const userUpdateMany = jest.fn().mockResolvedValue({ modifiedCount: 1 });
jest.mock("@/models/User", () => ({
  __esModule: true,
  default: {
    find: (...a: unknown[]) => userFind(...a),
    findOne: (...a: unknown[]) => userFindOne(...a),
    updateMany: (...a: unknown[]) => userUpdateMany(...a),
  },
}));
const prefUpdateMany = jest.fn().mockResolvedValue({ modifiedCount: 1 });
const getOrCreatePreferences = jest.fn().mockResolvedValue({});
jest.mock("@/models/NotificationPreference", () => ({
  __esModule: true,
  default: { updateMany: (...a: unknown[]) => prefUpdateMany(...a) },
  getOrCreatePreferences: (...a: unknown[]) => getOrCreatePreferences(...a),
  CATEGORY_KEYS: ["jobs", "applications", "interviews", "offers", "profile_views", "marketing", "system", "placements", "commissions", "team"],
}));
const consentCreate = jest.fn().mockResolvedValue({});
jest.mock("@/models/ConsentLog", () => ({ __esModule: true, default: { create: (...a: unknown[]) => consentCreate(...a) } }));
const logUpdateOne = jest.fn().mockResolvedValue({ modifiedCount: 1 });
/** Whether the START guidance was already sent for a message (the redelivery check). */
const logExists = jest.fn().mockResolvedValue(null);
jest.mock("@/models/WhatsAppMessageLog", () => ({
  __esModule: true,
  default: { updateOne: (...a: unknown[]) => logUpdateOne(...a), exists: (...a: unknown[]) => logExists(...a) },
}));
const templateUpdateOne = jest.fn().mockResolvedValue({});
jest.mock("@/models/WhatsAppTemplate", () => ({ __esModule: true, default: { updateOne: (...a: unknown[]) => templateUpdateOne(...a) } }));
const sendWhatsAppText = jest.fn().mockResolvedValue({ status: "mock", messageId: "m" });
jest.mock("@/lib/communications/whatsapp/send", () => ({ sendWhatsAppText: (...a: unknown[]) => sendWhatsAppText(...a) }));
const markMessageRead = jest.fn().mockResolvedValue(undefined);
jest.mock("@/lib/communications/whatsapp/cloudApi", () => ({ markMessageRead: (...a: unknown[]) => markMessageRead(...a) }));
jest.mock("@/lib/logger", () => ({ __esModule: true, default: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() } }));
const getWhatsAppSettings = jest.fn();
jest.mock("@/models/SystemConfig", () => ({ getWhatsAppSettings: (...a: unknown[]) => getWhatsAppSettings(...a) }));
const suppressNumber = jest.fn().mockResolvedValue(undefined);
const liftSuppression = jest.fn().mockResolvedValue(undefined);
jest.mock("@/models/WhatsAppSuppression", () => ({
  __esModule: true,
  suppressNumber: (...a: unknown[]) => suppressNumber(...a),
  liftSuppression: (...a: unknown[]) => liftSuppression(...a),
}));

import logger from "@/lib/logger";
import { applyStatusEvent, applyInboundMessage, applyTemplateStatusUpdate, processWebhookEvents, numberMatchFilter } from "@/lib/communications/whatsapp/webhookHandlers";

const ts = new Date("2026-09-29T10:00:00Z");
const EARLIER = new Date("2026-09-29T09:00:00Z");
const LATER = new Date("2026-09-29T11:00:00Z");
const WA_ID = "971501234567";
/** Both accounts carry the sender's number on their profile, typed as people type it. */
const USER = { _id: "64d000000000000000000009", name: "Sara Ali", locale: "en", phone: "+971 50 123 4567" };
const USER_2 = { _id: "64d00000000000000000000a", name: "Sara Ali (second account)", locale: "ar", phone: "+971 50 123 4567" };
const userSelect = jest.fn();
/** What `User.find(...).select(...).lean()` resolves to. */
const lean = (rows: unknown[]) => ({
  select: (...a: unknown[]) => {
    userSelect(...a);
    return { lean: async () => rows };
  },
});
const text = (t?: string, ev: { timestamp?: Date; fromWaId?: string } = {}) =>
  ({ kind: "inbound_message", waMessageId: "wamid.IN", fromWaId: ev.fromWaId ?? WA_ID, timestamp: ev.timestamp ?? ts, type: "text", text: t }) as const;
/** The update for an inbound message that changes nothing else: $max keeps the window from shrinking. */
const WINDOW = { $max: { "whatsapp.lastInboundAt": ts }, $set: { "whatsapp.waId": WA_ID } };
const STOP_UPDATE = { $set: { "whatsapp.optOutAt": ts, "whatsapp.waId": WA_ID }, $max: { "whatsapp.lastInboundAt": ts } };
/** The signed sender, normalised the way the send gate normalises User.phone. */
const SENDER = "+971501234567";
/** The account's personal START code (startCode.ts): the settings page's button types `START <code>`. */
const CODE = "K7P4QX";
const START_CODE = `START ${CODE}`;
/** Verified for the sender's number by an earlier START: what a plain START resumes. */
const VERIFIED = { verifiedNumber: SENDER };
const codeSelect = jest.fn();
/** The account `User.findOne({ "whatsapp.startCode": { $eq: CODE, $type: "string" } }).select(...).lean()` resolves to (null: no such code). */
const codeOwner = (doc: unknown) =>
  userFindOne.mockReturnValue({
    select: (...a: unknown[]) => {
      codeSelect(...a);
      return { lean: async () => doc };
    },
  });
const START_UPDATE = {
  $unset: { "whatsapp.optOutAt": 1 },
  $set: {
    "whatsapp.optInSource": "whatsapp_start",
    "whatsapp.waId": WA_ID,
    "whatsapp.verifiedNumber": SENDER,
  },
  // $max: an older START redelivered after a newer one cannot move them back.
  $max: { "whatsapp.lastInboundAt": ts, "whatsapp.optInAt": ts, "whatsapp.verifiedAt": ts },
};
/** The categories the mock knows, in its order: START's preference filter names each one. */
const CATEGORIES = ["jobs", "applications", "interviews", "offers", "profile_views", "marketing", "system", "placements", "commissions", "team"];
/** START adds WhatsApp channels only to an account with none on anywhere; one that chose some keeps its choice. */
const NO_WHATSAPP_CHANNEL = { $nor: CATEGORIES.map((c) => ({ [`categories.${c}.channels`]: "whatsapp" })) };
const idIn = (...users: { _id: string }[]) => ({ _id: { $in: users.map((u) => u._id) } });
/** The User query for a sender: the digit-tolerant phone pattern, or Meta's wa_id stored from an earlier send. */
const BY_NUMBER = { $or: [{ phone: expect.any(RegExp) }, { "whatsapp.waId": WA_ID }] };

beforeEach(() => {
  jest.clearAllMocks();
  getWhatsAppSettings.mockResolvedValue({ enabled: true, dailyCapPerUser: 3, automations: {} });
  codeOwner(null);
  logExists.mockResolvedValue(null);
});

describe("applyStatusEvent", () => {
  it("advances delivered only over sent/mock", async () => {
    await applyStatusEvent({ kind: "status", waMessageId: "wamid.A", status: "delivered", timestamp: ts, recipientWaId: "9715", conversationCategory: "utility" });
    expect(logUpdateOne).toHaveBeenCalledWith(
      { waMessageId: "wamid.A", status: { $in: ["mock", "sent"] } },
      { $set: { status: "delivered", statusAt: ts, conversationCategory: "utility" } },
    );
  });
  it("records the Meta error on failed", async () => {
    await applyStatusEvent({ kind: "status", waMessageId: "wamid.B", status: "failed", timestamp: ts, recipientWaId: "9715", errorCode: 131026, errorMessage: "Recipient not on WhatsApp" });
    expect(logUpdateOne.mock.calls[0][1]).toEqual({ $set: { status: "failed", statusAt: ts, errorCode: 131026, errorKind: "undeliverable", errorMessage: "Recipient not on WhatsApp" } });
  });
  it("ignores deleted", async () => {
    await applyStatusEvent({ kind: "status", waMessageId: "wamid.C", status: "deleted", timestamp: ts, recipientWaId: "9715" });
    expect(logUpdateOne).not.toHaveBeenCalled();
  });
  it("never moves a row backwards: read only replaces mock/sent/delivered, sent only replaces mock", async () => {
    await applyStatusEvent({ kind: "status", waMessageId: "wamid.R", status: "read", timestamp: ts, recipientWaId: "9715" });
    await applyStatusEvent({ kind: "status", waMessageId: "wamid.S", status: "sent", timestamp: ts, recipientWaId: "9715" });
    expect(logUpdateOne.mock.calls[0][0]).toEqual({ waMessageId: "wamid.R", status: { $in: ["mock", "sent", "delivered"] } });
    expect(logUpdateOne.mock.calls[1][0]).toEqual({ waMessageId: "wamid.S", status: { $in: ["mock"] } });
  });
});

describe("applyInboundMessage", () => {
  it("opens the service window for a known user, with $max so it can only grow", async () => {
    userFind.mockReturnValue(lean([USER]));
    await applyInboundMessage(text("hi there"));
    expect(userFind).toHaveBeenCalledWith(BY_NUMBER);
    expect(userUpdateMany).toHaveBeenCalledTimes(1);
    expect(userUpdateMany).toHaveBeenCalledWith(idIn(USER), WINDOW);
    // lastInboundAt must never be in a plain $set (a redelivered older message would shorten the window).
    expect(Object.keys(userUpdateMany.mock.calls[0][1].$set)).toEqual(["whatsapp.waId"]);
    expect(sendWhatsAppText).not.toHaveBeenCalled();
    expect(consentCreate).not.toHaveBeenCalled();
  });

  it("STOP opts the user out everywhere, opens the window, logs consent withdrawn and confirms", async () => {
    userFind.mockReturnValue(lean([USER]));
    await applyInboundMessage(text("STOP"));
    expect(userUpdateMany).toHaveBeenCalledTimes(1);
    expect(userUpdateMany).toHaveBeenCalledWith(idIn(USER), STOP_UPDATE);
    expect(Object.keys(userUpdateMany.mock.calls[0][1].$set)).not.toContain("whatsapp.lastInboundAt");
    expect(prefUpdateMany.mock.calls[0][0]).toEqual({ userId: { $in: [USER._id] } });
    const pull = prefUpdateMany.mock.calls[0][1].$pull as Record<string, string>;
    expect(pull["categories.applications.channels"]).toBe("whatsapp");
    expect(Object.keys(pull)).toHaveLength(10);
    expect(consentCreate).toHaveBeenCalledWith(expect.objectContaining({ userId: USER._id, consentType: "whatsapp_messaging", granted: false, source: "whatsapp_stop" }));
    expect(sendWhatsAppText).toHaveBeenCalledTimes(1);
    expect(sendWhatsAppText).toHaveBeenCalledWith(expect.objectContaining({ to: "+971501234567", source: "auto_reply", userId: USER._id }));
    expect(sendWhatsAppText.mock.calls[0][0].body).toMatch(/START/);
  });

  it("START with the account's code verifies it, re-enables the transactional categories, opens the window and logs consent granted", async () => {
    userFind.mockReturnValue(lean([{ ...USER, locale: "ar" }]));
    codeOwner({ ...USER, locale: "ar" });
    await applyInboundMessage(text("start k7p4qx"));
    expect(userFindOne).toHaveBeenCalledWith({ "whatsapp.startCode": { $eq: CODE, $type: "string" } });
    expect(userUpdateMany).toHaveBeenCalledTimes(1);
    expect(userUpdateMany).toHaveBeenCalledWith(idIn(USER), START_UPDATE);
    expect(Object.keys(userUpdateMany.mock.calls[0][1].$set)).not.toContain("whatsapp.lastInboundAt");
    expect(getOrCreatePreferences).toHaveBeenCalledWith(USER._id);
    expect(prefUpdateMany.mock.calls[0][0]).toEqual({ userId: { $in: [USER._id] }, ...NO_WHATSAPP_CHANNEL });
    const add = prefUpdateMany.mock.calls[0][1].$addToSet as Record<string, string>;
    expect(Object.keys(add).sort()).toEqual(["categories.applications.channels", "categories.commissions.channels", "categories.interviews.channels", "categories.offers.channels", "categories.placements.channels", "categories.system.channels"]);
    expect(consentCreate).toHaveBeenCalledWith(expect.objectContaining({ granted: true, source: "whatsapp_start" }));
    expect(sendWhatsAppText.mock.calls[0][0].body).toMatch(/[؀-ۿ]/);
  });

  describe("a number with no account", () => {
    it("a STOP is logged at info, with the keyword and nothing else", async () => {
      userFind.mockReturnValue(lean([]));
      await applyInboundMessage(text("STOP"));
      expect(userUpdateMany).not.toHaveBeenCalled();
      expect(prefUpdateMany).not.toHaveBeenCalled();
      expect(consentCreate).not.toHaveBeenCalled();
      expect(sendWhatsAppText).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledTimes(1);
      const [context, message] = (logger.info as jest.Mock).mock.calls[0];
      expect(context).toEqual({ keyword: "stop" });
      expect(message).toBe("[whatsapp] keyword from a number with no account");
      expect(logger.debug).not.toHaveBeenCalled();
    });

    it("a START is logged at info too", async () => {
      userFind.mockReturnValue(lean([]));
      await applyInboundMessage(text("start"));
      expect((logger.info as jest.Mock).mock.calls[0][0]).toEqual({ keyword: "start" });
    });

    it("an ordinary message is only logged at debug, as a bare message", async () => {
      userFind.mockReturnValue(lean([]));
      await applyInboundMessage(text("hello"));
      expect(userUpdateMany).not.toHaveBeenCalled();
      expect(logger.info).not.toHaveBeenCalled();
      expect(logger.debug).toHaveBeenCalledTimes(1);
      expect((logger.debug as jest.Mock).mock.calls[0]).toEqual(["[whatsapp] inbound message from a number with no account"]);
    });
  });

  it("an inbound message with no text (image, sticker) just opens the window", async () => {
    userFind.mockReturnValue(lean([USER]));
    await applyInboundMessage({ kind: "inbound_message", waMessageId: "wamid.IMG", fromWaId: WA_ID, timestamp: ts, type: "image" });
    expect(userUpdateMany).toHaveBeenCalledTimes(1);
    expect(userUpdateMany).toHaveBeenCalledWith(idIn(USER), WINDOW);
    expect(sendWhatsAppText).not.toHaveBeenCalled();
  });

  describe("which accounts a number reaches", () => {
    /** The pattern the handler put in the User query for this sender. */
    const patternFor = async (waId = WA_ID): Promise<RegExp> => {
      userFind.mockReturnValue(lean([USER]));
      await applyInboundMessage(text("hello", { fromWaId: waId }));
      return userFind.mock.calls[0][0].$or[0].phone as RegExp;
    };

    it("a START records the sender as the verified number in the form the send gate compares (+, digits), at the message time", async () => {
      const saudi = { ...USER, phone: "+966 50 123 4567" };
      userFind.mockReturnValue(lean([saudi]));
      codeOwner(saudi);
      await applyInboundMessage(text(START_CODE, { fromWaId: "966501234567" }));
      const $set = userUpdateMany.mock.calls[0][1].$set;
      expect($set["whatsapp.verifiedNumber"]).toBe("+966501234567");
      // The time only moves forward (F8).
      expect(userUpdateMany.mock.calls[0][1].$max["whatsapp.verifiedAt"]).toBe(ts);
    });

    it("a START from a wa_id libphonenumber cannot validate (Mexico's 521…) cannot verify the typed +52 number: the sender, kept as sent, is not the profile phone", async () => {
      const mexican = { ...USER, phone: "+52 55 1234 5678" };
      userFind.mockReturnValue(lean([mexican]));
      codeOwner(mexican);
      await applyInboundMessage(text(START_CODE, { fromWaId: "5215512345678" }));
      expect(JSON.stringify(userUpdateMany.mock.calls)).not.toContain("verifiedNumber");
      expect(liftSuppression).not.toHaveBeenCalled();
      expect(sendWhatsAppText.mock.calls[0][0].body).toMatch(/couldn't confirm this number/);
    });

    it("also matches Meta's wa_id stored from an earlier send, which can differ from the typed number (Mexico 521…)", async () => {
      userFind.mockReturnValue(lean([USER]));
      await applyInboundMessage(text("STOP", { fromWaId: "5215512345678" }));
      expect(userFind.mock.calls[0][0].$or[1]).toEqual({ "whatsapp.waId": "5215512345678" });
      expect(userUpdateMany).toHaveBeenCalledWith(idIn(USER), expect.objectContaining({ $set: expect.objectContaining({ "whatsapp.optOutAt": ts }) }));
    });

    it("numberMatchFilter is the query STOP uses, for reuse by the admin test send", () => {
      const filter = numberMatchFilter(WA_ID);
      expect(filter).toEqual(BY_NUMBER);
      expect(filter.$or[0].phone.test("+971 50 123 4567")).toBe(true);
    });

    it("reads only what it needs from the account: id, name for the consent row, locale for the reply, the phone and the verified number for the START rules, the two opt timestamps", async () => {
      userFind.mockReturnValue(lean([USER]));
      await applyInboundMessage(text("hello"));
      expect(userSelect).toHaveBeenCalledWith("_id name locale phone whatsapp.optInAt whatsapp.optOutAt whatsapp.verifiedNumber");
    });

    it("matches a stored number with spaces, dashes, brackets, a plus or a kept trunk zero", async () => {
      const re = await patternFor();
      for (const stored of [
        "+971501234567",
        "971501234567",
        "+971 50 123 4567",
        "+971-50-123-4567",
        "(+971) 50 123 4567",
        "  971 501 234 567  ",
        "+971.50.123.4567",
        // The trunk zero left in after the country code: valid for sending, common in stored data.
        "+9710501234567",
        "+971 0501234567",
        "+971 (0) 50 123 4567",
        "+971-050-123-4567",
      ]) {
        expect([stored, re.test(stored)]).toEqual([stored, true]);
      }
    });

    it("matches a Saudi number the same way, trunk zero included", async () => {
      const re = await patternFor("966501234567");
      for (const stored of ["+966 0501234567", "+966 50 123 4567", "966501234567", "+966 (0) 50 123 4567"]) {
        expect([stored, re.test(stored)]).toEqual([stored, true]);
      }
    });

    it("does not match a different number, a longer one, a shorter one, or a missing one", async () => {
      const re = await patternFor();
      for (const stored of [
        "+971 50 123 4568",
        "+1971501234567",
        "9715012345670",
        "+97150123456",
        "050 123 4567",
        "",
        "n/a",
        // Trunk-zero tolerance must not widen into other numbers.
        "+971 0 501234568",
        "+971 00501234567",
        "+972 0501234567",
        "+9710501234567 0",
      ]) {
        expect([stored, re.test(stored)]).toEqual([stored, false]);
      }
    });

    it("falls back to plain digits when the country code cannot be told", async () => {
      // 999 is not an assigned calling code, so libphonenumber cannot split the id.
      const re = await patternFor("9991234567");
      expect(re.test("+999 123 4567")).toBe(true);
      expect(re.test("9991234567")).toBe(true);
      expect(re.test("+999 123 4568")).toBe(false);
      expect(re.test("+9991234567 0")).toBe(false);
    });

    it("builds the pattern from digits only", async () => {
      const re = await patternFor();
      expect(re.source).toMatch(/^[\^\\D*0-9()?:$]+$/);
    });

    it("STOP reaches every account that shares the number, and confirms once", async () => {
      userFind.mockReturnValue(lean([USER_2, USER]));
      await applyInboundMessage(text("STOP"));
      expect(userUpdateMany).toHaveBeenCalledWith(idIn(USER, USER_2), STOP_UPDATE);
      expect(prefUpdateMany.mock.calls[0][0]).toEqual({ userId: { $in: [USER._id, USER_2._id] } });
      expect(consentCreate).toHaveBeenCalledTimes(2);
      expect(consentCreate).toHaveBeenCalledWith(expect.objectContaining({ userId: USER._id, userName: "Sara Ali", granted: false }));
      expect(consentCreate).toHaveBeenCalledWith(expect.objectContaining({ userId: USER_2._id, userName: "Sara Ali (second account)", granted: false }));
      // One message to the number, in the language of the first account by id, whatever order the database returned.
      expect(sendWhatsAppText).toHaveBeenCalledTimes(1);
      expect(sendWhatsAppText).toHaveBeenCalledWith(expect.objectContaining({ to: "+971501234567", userId: USER._id }));
      expect(sendWhatsAppText.mock.calls[0][0].body).toMatch(/You will no longer/);
    });

    it("a plain START resumes every account verified for the number that shares it", async () => {
      userFind.mockReturnValue(lean([{ ...USER, whatsapp: { ...VERIFIED, optOutAt: EARLIER } }, { ...USER_2, whatsapp: { ...VERIFIED, optOutAt: EARLIER } }]));
      await applyInboundMessage(text("START"));
      expect(userUpdateMany).toHaveBeenCalledTimes(1);
      expect(userUpdateMany).toHaveBeenCalledWith(idIn(USER, USER_2), START_UPDATE);
      expect(getOrCreatePreferences).toHaveBeenCalledTimes(2);
      expect(getOrCreatePreferences).toHaveBeenCalledWith(USER._id);
      expect(getOrCreatePreferences).toHaveBeenCalledWith(USER_2._id);
      expect(prefUpdateMany.mock.calls[0][0]).toEqual({ userId: { $in: [USER._id, USER_2._id] }, ...NO_WHATSAPP_CHANNEL });
      expect(consentCreate).toHaveBeenCalledTimes(2);
      expect(sendWhatsAppText).toHaveBeenCalledTimes(1);
    });

    it("an ordinary message opens the window on every account that shares the number", async () => {
      userFind.mockReturnValue(lean([USER, USER_2]));
      await applyInboundMessage(text("hello"));
      expect(userUpdateMany).toHaveBeenCalledTimes(1);
      expect(userUpdateMany).toHaveBeenCalledWith(idIn(USER, USER_2), WINDOW);
    });

    it("rejects a sender id that is not 6-15 digits, without querying, and logs a bare message", async () => {
      for (const bad of ["", "abc", "+971501234567", "971 501 234 567", "12345", "1234567890123456", "971{$ne:1}", ".*", "971501234567\n", "9715012345.7"]) {
        jest.clearAllMocks();
        await applyInboundMessage({ kind: "inbound_message", waMessageId: "wamid.BAD", fromWaId: bad, timestamp: ts, type: "text", text: "STOP" });
        expect(userFind).not.toHaveBeenCalled();
        expect(userUpdateMany).not.toHaveBeenCalled();
        expect(sendWhatsAppText).not.toHaveBeenCalled();
        expect((logger.warn as jest.Mock).mock.calls).toEqual([["[whatsapp] inbound message ignored: the sender id is not a phone number"]]);
      }
    });
  });

  describe("order guard: a stale keyword cannot undo a newer choice", () => {
    it("a redelivered older START after a newer STOP does not re-enable anything", async () => {
      userFind.mockReturnValue(lean([{ ...USER, whatsapp: { ...VERIFIED, optOutAt: LATER } }]));
      await applyInboundMessage(text("START", { timestamp: ts }));
      expect(getOrCreatePreferences).not.toHaveBeenCalled();
      expect(prefUpdateMany).not.toHaveBeenCalled();
      expect(consentCreate).not.toHaveBeenCalled();
      expect(sendWhatsAppText).not.toHaveBeenCalled();
      // The message still opened the window, and nothing was un-set.
      expect(userUpdateMany).toHaveBeenCalledTimes(1);
      expect(userUpdateMany).toHaveBeenCalledWith(idIn(USER), WINDOW);
      expect(JSON.stringify(userUpdateMany.mock.calls)).not.toContain("$unset");
      // Nor is the number verified: the stale START is not the account's latest word.
      expect(JSON.stringify(userUpdateMany.mock.calls)).not.toContain("verifiedNumber");
      expect(logger.debug).toHaveBeenCalledWith({ keyword: "start" }, expect.any(String));
    });

    it("a START newer than the STOP on record applies", async () => {
      userFind.mockReturnValue(lean([{ ...USER, whatsapp: { ...VERIFIED, optOutAt: EARLIER } }]));
      await applyInboundMessage(text("START"));
      expect(userUpdateMany).toHaveBeenCalledTimes(1);
      expect(userUpdateMany).toHaveBeenCalledWith(idIn(USER), START_UPDATE);
      expect(consentCreate).toHaveBeenCalledWith(expect.objectContaining({ granted: true }));
      expect(sendWhatsAppText).toHaveBeenCalledTimes(1);
    });

    it("a redelivered older STOP after a newer START does not opt anyone out", async () => {
      userFind.mockReturnValue(lean([{ ...USER, whatsapp: { optInAt: LATER } }]));
      await applyInboundMessage(text("STOP", { timestamp: ts }));
      expect(prefUpdateMany).not.toHaveBeenCalled();
      expect(consentCreate).not.toHaveBeenCalled();
      expect(sendWhatsAppText).not.toHaveBeenCalled();
      expect(userUpdateMany).toHaveBeenCalledTimes(1);
      expect(userUpdateMany).toHaveBeenCalledWith(idIn(USER), WINDOW);
      expect(JSON.stringify(userUpdateMany.mock.calls)).not.toContain("optOutAt");
    });

    it("a STOP after the user's opt-in applies", async () => {
      userFind.mockReturnValue(lean([{ ...USER, whatsapp: { optInAt: EARLIER } }]));
      await applyInboundMessage(text("STOP"));
      expect(userUpdateMany).toHaveBeenCalledWith(idIn(USER), STOP_UPDATE);
      expect(sendWhatsAppText).toHaveBeenCalledTimes(1);
    });

    it("within the same second STOP wins, whichever was processed first", async () => {
      // START processed after a STOP stamped the same second: ignored.
      userFind.mockReturnValue(lean([{ ...USER, whatsapp: { ...VERIFIED, optOutAt: ts } }]));
      await applyInboundMessage(text("START", { timestamp: ts }));
      expect(consentCreate).not.toHaveBeenCalled();
      expect(JSON.stringify(userUpdateMany.mock.calls)).not.toContain("$unset");
      // STOP processed after a START stamped the same second: applied.
      jest.clearAllMocks();
      userFind.mockReturnValue(lean([{ ...USER, whatsapp: { optInAt: ts } }]));
      await applyInboundMessage(text("STOP", { timestamp: ts }));
      expect(userUpdateMany).toHaveBeenCalledWith(idIn(USER), STOP_UPDATE);
      expect(consentCreate).toHaveBeenCalledWith(expect.objectContaining({ granted: false }));
    });

    it("only the accounts that qualify are changed, confirmed and logged", async () => {
      // USER has a newer STOP on record; USER_2 never opted out. Both were verified for the number before.
      userFind.mockReturnValue(lean([{ ...USER, whatsapp: { ...VERIFIED, optOutAt: LATER } }, { ...USER_2, whatsapp: VERIFIED }]));
      await applyInboundMessage(text("START", { timestamp: ts }));
      expect(userUpdateMany).toHaveBeenCalledTimes(2);
      expect(userUpdateMany).toHaveBeenNthCalledWith(1, idIn(USER_2), START_UPDATE);
      expect(userUpdateMany).toHaveBeenNthCalledWith(2, idIn(USER), WINDOW);
      expect(getOrCreatePreferences).toHaveBeenCalledTimes(1);
      expect(getOrCreatePreferences).toHaveBeenCalledWith(USER_2._id);
      expect(prefUpdateMany.mock.calls[0][0]).toEqual({ userId: { $in: [USER_2._id] }, ...NO_WHATSAPP_CHANNEL });
      expect(consentCreate).toHaveBeenCalledTimes(1);
      expect(consentCreate).toHaveBeenCalledWith(expect.objectContaining({ userId: USER_2._id }));
      expect(sendWhatsAppText).toHaveBeenCalledTimes(1);
      expect(sendWhatsAppText).toHaveBeenCalledWith(expect.objectContaining({ userId: USER_2._id }));
      expect(sendWhatsAppText.mock.calls[0][0].body).toMatch(/[؀-ۿ]/);
    });

    it("a STOP skipped by the guard is logged at info, not debug", async () => {
      userFind.mockReturnValue(lean([{ ...USER, whatsapp: { optInAt: LATER } }]));
      await applyInboundMessage(text("STOP", { timestamp: ts }));
      expect(logger.info).toHaveBeenCalledWith({ keyword: "stop" }, expect.any(String));
      expect(logger.debug).not.toHaveBeenCalled();
    });
  });

  it("Meta's \"Stop promotions\" quick-reply opts the account out like STOP", async () => {
    userFind.mockReturnValue(lean([USER]));
    await applyInboundMessage({ kind: "inbound_message", waMessageId: "wamid.Q", fromWaId: WA_ID, timestamp: ts, type: "button", text: "Stop promotions", payload: "Stop promotions" });
    expect(userUpdateMany).toHaveBeenCalledWith(idIn(USER), STOP_UPDATE);
    expect(consentCreate).toHaveBeenCalledWith(expect.objectContaining({ granted: false, source: "whatsapp_stop" }));
  });

  it("a failed \"Stop promotions\" reply is reported as a keyword failure", async () => {
    userFind.mockReturnValue(lean([USER]));
    userUpdateMany.mockRejectedValueOnce(new Error("write blocked"));
    const res = await processWebhookEvents([{ kind: "inbound_message", waMessageId: "wamid.Q", fromWaId: WA_ID, timestamp: ts, type: "button", text: "Stop promotions" }]);
    expect(res.keywordFailed).toBe(true);
  });

  describe("a repeated keyword is not re-confirmed", () => {
    it("a STOP from an account already opted out, with its channels already off, writes no consent row and sends nothing, but opens the window", async () => {
      // The $pull still runs (it is idempotent) and finds nothing left to remove.
      prefUpdateMany.mockResolvedValueOnce({ modifiedCount: 0 });
      userFind.mockReturnValue(lean([{ ...USER, whatsapp: { optOutAt: EARLIER } }]));
      await applyInboundMessage(text("STOP"));
      expect(userUpdateMany).toHaveBeenCalledTimes(1);
      expect(userUpdateMany).toHaveBeenCalledWith(idIn(USER), WINDOW);
      expect(prefUpdateMany).toHaveBeenCalledTimes(1);
      expect(consentCreate).not.toHaveBeenCalled();
      expect(sendWhatsAppText).not.toHaveBeenCalled();
    });

    it("a STOP that modified nothing (a concurrent duplicate got there first) writes no consent row and sends no confirmation", async () => {
      userUpdateMany.mockResolvedValueOnce({ modifiedCount: 0 });
      prefUpdateMany.mockResolvedValueOnce({ modifiedCount: 0 });
      userFind.mockReturnValue(lean([USER]));
      await applyInboundMessage(text("STOP"));
      expect(userUpdateMany).toHaveBeenCalledWith(idIn(USER), STOP_UPDATE);
      expect(consentCreate).not.toHaveBeenCalled();
      expect(sendWhatsAppText).not.toHaveBeenCalled();
    });

    it("only the accounts a STOP changed are logged; an account already out with nothing left to remove just gets the window", async () => {
      // First $pull: the account being opted out now. Second: the one already out, with its channels already off.
      prefUpdateMany.mockResolvedValueOnce({ modifiedCount: 1 }).mockResolvedValueOnce({ modifiedCount: 0 });
      userFind.mockReturnValue(lean([{ ...USER, whatsapp: { optOutAt: EARLIER } }, USER_2]));
      await applyInboundMessage(text("STOP"));
      expect(userUpdateMany).toHaveBeenNthCalledWith(1, idIn(USER_2), STOP_UPDATE);
      expect(userUpdateMany).toHaveBeenNthCalledWith(2, idIn(USER), WINDOW);
      expect(prefUpdateMany).toHaveBeenNthCalledWith(1, { userId: { $in: [USER_2._id] } }, expect.anything());
      expect(prefUpdateMany).toHaveBeenNthCalledWith(2, { userId: { $in: [USER._id] } }, expect.anything());
      expect(consentCreate).toHaveBeenCalledTimes(1);
      expect(consentCreate).toHaveBeenCalledWith(expect.objectContaining({ userId: USER_2._id, granted: false }));
      expect(sendWhatsAppText).toHaveBeenCalledTimes(1);
    });

    describe("a STOP that was only partly applied is completed when Meta redelivers it", () => {
      it("a $pull that fails once, then a redelivery, completes the pull, the consent row and the confirmation", async () => {
        // First delivery: the opt-out lands, then the preference $pull throws. The route answers 503.
        userFind.mockReturnValue(lean([USER]));
        prefUpdateMany.mockRejectedValueOnce(new Error("write blocked"));
        await expect(applyInboundMessage(text("STOP"))).rejects.toThrow("write blocked");
        expect(userUpdateMany).toHaveBeenCalledWith(idIn(USER), STOP_UPDATE);
        expect(consentCreate).not.toHaveBeenCalled();
        expect(sendWhatsAppText).not.toHaveBeenCalled();

        // Redelivery: the account now reads as out, but its WhatsApp channels are still on.
        userUpdateMany.mockClear();
        prefUpdateMany.mockClear();
        userFind.mockReturnValue(lean([{ ...USER, whatsapp: { optOutAt: ts } }]));
        await applyInboundMessage(text("STOP"));
        // No second opt-out write (it is already out); the window update is all the User gets.
        expect(userUpdateMany).toHaveBeenCalledTimes(1);
        expect(userUpdateMany).toHaveBeenCalledWith(idIn(USER), WINDOW);
        expect(prefUpdateMany).toHaveBeenCalledTimes(1);
        expect(prefUpdateMany.mock.calls[0][0]).toEqual({ userId: { $in: [USER._id] } });
        expect(Object.keys(prefUpdateMany.mock.calls[0][1].$pull as Record<string, string>)).toHaveLength(10);
        expect(consentCreate).toHaveBeenCalledTimes(1);
        expect(consentCreate).toHaveBeenCalledWith(expect.objectContaining({ userId: USER._id, granted: false, source: "whatsapp_stop" }));
        expect(sendWhatsAppText).toHaveBeenCalledTimes(1);
        expect(sendWhatsAppText.mock.calls[0][0].body).toMatch(/You will no longer/);
      });

      it("a STOP whose preference $pull throws reports keywordFailed, so the route answers 503", async () => {
        userFind.mockReturnValue(lean([USER]));
        prefUpdateMany.mockRejectedValueOnce(new Error("write blocked"));
        const res = await processWebhookEvents([{ kind: "inbound_message", waMessageId: "b", fromWaId: WA_ID, timestamp: ts, type: "text", text: "STOP" }]);
        expect(res.keywordFailed).toBe(true);
      });

      it("the redelivery leaves an account alone when a newer opt-in is on record (the order guard still applies to the $pull)", async () => {
        userFind.mockReturnValue(lean([{ ...USER, whatsapp: { optOutAt: EARLIER, optInAt: LATER } }]));
        await applyInboundMessage(text("STOP", { timestamp: ts }));
        expect(prefUpdateMany).not.toHaveBeenCalled();
        expect(consentCreate).not.toHaveBeenCalled();
        expect(sendWhatsAppText).not.toHaveBeenCalled();
      });
    });

    it("a START from an account already in, verified for this number, with its channels already on, writes no consent row and sends no confirmation", async () => {
      prefUpdateMany.mockResolvedValueOnce({ modifiedCount: 0 });
      userFind.mockReturnValue(lean([{ ...USER, whatsapp: { optInAt: EARLIER, verifiedNumber: SENDER } }]));
      await applyInboundMessage(text("START"));
      expect(consentCreate).not.toHaveBeenCalled();
      expect(sendWhatsAppText).not.toHaveBeenCalled();
    });

    it("a START that verifies an account already in (a toggle-era opt-in) is logged and confirmed, even with its channels already on", async () => {
      prefUpdateMany.mockResolvedValueOnce({ modifiedCount: 0 });
      userFind.mockReturnValue(lean([{ ...USER, whatsapp: { optInAt: EARLIER } }]));
      codeOwner({ ...USER, whatsapp: { optInAt: EARLIER } });
      await applyInboundMessage(text(START_CODE));
      expect(userUpdateMany).toHaveBeenCalledWith(idIn(USER), START_UPDATE);
      expect(consentCreate).toHaveBeenCalledWith(expect.objectContaining({ userId: USER._id, granted: true, source: "whatsapp_start" }));
      expect(sendWhatsAppText).toHaveBeenCalledTimes(1);
    });

    it("a START from a number other than the one verified before re-verifies to the sender", async () => {
      prefUpdateMany.mockResolvedValueOnce({ modifiedCount: 0 });
      userFind.mockReturnValue(lean([{ ...USER, whatsapp: { optInAt: EARLIER, verifiedNumber: "+971500000000" } }]));
      codeOwner({ ...USER, whatsapp: { optInAt: EARLIER, verifiedNumber: "+971500000000" } });
      await applyInboundMessage(text(START_CODE));
      expect(userUpdateMany.mock.calls[0][1].$set["whatsapp.verifiedNumber"]).toBe(SENDER);
      expect(consentCreate).toHaveBeenCalledTimes(1);
      expect(sendWhatsAppText).toHaveBeenCalledTimes(1);
    });

    it("a START that turns channels back on for an account already in is confirmed (the channels changed)", async () => {
      userFind.mockReturnValue(lean([{ ...USER, whatsapp: { ...VERIFIED, optInAt: EARLIER } }]));
      await applyInboundMessage(text("START"));
      expect(consentCreate).toHaveBeenCalledWith(expect.objectContaining({ granted: true }));
      expect(sendWhatsAppText).toHaveBeenCalledTimes(1);
    });

    it("a START that modified nothing (a concurrent duplicate got there first) is not confirmed", async () => {
      userUpdateMany.mockResolvedValueOnce({ modifiedCount: 0 });
      prefUpdateMany.mockResolvedValueOnce({ modifiedCount: 0 });
      userFind.mockReturnValue(lean([{ ...USER, whatsapp: { ...VERIFIED, optOutAt: EARLIER } }]));
      await applyInboundMessage(text("START"));
      expect(consentCreate).not.toHaveBeenCalled();
      expect(sendWhatsAppText).not.toHaveBeenCalled();
    });
  });

  describe("while WhatsApp is paused (master switch off)", () => {
    beforeEach(() => getWhatsAppSettings.mockResolvedValue({ enabled: false, dailyCapPerUser: 3, automations: {} }));

    it("START still opts the account in and logs consent, but sends no confirmation", async () => {
      userFind.mockReturnValue(lean([{ ...USER, whatsapp: { ...VERIFIED, optOutAt: EARLIER } }]));
      await applyInboundMessage(text("START"));
      expect(userUpdateMany).toHaveBeenCalledWith(idIn(USER), START_UPDATE);
      expect(prefUpdateMany).toHaveBeenCalled();
      expect(consentCreate).toHaveBeenCalledWith(expect.objectContaining({ granted: true, source: "whatsapp_start" }));
      expect(sendWhatsAppText).not.toHaveBeenCalled();
    });

    it("STOP is always confirmed", async () => {
      userFind.mockReturnValue(lean([USER]));
      await applyInboundMessage(text("STOP"));
      expect(userUpdateMany).toHaveBeenCalledWith(idIn(USER), STOP_UPDATE);
      expect(consentCreate).toHaveBeenCalledWith(expect.objectContaining({ granted: false }));
      expect(sendWhatsAppText).toHaveBeenCalledTimes(1);
    });
  });

  describe("read receipts", () => {
    const KEYS = ["WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_APP_SECRET", "WHATSAPP_WEBHOOK_VERIFY_TOKEN"] as const;
    const saved: Record<string, string | undefined> = {};
    beforeEach(() => {
      for (const k of KEYS) saved[k] = process.env[k];
    });
    afterEach(() => {
      for (const k of KEYS) {
        if (saved[k] === undefined) delete process.env[k];
        else process.env[k] = saved[k];
      }
    });
    const enable = () => {
      for (const k of KEYS) process.env[k] = "x";
    };
    const hello = { kind: "inbound_message", waMessageId: "wamid.READ", fromWaId: WA_ID, timestamp: ts, type: "text", text: "hello" } as const;

    it("marks the inbound message read when WhatsApp is live", async () => {
      enable();
      userFind.mockReturnValue(lean([USER]));
      await applyInboundMessage(hello);
      expect(markMessageRead).toHaveBeenCalledWith("wamid.READ");
    });

    it("skips the read receipt in mock mode", async () => {
      for (const k of KEYS) delete process.env[k];
      userFind.mockReturnValue(lean([USER]));
      await applyInboundMessage(hello);
      expect(markMessageRead).not.toHaveBeenCalled();
    });

    it("a failing read receipt never fails the webhook or skips the window update", async () => {
      enable();
      markMessageRead.mockRejectedValueOnce(new Error("graph down"));
      userFind.mockReturnValue(lean([USER]));
      await expect(applyInboundMessage(hello)).resolves.toBeUndefined();
      expect(userUpdateMany).toHaveBeenCalledWith(idIn(USER), WINDOW);
    });
  });
});

// STOP is also recorded against the number, so it outlives whichever account
// carries the number: re-ticking the channel on a profile cannot undo it.
// F2: START is how every account turns WhatsApp on, so it must not widen a choice the user already made: a seeker who
// ticked Interviews only would otherwise get WhatsApp on five more categories, system (broadcasts) included.
describe("START and the account's own WhatsApp categories", () => {
  /** Stored preferences by user id: category -> channels. */
  let stored: Record<string, Record<string, string[]>>;
  const has = (id: string, category: string) => (stored[id][category] ?? []).includes("whatsapp");
  beforeEach(() => {
    // Applies START's preference write to `stored` as MongoDB would: $in on userId, $nor of "this category lists
    // whatsapp", then $addToSet; modifiedCount counts the documents it changed.
    prefUpdateMany.mockImplementation(async (filter: { userId: { $in: string[] }; $nor?: Record<string, string>[] }, update: { $addToSet?: Record<string, string> }) => {
      let modifiedCount = 0;
      for (const id of filter.userId.$in) {
        const cats = stored[id];
        const excluded = (filter.$nor ?? []).some((cond) => Object.entries(cond).every(([path, v]) => (cats[path.split(".")[1]] ?? []).includes(v)));
        if (excluded) continue;
        let changed = false;
        for (const [path, v] of Object.entries(update.$addToSet ?? {})) {
          const c = path.split(".")[1];
          cats[c] = cats[c] ?? [];
          if (!cats[c].includes(v)) {
            cats[c].push(v);
            changed = true;
          }
        }
        if (changed) modifiedCount += 1;
      }
      return { modifiedCount };
    });
  });
  afterEach(() => prefUpdateMany.mockReset().mockResolvedValue({ modifiedCount: 1 }));

  it("an account with WhatsApp on in one category keeps exactly that choice; START verifies and grants consent only", async () => {
    stored = { [USER._id]: { interviews: ["in_app", "whatsapp"], system: ["in_app", "email"], applications: ["in_app"] } };
    userFind.mockReturnValue(lean([USER]));
    codeOwner(USER);
    await applyInboundMessage(text(START_CODE));
    expect(userUpdateMany).toHaveBeenCalledWith(idIn(USER), START_UPDATE);
    expect(stored[USER._id]).toEqual({ interviews: ["in_app", "whatsapp"], system: ["in_app", "email"], applications: ["in_app"] });
    expect(has(USER._id, "system")).toBe(false);
    // Newly verified: the consent and the confirmation still follow.
    expect(consentCreate).toHaveBeenCalledWith(expect.objectContaining({ userId: USER._id, granted: true, source: "whatsapp_start" }));
    expect(sendWhatsAppText).toHaveBeenCalledTimes(1);
  });

  it("an account with no WhatsApp channel on at all gets it on the transactional categories, as before", async () => {
    stored = { [USER._id]: { interviews: ["in_app", "email"], marketing: ["email"] } };
    userFind.mockReturnValue(lean([USER]));
    codeOwner(USER);
    await applyInboundMessage(text(START_CODE));
    for (const c of ["applications", "interviews", "offers", "placements", "commissions", "system"]) expect(has(USER._id, c)).toBe(true);
    expect(has(USER._id, "marketing")).toBe(false);
    expect(consentCreate).toHaveBeenCalledTimes(1);
    expect(sendWhatsAppText).toHaveBeenCalledTimes(1);
  });

  it("decides per account: on a shared number, a plain START resumes both verified accounts; one keeps its choice while the other gets the channels", async () => {
    stored = {
      [USER._id]: { interviews: ["in_app", "whatsapp"] },
      [USER_2._id]: { interviews: ["in_app", "email"] },
    };
    // Both were verified for the number before; USER_2 has since sent STOP.
    userFind.mockReturnValue(lean([{ ...USER, whatsapp: { ...VERIFIED, optInAt: EARLIER } }, { ...USER_2, whatsapp: { ...VERIFIED, optOutAt: EARLIER } }]));
    await applyInboundMessage(text("START"));
    // Both are resumed by the one START.
    expect(userUpdateMany).toHaveBeenCalledWith(idIn(USER, USER_2), START_UPDATE);
    expect(stored[USER._id]).toEqual({ interviews: ["in_app", "whatsapp"] });
    for (const c of ["applications", "interviews", "offers", "placements", "commissions", "system"]) expect(has(USER_2._id, c)).toBe(true);
    expect(consentCreate).toHaveBeenCalledTimes(2);
    expect(sendWhatsAppText).toHaveBeenCalledTimes(1);
  });

  it("a redelivered START for an account already verified, whose channels it chose itself, changes nothing and is not confirmed again", async () => {
    stored = { [USER._id]: { interviews: ["in_app", "whatsapp"] } };
    userUpdateMany.mockResolvedValueOnce({ modifiedCount: 0 });
    userFind.mockReturnValue(lean([{ ...USER, whatsapp: { optInAt: ts, verifiedNumber: SENDER } }]));
    await applyInboundMessage(text("START"));
    expect(stored[USER._id]).toEqual({ interviews: ["in_app", "whatsapp"] });
    expect(consentCreate).not.toHaveBeenCalled();
    expect(sendWhatsAppText).not.toHaveBeenCalled();
  });
});

// F8: Meta can redeliver an older START after a newer one. A plain $set moved the opt-in back, which let a STOP
// that falls between the two apply.
describe("START times only move forward", () => {
  it("writes optInAt and verifiedAt with $max, never $set; the verified number itself is a $set", async () => {
    userFind.mockReturnValue(lean([USER]));
    codeOwner(USER);
    await applyInboundMessage(text(START_CODE));
    const update = userUpdateMany.mock.calls[0][1] as { $set: Record<string, unknown>; $max: Record<string, unknown> };
    expect(update.$max).toEqual(expect.objectContaining({ "whatsapp.optInAt": ts, "whatsapp.verifiedAt": ts }));
    expect(update.$set).not.toHaveProperty(["whatsapp.optInAt"]);
    expect(update.$set).not.toHaveProperty(["whatsapp.verifiedAt"]);
    expect(update.$set["whatsapp.verifiedNumber"]).toBe(SENDER);
  });
});

// F5: START is now the way every user turns WhatsApp on, so the reply must read right for a first START too.
describe("the START confirmation", () => {
  it.each([
    ["en", "You'll now get MPLOYEDIN updates on WhatsApp. Reply STOP at any time to turn them off."],
    ["ar", "ستصلك الآن تحديثات MPLOYEDIN على واتساب. أرسل STOP في أي وقت لإيقافها."],
  ])("reads correctly for a first START and for a resume (%s)", async (locale, body) => {
    userFind.mockReturnValue(lean([{ ...USER, locale }]));
    codeOwner({ ...USER, locale });
    await applyInboundMessage(text(START_CODE));
    expect(sendWhatsAppText).toHaveBeenCalledWith(expect.objectContaining({ body }));
    expect(sendWhatsAppText.mock.calls[0][0].body).not.toMatch(/again|مجدداً/);
  });
});

describe("the number-level suppression list", () => {
  it("a STOP adds the sender's number, at the message time", async () => {
    userFind.mockReturnValue(lean([USER]));
    await applyInboundMessage(text("STOP"));
    expect(suppressNumber).toHaveBeenCalledTimes(1);
    expect(suppressNumber).toHaveBeenCalledWith("+971501234567", ts, "stop_keyword");
  });

  it("a STOP from a number with no account still adds it", async () => {
    userFind.mockReturnValue(lean([]));
    await applyInboundMessage(text("STOP"));
    expect(suppressNumber).toHaveBeenCalledWith("+971501234567", ts, "stop_keyword");
  });

  it("a repeated STOP that changes no account still adds it (a STOP recorded before the list existed)", async () => {
    userFind.mockReturnValue(lean([{ ...USER, whatsapp: { optOutAt: EARLIER } }]));
    prefUpdateMany.mockResolvedValueOnce({ modifiedCount: 0 });
    await applyInboundMessage(text("STOP"));
    expect(suppressNumber).toHaveBeenCalledWith("+971501234567", ts, "stop_keyword");
    expect(sendWhatsAppText).not.toHaveBeenCalled();
  });

  it("a START from the number lifts it, at the message time", async () => {
    userFind.mockReturnValue(lean([{ ...USER, whatsapp: { ...VERIFIED, optOutAt: EARLIER } }]));
    await applyInboundMessage(text("START"));
    expect(liftSuppression).toHaveBeenCalledWith("+971501234567", ts);
    expect(suppressNumber).not.toHaveBeenCalled();
  });

  it("an ordinary message leaves the list alone", async () => {
    userFind.mockReturnValue(lean([USER]));
    await applyInboundMessage(text("hello"));
    expect(suppressNumber).not.toHaveBeenCalled();
    expect(liftSuppression).not.toHaveBeenCalled();
  });

  it("the STOP confirmation, sent to the number just suppressed, bypasses the list, and only after the entry is written", async () => {
    userFind.mockReturnValue(lean([USER]));
    await applyInboundMessage(text("STOP"));
    expect(sendWhatsAppText).toHaveBeenCalledWith(expect.objectContaining({ bypassSuppression: true }));
    expect(suppressNumber.mock.invocationCallOrder[0]).toBeLessThan(sendWhatsAppText.mock.invocationCallOrder[0]);
  });

  it("the START confirmation bypasses the list too", async () => {
    userFind.mockReturnValue(lean([{ ...USER, whatsapp: { ...VERIFIED, optOutAt: EARLIER } }]));
    await applyInboundMessage(text("START"));
    expect(sendWhatsAppText).toHaveBeenCalledWith(expect.objectContaining({ bypassSuppression: true }));
  });

  it("a STOP whose list write fails reports keywordFailed, so Meta redelivers it", async () => {
    userFind.mockReturnValue(lean([USER]));
    suppressNumber.mockRejectedValueOnce(new Error("db down"));
    const res = await processWebhookEvents([text("STOP")]);
    expect(res.keywordFailed).toBe(true);
  });
});

// K3 (owner decision 2026-10-03): one START used to verify every account whose profile carried the sender's number,
// so typing a member's number into your own profile got you switched on by their START. The settings page's button now
// types `START <code>`: only the account holding that code is verified, and only from the phone on its profile.
describe("the personal START code", () => {
  const GUIDANCE_EN = "We couldn't confirm this number. Use the WhatsApp button on your MPLOYEDIN settings page, from the phone saved on your profile.";
  const GUIDANCE_AR = "تعذّر تأكيد هذا الرقم. استخدم زر واتساب في صفحة الإعدادات على MPLOYEDIN، من الهاتف المحفوظ في ملفك الشخصي.";
  const guidanceSent = () => sendWhatsAppText.mock.calls.filter(([input]) => input.notificationType === "start_guidance");

  it("START <code> from the profile phone verifies only that account: a second account on the same number is not verified", async () => {
    userFind.mockReturnValue(lean([USER, USER_2]));
    codeOwner(USER);
    await applyInboundMessage(text(START_CODE));
    expect(userUpdateMany).toHaveBeenCalledTimes(2);
    expect(userUpdateMany).toHaveBeenNthCalledWith(1, idIn(USER), START_UPDATE);
    // The other account gets only the service window every inbound message opens.
    expect(userUpdateMany).toHaveBeenNthCalledWith(2, idIn(USER_2), WINDOW);
    expect(getOrCreatePreferences).toHaveBeenCalledTimes(1);
    expect(getOrCreatePreferences).toHaveBeenCalledWith(USER._id);
    expect(prefUpdateMany.mock.calls[0][0]).toEqual({ userId: { $in: [USER._id] }, ...NO_WHATSAPP_CHANNEL });
    expect(consentCreate).toHaveBeenCalledTimes(1);
    expect(consentCreate).toHaveBeenCalledWith(expect.objectContaining({ userId: USER._id, granted: true, source: "whatsapp_start" }));
    expect(liftSuppression).toHaveBeenCalledWith(SENDER, ts);
    expect(sendWhatsAppText).toHaveBeenCalledTimes(1);
    expect(sendWhatsAppText).toHaveBeenCalledWith(expect.objectContaining({ userId: USER._id, body: "You'll now get MPLOYEDIN updates on WhatsApp. Reply STOP at any time to turn them off." }));
  });

  it("finds the account by its code and reads only what the START needs; the phone decides, not the number lookup", async () => {
    userFind.mockReturnValue(lean([]));
    codeOwner(USER);
    await applyInboundMessage(text(START_CODE));
    expect(userFindOne).toHaveBeenCalledWith({ "whatsapp.startCode": { $eq: CODE, $type: "string" } });
    expect(codeSelect).toHaveBeenCalledWith("_id name locale phone whatsapp.optInAt whatsapp.optOutAt whatsapp.verifiedNumber");
    expect(userUpdateMany).toHaveBeenCalledWith(idIn(USER), START_UPDATE);
  });

  it("accepts lowercase and extra spaces", async () => {
    userFind.mockReturnValue(lean([USER]));
    codeOwner(USER);
    await applyInboundMessage(text("  start   k7p4qx  "));
    expect(userFindOne).toHaveBeenCalledWith({ "whatsapp.startCode": { $eq: CODE, $type: "string" } });
    expect(userUpdateMany).toHaveBeenCalledWith(idIn(USER), START_UPDATE);
  });

  it("START <code> from a phone other than the one on the code's account verifies nothing, keeps the number's STOP, and sends the guidance", async () => {
    // The code is real, but its account's profile carries another number.
    codeOwner({ ...USER, phone: "+971 50 765 4321" });
    userFind.mockReturnValue(lean([USER_2]));
    await applyInboundMessage(text(START_CODE));
    expect(JSON.stringify(userUpdateMany.mock.calls)).not.toContain("verifiedNumber");
    expect(userUpdateMany).toHaveBeenCalledTimes(1);
    expect(userUpdateMany).toHaveBeenCalledWith(idIn(USER_2), WINDOW);
    expect(getOrCreatePreferences).not.toHaveBeenCalled();
    expect(prefUpdateMany).not.toHaveBeenCalled();
    expect(consentCreate).not.toHaveBeenCalled();
    expect(liftSuppression).not.toHaveBeenCalled();
    expect(sendWhatsAppText).toHaveBeenCalledTimes(1);
    // In the language of the first account on the number (USER_2 reads Arabic).
    expect(sendWhatsAppText).toHaveBeenCalledWith({ to: SENDER, body: GUIDANCE_AR, userId: USER_2._id, source: "auto_reply", category: "system", notificationType: "start_guidance", bypassSuppression: true });
  });

  it("an unknown code does the same", async () => {
    codeOwner(null);
    userFind.mockReturnValue(lean([]));
    await applyInboundMessage(text(START_CODE));
    expect(userUpdateMany).not.toHaveBeenCalled();
    expect(consentCreate).not.toHaveBeenCalled();
    expect(liftSuppression).not.toHaveBeenCalled();
    // No account on the number: English, and no account on the log row.
    expect(sendWhatsAppText).toHaveBeenCalledTimes(1);
    expect(sendWhatsAppText).toHaveBeenCalledWith({ to: SENDER, body: GUIDANCE_EN, source: "auto_reply", category: "system", notificationType: "start_guidance", bypassSuppression: true });
  });

  it("logs an unmatched START at info, with neither the number nor the code", async () => {
    codeOwner(null);
    userFind.mockReturnValue(lean([USER]));
    await applyInboundMessage(text(START_CODE));
    expect(logger.info).toHaveBeenCalledWith({ keyword: "start" }, expect.stringContaining("START"));
    const logged = JSON.stringify([(logger.info as jest.Mock).mock.calls, (logger.debug as jest.Mock).mock.calls, (logger.warn as jest.Mock).mock.calls]);
    expect(logged).not.toContain(CODE);
    expect(logged).not.toContain("971501234567");
  });

  it("a plain START resumes an already-verified, stopped account and verifies no new one", async () => {
    // USER: verified by an earlier START, then STOP. USER_2: the same number typed in, never verified.
    userFind.mockReturnValue(lean([{ ...USER, whatsapp: { ...VERIFIED, optOutAt: EARLIER } }, USER_2]));
    await applyInboundMessage(text("START"));
    expect(userFindOne).not.toHaveBeenCalled();
    expect(userUpdateMany).toHaveBeenCalledTimes(2);
    expect(userUpdateMany).toHaveBeenNthCalledWith(1, idIn(USER), START_UPDATE);
    expect(userUpdateMany).toHaveBeenNthCalledWith(2, idIn(USER_2), WINDOW);
    expect(consentCreate).toHaveBeenCalledTimes(1);
    expect(consentCreate).toHaveBeenCalledWith(expect.objectContaining({ userId: USER._id, granted: true }));
    expect(liftSuppression).toHaveBeenCalledWith(SENDER, ts);
    expect(sendWhatsAppText).toHaveBeenCalledTimes(1);
    expect(guidanceSent()).toHaveLength(0);
  });

  it("a plain START counts no verification for another number, nor one the profile phone no longer matches", async () => {
    userFind.mockReturnValue(lean([
      { ...USER, whatsapp: { verifiedNumber: "+971500000000", optOutAt: EARLIER } },
      { ...USER_2, phone: "+971 50 765 4321", whatsapp: { ...VERIFIED, optOutAt: EARLIER } },
    ]));
    await applyInboundMessage(text("START"));
    expect(JSON.stringify(userUpdateMany.mock.calls)).not.toContain("verifiedNumber");
    expect(JSON.stringify(userUpdateMany.mock.calls)).not.toContain("$unset");
    expect(guidanceSent()).toHaveLength(1);
  });

  it("a plain START with no verified account verifies nobody, still lifts the number's STOP, and sends the guidance", async () => {
    userFind.mockReturnValue(lean([{ ...USER, whatsapp: { optInAt: EARLIER } }]));
    await applyInboundMessage(text("START"));
    expect(JSON.stringify(userUpdateMany.mock.calls)).not.toContain("verifiedNumber");
    expect(userUpdateMany).toHaveBeenCalledTimes(1);
    expect(userUpdateMany).toHaveBeenCalledWith(idIn(USER), WINDOW);
    expect(consentCreate).not.toHaveBeenCalled();
    expect(liftSuppression).toHaveBeenCalledWith(SENDER, ts);
    expect(sendWhatsAppText).toHaveBeenCalledTimes(1);
    expect(sendWhatsAppText).toHaveBeenCalledWith(expect.objectContaining({ body: GUIDANCE_EN, userId: USER._id, notificationType: "start_guidance", bypassSuppression: true }));
  });

  it("a plain START from an account already verified and in sends nothing: its number is confirmed, so no guidance", async () => {
    prefUpdateMany.mockResolvedValueOnce({ modifiedCount: 0 });
    userFind.mockReturnValue(lean([{ ...USER, whatsapp: { ...VERIFIED, optInAt: EARLIER } }]));
    await applyInboundMessage(text("START"));
    expect(sendWhatsAppText).not.toHaveBeenCalled();
  });

  it("the order guard still holds for the code's account: a START older than its STOP verifies nothing and gets no reply", async () => {
    userFind.mockReturnValue(lean([{ ...USER, whatsapp: { optOutAt: LATER } }]));
    codeOwner({ ...USER, whatsapp: { optOutAt: LATER } });
    await applyInboundMessage(text(START_CODE));
    expect(JSON.stringify(userUpdateMany.mock.calls)).not.toContain("verifiedNumber");
    expect(consentCreate).not.toHaveBeenCalled();
    expect(sendWhatsAppText).not.toHaveBeenCalled();
  });

  describe("redelivery", () => {
    it("a redelivered START <code> writes no second consent row and sends no second reply", async () => {
      // As stored after the first delivery: verified, opted in at the message time, channels on.
      const stored = { ...USER, whatsapp: { ...VERIFIED, optInAt: ts } };
      userFind.mockReturnValue(lean([stored]));
      codeOwner(stored);
      userUpdateMany.mockResolvedValueOnce({ modifiedCount: 0 });
      prefUpdateMany.mockResolvedValueOnce({ modifiedCount: 0 });
      await applyInboundMessage(text(START_CODE));
      expect(consentCreate).not.toHaveBeenCalled();
      expect(sendWhatsAppText).not.toHaveBeenCalled();
    });

    it("an unmatched START gets the guidance once: a redelivery finds the reply already sent for this message", async () => {
      codeOwner(null);
      userFind.mockReturnValue(lean([USER]));
      await applyInboundMessage(text(START_CODE));
      expect(guidanceSent()).toHaveLength(1);
      // A guidance reply logged to this number at or after this message's time answered it.
      expect(logExists).toHaveBeenCalledWith({ to: SENDER, source: "auto_reply", notificationType: "start_guidance", sentAt: { $gte: ts } });
      sendWhatsAppText.mockClear();
      logExists.mockResolvedValueOnce({ _id: "log1" });
      await applyInboundMessage(text(START_CODE));
      expect(sendWhatsAppText).not.toHaveBeenCalled();
    });
  });

  describe("while WhatsApp is paused (A4)", () => {
    beforeEach(() => getWhatsAppSettings.mockResolvedValue({ enabled: false, dailyCapPerUser: 3, automations: {} }));

    it("START <code> still verifies the account and records the consent, with no reply", async () => {
      userFind.mockReturnValue(lean([USER]));
      codeOwner(USER);
      await applyInboundMessage(text(START_CODE));
      expect(userUpdateMany).toHaveBeenCalledWith(idIn(USER), START_UPDATE);
      expect(consentCreate).toHaveBeenCalledWith(expect.objectContaining({ granted: true, source: "whatsapp_start" }));
      expect(sendWhatsAppText).not.toHaveBeenCalled();
    });

    it("an unmatched START gets no guidance either", async () => {
      codeOwner(null);
      userFind.mockReturnValue(lean([USER]));
      await applyInboundMessage(text(START_CODE));
      await applyInboundMessage(text("START"));
      expect(sendWhatsAppText).not.toHaveBeenCalled();
    });
  });

  it("a START <code> whose code lookup fails reports keywordFailed, so the route answers 503 and Meta redelivers", async () => {
    userFind.mockReturnValue(lean([USER]));
    userFindOne.mockImplementationOnce(() => {
      throw new Error("server selection timed out");
    });
    const res = await processWebhookEvents([text(START_CODE)]);
    expect(res.keywordFailed).toBe(true);
    expect(sendWhatsAppText).not.toHaveBeenCalled();
  });

  it("a guidance reply whose redelivery check fails reports keywordFailed too, and sends nothing", async () => {
    userFind.mockReturnValue(lean([USER]));
    logExists.mockRejectedValueOnce(new Error("db down"));
    const res = await processWebhookEvents([text(START_CODE)]);
    expect(res.keywordFailed).toBe(true);
    expect(sendWhatsAppText).not.toHaveBeenCalled();
  });
});

describe("processWebhookEvents", () => {
  it("counts by kind and survives a failing event", async () => {
    logUpdateOne.mockRejectedValueOnce(new Error("db down"));
    userFind.mockReturnValue(lean([]));
    const res = await processWebhookEvents([
      { kind: "status", waMessageId: "a", status: "read", timestamp: ts, recipientWaId: "1" },
      { kind: "inbound_message", waMessageId: "b", fromWaId: "100000000", timestamp: ts, type: "text" },
      { kind: "template_status_update", metaId: "1", name: "t", language: "en", event: "APPROVED" },
    ]);
    expect(res).toEqual({ statuses: 1, inbound: 1, templates: 1, keywordFailed: false });
  });

  describe("a failed STOP/START is reported so the route can ask Meta to redeliver", () => {
    it("a STOP whose opt-out write throws reports keywordFailed", async () => {
      userFind.mockReturnValue(lean([USER]));
      userUpdateMany.mockRejectedValueOnce(new Error("write blocked"));
      const res = await processWebhookEvents([{ kind: "inbound_message", waMessageId: "b", fromWaId: WA_ID, timestamp: ts, type: "text", text: "STOP" }]);
      expect(res.keywordFailed).toBe(true);
    });

    it("a START whose account lookup throws reports keywordFailed", async () => {
      userFind.mockImplementationOnce(() => {
        throw new Error("server selection timed out");
      });
      const res = await processWebhookEvents([{ kind: "inbound_message", waMessageId: "b", fromWaId: WA_ID, timestamp: ts, type: "text", text: "start" }]);
      expect(res.keywordFailed).toBe(true);
    });

    it("a failing status event or ordinary message is not a keyword failure", async () => {
      logUpdateOne.mockRejectedValueOnce(new Error("db down"));
      userFind.mockReturnValue(lean([USER]));
      userUpdateMany.mockRejectedValueOnce(new Error("db down"));
      const res = await processWebhookEvents([
        { kind: "status", waMessageId: "a", status: "read", timestamp: ts, recipientWaId: "1" },
        { kind: "inbound_message", waMessageId: "b", fromWaId: WA_ID, timestamp: ts, type: "text", text: "hello" },
      ]);
      expect(res.keywordFailed).toBe(false);
      expect(logger.error).toHaveBeenCalledTimes(2);
    });
  });

  it("keeps processing the events after a failing one", async () => {
    logUpdateOne.mockRejectedValueOnce(new Error("db down"));
    userFind.mockReturnValue(lean([USER]));
    await processWebhookEvents([
      { kind: "status", waMessageId: "a", status: "read", timestamp: ts, recipientWaId: "1" },
      { kind: "inbound_message", waMessageId: "b", fromWaId: WA_ID, timestamp: ts, type: "text", text: "hi" },
    ]);
    expect(userUpdateMany).toHaveBeenCalledTimes(1);
  });

  it("applies template status events to the template mirror", async () => {
    const ev = { kind: "template_status_update", metaId: "9", name: "otp", language: "en", event: "REJECTED", reason: "INVALID_FORMAT" } as const;
    const res = await processWebhookEvents([ev]);
    expect(res).toEqual({ statuses: 0, inbound: 0, templates: 1, keywordFailed: false });
    expect(templateUpdateOne).toHaveBeenCalledWith({ name: "otp", language: "en" }, { $set: expect.objectContaining({ status: "REJECTED", rejectedReason: "INVALID_FORMAT" }) });
  });

  it("a failing template update does not stop the events after it", async () => {
    templateUpdateOne.mockRejectedValueOnce(new Error("db down"));
    userFind.mockReturnValue(lean([USER]));
    await processWebhookEvents([
      { kind: "template_status_update", metaId: "9", name: "otp", language: "en", event: "APPROVED" },
      { kind: "inbound_message", waMessageId: "b", fromWaId: WA_ID, timestamp: ts, type: "text", text: "hi" },
    ]);
    expect(logger.error).toHaveBeenCalledWith(expect.objectContaining({ kind: "template_status_update" }), expect.any(String));
    expect(userUpdateMany).toHaveBeenCalledTimes(1);
  });
});

describe("applyTemplateStatusUpdate", () => {
  const ev = (event: string, reason?: string) =>
    ({ kind: "template_status_update", metaId: "1", name: "t", language: "ar", event, ...(reason === undefined ? {} : { reason }) }) as const;

  it("mirrors the new status and reason", async () => {
    await applyTemplateStatusUpdate(ev("REJECTED", "INVALID_FORMAT"));
    expect(templateUpdateOne).toHaveBeenCalledWith({ name: "t", language: "ar" }, { $set: expect.objectContaining({ status: "REJECTED", rejectedReason: "INVALID_FORMAT" }) });
  });

  it("matches the row by name and language only, and never creates one", async () => {
    await applyTemplateStatusUpdate(ev("PAUSED"));
    expect(templateUpdateOne.mock.calls[0][0]).toEqual({ name: "t", language: "ar" });
    expect(templateUpdateOne.mock.calls[0]).toHaveLength(2);
  });

  it("stamps lastSyncedAt", async () => {
    await applyTemplateStatusUpdate(ev("PAUSED"));
    expect(templateUpdateOne.mock.calls[0][1].$set.lastSyncedAt).toBeInstanceOf(Date);
  });

  it("maps REINSTATED back to APPROVED and upper-cases the rest", async () => {
    await applyTemplateStatusUpdate(ev("reinstated"));
    await applyTemplateStatusUpdate(ev("in_appeal"));
    expect(templateUpdateOne.mock.calls[0][1].$set.status).toBe("APPROVED");
    expect(templateUpdateOne.mock.calls[1][1].$set.status).toBe("IN_APPEAL");
  });

  it("treats Meta's reason NONE as no reason, and clears an old rejection reason once the template is approved", async () => {
    await applyTemplateStatusUpdate(ev("APPROVED", "NONE"));
    await applyTemplateStatusUpdate(ev("REINSTATED"));
    for (const call of templateUpdateOne.mock.calls) {
      expect(call[1].$set).not.toHaveProperty("rejectedReason");
      expect(call[1].$unset).toEqual({ rejectedReason: "" });
    }
  });

  it("ignores an event with no status rather than blanking the mirrored one", async () => {
    await applyTemplateStatusUpdate(ev(""));
    await applyTemplateStatusUpdate(ev("  "));
    expect(templateUpdateOne).not.toHaveBeenCalled();
  });

  it("leaves the reason alone for a status change that carries none and is not an approval", async () => {
    await applyTemplateStatusUpdate(ev("PAUSED", "NONE"));
    expect(templateUpdateOne.mock.calls[0][1]).toEqual({ $set: { status: "PAUSED", lastSyncedAt: expect.any(Date) } });
  });
});
