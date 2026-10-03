/**
 * @jest-environment node
 */
export {};

type Account = { name?: string; phone?: string; whatsapp?: Record<string, unknown> };
const VERIFIED: Account = { name: "Sara Ali", phone: "+971 50 123 4567", whatsapp: { optInAt: new Date("2026-10-01T09:00:00Z"), verifiedNumber: "+971501234567" } };
const userFindById = jest.fn((..._args: unknown[]) => ({ select: () => ({ lean: async (): Promise<Account | null> => ({ name: "Sara Ali" }) }) }));
const userUpdateOne = jest.fn().mockResolvedValue({});
jest.mock("@/models/User", () => ({ __esModule: true, default: { findById: (...a: unknown[]) => userFindById(...a), updateOne: (...a: unknown[]) => userUpdateOne(...a) } }));
const consentCreate = jest.fn().mockResolvedValue({});
jest.mock("@/models/ConsentLog", () => ({ __esModule: true, default: { create: (...a: unknown[]) => consentCreate(...a) } }));
const isNumberSuppressed = jest.fn().mockResolvedValue(false);
jest.mock("@/models/WhatsAppSuppression", () => ({ __esModule: true, isNumberSuppressed: (...a: unknown[]) => isNumberSuppressed(...a) }));
jest.mock("@/lib/logger", () => ({ __esModule: true, default: { error: jest.fn(), info: jest.fn(), warn: jest.fn() } }));

import { hasWhatsAppChannel, isWhatsAppReachable, recordWhatsAppOptInChange } from "@/lib/communications/whatsapp/optIn";

const account = (a: Account | null) => userFindById.mockReturnValue({ select: () => ({ lean: async () => a }) });

beforeEach(() => {
  jest.clearAllMocks();
  isNumberSuppressed.mockResolvedValue(false);
  account({ name: "Sara Ali" });
});

describe("hasWhatsAppChannel", () => {
  it("is true when any category lists whatsapp", () => {
    expect(hasWhatsAppChannel({ jobs: { channels: ["in_app"] }, interviews: { channels: ["in_app", "whatsapp"] } })).toBe(true);
    expect(hasWhatsAppChannel({ jobs: { channels: ["in_app", "email"] } })).toBe(false);
    expect(hasWhatsAppChannel(undefined)).toBe(false);
  });
});

// One rule for "messages can reach this account": the settings pages' Verified note and the toggle's consent row.
describe("isWhatsAppReachable", () => {
  it("is true for a number a START verified, with no STOP since and not on the list", async () => {
    expect(await isWhatsAppReachable(VERIFIED)).toBe(true);
    expect(isNumberSuppressed).toHaveBeenCalledWith("+971501234567");
  });

  it("is false when no START verified the profile number, without reading the list", async () => {
    expect(await isWhatsAppReachable({ phone: "+971501234567", whatsapp: {} })).toBe(false);
    expect(await isWhatsAppReachable({ phone: "+971501234567", whatsapp: { verifiedNumber: "+971500000000" } })).toBe(false);
    expect(await isWhatsAppReachable(null)).toBe(false);
    expect(isNumberSuppressed).not.toHaveBeenCalled();
  });

  it("is false after a STOP on the account, even though the number stays verified", async () => {
    expect(await isWhatsAppReachable({ ...VERIFIED, whatsapp: { ...VERIFIED.whatsapp, optOutAt: new Date("2026-10-02T09:00:00Z") } })).toBe(false);
  });

  it("is false while the number is on the STOP list", async () => {
    isNumberSuppressed.mockResolvedValue(true);
    expect(await isWhatsAppReachable(VERIFIED)).toBe(false);
  });
});

describe("recordWhatsAppOptInChange", () => {
  // The toggle is a preference, not consent: consent is a START from the number (webhookHandlers.ts).
  // Turning the channel on must neither clear a STOP (optOutAt) nor stamp an opt-in.
  it("writes nothing for an unverified account turning the channel on: no opt-in stamp, no cleared STOP, no consent row", async () => {
    account({ name: "Sara Ali", phone: "+971501234567" });
    await recordWhatsAppOptInChange({ userId: "u1", before: false, after: true, source: "notification_settings", ipAddress: "1.2.3.4" });
    expect(userUpdateOne).not.toHaveBeenCalled();
    expect(consentCreate).not.toHaveBeenCalled();
  });

  // F3: off then on again, for a number a START verified, really resumes sends, so the ledger must say granted.
  it("records a grant when a verified account turns the channel back on, and still stamps nothing on the user", async () => {
    account(VERIFIED);
    await recordWhatsAppOptInChange({ userId: "u1", before: false, after: true, source: "notification_settings", ipAddress: "1.2.3.4" });
    expect(consentCreate).toHaveBeenCalledWith({ userId: "u1", userName: "Sara Ali", consentType: "whatsapp_messaging", granted: true, source: "notification_settings", ipAddress: "1.2.3.4" });
    expect(userUpdateOne).not.toHaveBeenCalled();
  });

  it("writes nothing for an opted-out account turning the channel on", async () => {
    account({ ...VERIFIED, whatsapp: { ...VERIFIED.whatsapp, optOutAt: new Date("2026-10-02T09:00:00Z") } });
    await recordWhatsAppOptInChange({ userId: "u1", before: false, after: true, source: "notification_settings" });
    expect(consentCreate).not.toHaveBeenCalled();
    expect(userUpdateOne).not.toHaveBeenCalled();
  });

  it("writes nothing when the verified number is on the STOP list", async () => {
    account(VERIFIED);
    isNumberSuppressed.mockResolvedValue(true);
    await recordWhatsAppOptInChange({ userId: "u1", before: false, after: true, source: "notification_settings" });
    expect(consentCreate).not.toHaveBeenCalled();
  });

  it("writes no grant, and does not throw, when the account or the STOP list cannot be read", async () => {
    userFindById.mockImplementationOnce(() => { throw new Error("db"); });
    await expect(recordWhatsAppOptInChange({ userId: "u1", before: false, after: true, source: "x" })).resolves.toBeUndefined();
    account(VERIFIED);
    isNumberSuppressed.mockRejectedValueOnce(new Error("db"));
    await expect(recordWhatsAppOptInChange({ userId: "u1", before: false, after: true, source: "x" })).resolves.toBeUndefined();
    expect(consentCreate).not.toHaveBeenCalled();
    const logger = (await import("@/lib/logger")).default;
    expect(logger.error).toHaveBeenCalledTimes(2);
  });

  it("keeps the history in order for off, on, off: withdrawn, granted, withdrawn", async () => {
    account(VERIFIED);
    await recordWhatsAppOptInChange({ userId: "u1", before: true, after: false, source: "notification_settings" });
    await recordWhatsAppOptInChange({ userId: "u1", before: false, after: true, source: "notification_settings" });
    await recordWhatsAppOptInChange({ userId: "u1", before: true, after: false, source: "notification_settings" });
    expect(consentCreate.mock.calls.map(([row]) => (row as { granted: boolean }).granted)).toEqual([false, true, false]);
  });

  it("logs consent withdrawn when the last channel is removed, with the client IP", async () => {
    await recordWhatsAppOptInChange({ userId: "u1", before: true, after: false, source: "notification_settings", ipAddress: "1.2.3.4" });
    expect(userUpdateOne).not.toHaveBeenCalled();
    expect(consentCreate).toHaveBeenCalledWith({ userId: "u1", userName: "Sara Ali", consentType: "whatsapp_messaging", granted: false, source: "notification_settings", ipAddress: "1.2.3.4" });
  });
  it("is a no-op without a change and never throws", async () => {
    await recordWhatsAppOptInChange({ userId: "u1", before: true, after: true, source: "x" });
    expect(consentCreate).not.toHaveBeenCalled();
    consentCreate.mockRejectedValueOnce(new Error("db"));
    await expect(recordWhatsAppOptInChange({ userId: "u1", before: true, after: false, source: "x" })).resolves.toBeUndefined();
  });
  // An unrelated preferences save writes nothing either way.
  it.each([
    ["still on", true],
    ["still off", false],
  ])("writes nothing to the user or the consent log when the channel is %s", async (_label, state) => {
    await recordWhatsAppOptInChange({ userId: "u1", before: state, after: state, source: "notification_settings" });
    expect(userFindById).not.toHaveBeenCalled();
    expect(userUpdateOne).not.toHaveBeenCalled();
    expect(consentCreate).not.toHaveBeenCalled();
  });
  it("still logs the withdrawal, as 'Unknown', when the name lookup fails", async () => {
    userFindById.mockImplementationOnce(() => { throw new Error("db"); });
    await expect(recordWhatsAppOptInChange({ userId: "u1", before: true, after: false, source: "x" })).resolves.toBeUndefined();
    expect(consentCreate).toHaveBeenCalledWith(expect.objectContaining({ granted: false, userName: "Unknown" }));
  });
  it("does not throw when the consent row itself cannot be written", async () => {
    consentCreate.mockRejectedValueOnce(new Error("db"));
    await expect(recordWhatsAppOptInChange({ userId: "u1", before: true, after: false, source: "x" })).resolves.toBeUndefined();
    const logger = (await import("@/lib/logger")).default;
    expect(logger.error).toHaveBeenCalled();
  });
  it("falls back to 'Unknown' when the user has no name", async () => {
    account({});
    await recordWhatsAppOptInChange({ userId: "u1", before: true, after: false, source: "x" });
    expect(consentCreate).toHaveBeenCalledWith(expect.objectContaining({ userName: "Unknown" }));
  });
});
