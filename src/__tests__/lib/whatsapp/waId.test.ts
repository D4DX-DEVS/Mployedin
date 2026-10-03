/**
 * @jest-environment node
 */
export {};

const updateOne = jest.fn();
/** What `User.findOneAndUpdate(...).select(...).lean()` resolves to: the account before the reset, or null when the filter missed. */
let before: unknown = null;
const findOneAndUpdate = jest.fn((..._a: unknown[]) => ({ select: () => ({ lean: async () => before }) }));
/** The phone stored on the account when the helper reads it (undefined: no phone; null account: no such user). */
let stored: { phone?: string } | null = { phone: "+971501234567" };
const findById = jest.fn((..._a: unknown[]) => ({ select: () => ({ lean: async () => stored }) }));
jest.mock("@/models/User", () => ({
  __esModule: true,
  default: {
    updateOne: (...a: unknown[]) => updateOne(...a),
    findOneAndUpdate: (...a: unknown[]) => findOneAndUpdate(...a),
    findById: (...a: unknown[]) => findById(...a),
  },
}));
const prefUpdateOne = jest.fn();
jest.mock("@/models/NotificationPreference", () => ({
  __esModule: true,
  default: { updateOne: (...a: unknown[]) => prefUpdateOne(...a) },
  CATEGORY_KEYS: ["jobs", "applications", "interviews", "offers", "profile_views", "marketing", "system", "placements", "commissions", "team"],
}));
const consentCreate = jest.fn();
jest.mock("@/models/ConsentLog", () => ({ __esModule: true, default: { create: (...a: unknown[]) => consentCreate(...a) } }));
jest.mock("@/lib/logger", () => ({ __esModule: true, default: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() } }));

import logger from "@/lib/logger";
import { forgetWaIdOnPhoneChange, rememberWaId } from "@/lib/communications/whatsapp/waId";

beforeEach(() => {
  jest.clearAllMocks();
  before = null;
  stored = { phone: "+971501234567" };
  // Drop any queued once-values a test left unconsumed, keeping the default answers.
  findOneAndUpdate.mockReset().mockImplementation((..._a: unknown[]) => ({ select: () => ({ lean: async () => before }) }));
  findById.mockReset().mockImplementation((..._a: unknown[]) => ({ select: () => ({ lean: async () => stored }) }));
  updateOne.mockResolvedValue({ modifiedCount: 1 });
  prefUpdateOne.mockResolvedValue({ modifiedCount: 0 });
  consentCreate.mockResolvedValue({});
});

describe("rememberWaId", () => {
  it("stores the wa_id Meta returned, only when it differs from the stored one", async () => {
    await rememberWaId("u1", "5215512345678");
    expect(updateOne).toHaveBeenCalledWith({ _id: "u1", "whatsapp.waId": { $ne: "5215512345678" } }, { $set: { "whatsapp.waId": "5215512345678" } });
  });

  it("does nothing when the send returned no wa_id", async () => {
    await rememberWaId("u1", undefined);
    expect(updateOne).not.toHaveBeenCalled();
  });

  it("never fails the send, and the log line carries no number", async () => {
    updateOne.mockRejectedValue(new Error("write blocked"));
    await expect(rememberWaId("u1", "971501234567")).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalledTimes(1);
    expect(JSON.stringify((logger.warn as jest.Mock).mock.calls[0])).not.toContain("971501234567");
  });
});

// WhatsApp consent belongs to a number. A new phone must not inherit it: otherwise
// anyone could opt in once, then point the account at someone else's number.
describe("forgetWaIdOnPhoneChange", () => {
  const PULL = Object.fromEntries(
    ["jobs", "applications", "interviews", "offers", "profile_views", "marketing", "system", "placements", "commissions", "team"].map((c) => [`categories.${c}.channels`, "whatsapp"]),
  );

  const FORGET = { $unset: { "whatsapp.waId": 1, "whatsapp.optInAt": 1, "whatsapp.lastInboundAt": 1, "whatsapp.verifiedNumber": 1, "whatsapp.verifiedAt": 1, "whatsapp.startCode": 1 } };

  it("resets the WhatsApp state only when the stored phone is another number", async () => {
    before = { _id: "u1", name: "Sara Ali" };
    await forgetWaIdOnPhoneChange("u1", "+971 50 765 4321");
    expect(findById).toHaveBeenCalledWith("u1");
    expect(findOneAndUpdate).toHaveBeenCalledTimes(1);
    const [filter, update, options] = findOneAndUpdate.mock.calls[0];
    // Compare and set: the reset applies only while the phone is still the one just read and judged another number.
    expect(filter).toEqual({ _id: "u1", phone: "+971501234567" });
    // The verified number belongs to the old phone too: the new one must be proven by its own START. The personal
    // START code goes with it, so the new number is verified with a fresh code.
    expect(update).toEqual({
      $unset: { "whatsapp.waId": 1, "whatsapp.optInAt": 1, "whatsapp.lastInboundAt": 1, "whatsapp.verifiedNumber": 1, "whatsapp.verifiedAt": 1, "whatsapp.startCode": 1 },
    });
    expect(options).toEqual({ returnDocument: "before" });
  });

  // C2: profile forms send the phone back in whatever format the input produced. A reformat is the same number:
  // it must not withdraw consent, clear the START verification or write a phone_changed row.
  it.each([
    ["spaces", "+971 50 123 4567"],
    ["dashes and brackets", "+971 (50) 123-4567"],
    ["no plus", "971501234567"],
    ["the identical string", "+971501234567"],
  ])("is a no-op for the same number saved with %s", async (_label, phone) => {
    await forgetWaIdOnPhoneChange("u1", phone);
    // Nothing is written, so the START code (like the verification) is kept.
    expect(findOneAndUpdate).not.toHaveBeenCalled();
    expect(prefUpdateOne).not.toHaveBeenCalled();
    expect(consentCreate).not.toHaveBeenCalled();
  });

  it("compares a phone it cannot normalise as typed: the same string is a no-op, another one resets", async () => {
    stored = { phone: "050 123 4567" };
    await forgetWaIdOnPhoneChange("u1", "050 123 4567");
    expect(findOneAndUpdate).not.toHaveBeenCalled();
    await forgetWaIdOnPhoneChange("u1", "+971501234567");
    expect(findOneAndUpdate).toHaveBeenCalledWith({ _id: "u1", phone: "050 123 4567" }, FORGET, { returnDocument: "before" });
  });

  it("treats a first phone as a change, as before", async () => {
    stored = {};
    before = { _id: "u1", name: "Sara Ali" };
    await forgetWaIdOnPhoneChange("u1", "+971501234567");
    // phone: null matches an account with no phone stored.
    expect(findOneAndUpdate).toHaveBeenCalledWith({ _id: "u1", phone: null }, FORGET, { returnDocument: "before" });
    expect(prefUpdateOne).toHaveBeenCalledTimes(1);
    expect(consentCreate).not.toHaveBeenCalled();
  });

  it("does nothing for an account that does not exist", async () => {
    stored = null;
    await forgetWaIdOnPhoneChange("u1", "+971507654321");
    expect(findOneAndUpdate).not.toHaveBeenCalled();
    expect(prefUpdateOne).not.toHaveBeenCalled();
  });

  // Race safety: between the read and the reset another save may change the phone. The filter then misses, and the
  // helper reads again and decides on the phone now stored.
  it("decides again when the phone changed between its read and its reset", async () => {
    findById
      .mockReturnValueOnce({ select: () => ({ lean: async () => ({ phone: "+971501234567" }) }) })
      .mockReturnValueOnce({ select: () => ({ lean: async () => ({ phone: "+971 50 765 4321" }) }) });
    findOneAndUpdate.mockReturnValueOnce({ select: () => ({ lean: async () => null }) });
    await forgetWaIdOnPhoneChange("u1", "+971507654321");
    // The second read finds the new number already stored (a reformat of it): nothing left to reset.
    expect(findById).toHaveBeenCalledTimes(2);
    expect(findOneAndUpdate).toHaveBeenCalledTimes(1);
    expect(prefUpdateOne).not.toHaveBeenCalled();
  });

  it("resets regardless of the stored value once the phone keeps changing under it (fails safe: a new START is needed)", async () => {
    findOneAndUpdate.mockReturnValueOnce({ select: () => ({ lean: async () => null }) }).mockReturnValueOnce({ select: () => ({ lean: async () => null }) });
    before = { _id: "u1", name: "Sara Ali" };
    await forgetWaIdOnPhoneChange("u1", "+971507654321");
    expect(findOneAndUpdate).toHaveBeenCalledTimes(3);
    expect(findOneAndUpdate.mock.calls[2][0]).toEqual({ _id: "u1" });
    expect(prefUpdateOne).toHaveBeenCalledTimes(1);
  });

  it("turns WhatsApp off in every category and logs the withdrawn consent when the account had opted in", async () => {
    before = { _id: "u1", name: "Sara Ali", whatsapp: { optInAt: new Date("2026-10-01T09:00:00Z") } };
    prefUpdateOne.mockResolvedValue({ modifiedCount: 1 });
    await forgetWaIdOnPhoneChange("u1", "+971507654321");
    expect(prefUpdateOne).toHaveBeenCalledWith({ userId: "u1" }, { $pull: PULL });
    expect(consentCreate).toHaveBeenCalledWith({ userId: "u1", userName: "Sara Ali", consentType: "whatsapp_messaging", granted: false, source: "phone_changed" });
  });

  it("logs the withdrawal when only a ticked channel was left (no opt-in stamp)", async () => {
    before = { _id: "u1", name: "Sara Ali" };
    prefUpdateOne.mockResolvedValue({ modifiedCount: 1 });
    await forgetWaIdOnPhoneChange("u1", "+971507654321");
    expect(consentCreate).toHaveBeenCalledWith(expect.objectContaining({ granted: false, source: "phone_changed" }));
  });

  it("writes no consent row for an account that never opted in (a first phone, or one without WhatsApp)", async () => {
    before = { _id: "u1", name: "Sara Ali" };
    await forgetWaIdOnPhoneChange("u1", "+971507654321");
    expect(prefUpdateOne).toHaveBeenCalledTimes(1);
    expect(consentCreate).not.toHaveBeenCalled();
  });

  it("lets a write failure through, so the save that follows is not made on top of the old number's consent", async () => {
    findOneAndUpdate.mockImplementationOnce(() => ({ select: () => ({ lean: async () => Promise.reject(new Error("write blocked")) }) }));
    await expect(forgetWaIdOnPhoneChange("u1", "+971500000000")).rejects.toThrow("write blocked");
  });

  it("never fails the save over the consent row alone (history, like optIn.ts)", async () => {
    before = { _id: "u1", name: "Sara Ali", whatsapp: { optInAt: new Date() } };
    consentCreate.mockRejectedValue(new Error("quota"));
    await expect(forgetWaIdOnPhoneChange("u1", "+971500000000")).resolves.toBeUndefined();
    expect(logger.error).toHaveBeenCalledTimes(1);
  });

  it("lets a failed preference reset through too", async () => {
    before = { _id: "u1", name: "Sara Ali", whatsapp: { optInAt: new Date() } };
    prefUpdateOne.mockRejectedValue(new Error("write blocked"));
    await expect(forgetWaIdOnPhoneChange("u1", "+971500000000")).rejects.toThrow("write blocked");
  });
});
