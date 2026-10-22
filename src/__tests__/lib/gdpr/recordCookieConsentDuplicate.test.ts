/**
 * @jest-environment node
 *
 * recordCookieConsent checks for existing rows and then inserts: not atomic, so a
 * resend racing the first delivery could write one choice twice. The database now
 * holds a unique index on (userId, receiptId, consentType) over rows with a
 * reference; the losing insert gets a duplicate-key error, which means the rows
 * are already there: done, not an error.
 */
const insertMany = jest.fn();
jest.mock("@/models/ConsentLog", () => ({
  __esModule: true,
  default: { exists: jest.fn().mockResolvedValue(null), insertMany: (...a: unknown[]) => insertMany(...a) },
}));
jest.mock("@/models/User", () => ({
  __esModule: true,
  default: { findById: () => ({ select: () => ({ lean: async () => ({ name: "Sam Seeker" }) }) }) },
}));
const logError = jest.fn();
jest.mock("@/lib/logger", () => ({ __esModule: true, default: { error: (...a: unknown[]) => logError(...a), warn: jest.fn(), info: jest.fn() } }));

import { recordCookieConsent } from "@/lib/gdpr/consent";

const input = { userId: "507f1f77bcf86cd799439011", receiptId: "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed", preferences: true, media: false, source: "banner" as const };

beforeEach(() => jest.clearAllMocks());

describe("recordCookieConsent and the unique consent-row index", () => {
  it("inserts unordered, so one duplicate row does not stop the other category's row", async () => {
    insertMany.mockResolvedValue([]);
    await recordCookieConsent(input);
    expect(insertMany).toHaveBeenCalledWith(expect.any(Array), expect.objectContaining({ ordered: false }));
  });

  it("treats a duplicate-key error (the rows are already there) as done, without logging an error", async () => {
    insertMany.mockRejectedValue(Object.assign(new Error("E11000 duplicate key error"), { code: 11000 }));
    await expect(recordCookieConsent(input)).resolves.toBeUndefined();
    expect(logError).not.toHaveBeenCalled();
  });

  it("still logs any other failure (and never throws)", async () => {
    insertMany.mockRejectedValue(Object.assign(new Error("quota"), { code: 8000 }));
    await expect(recordCookieConsent(input)).resolves.toBeUndefined();
    expect(logError).toHaveBeenCalledTimes(1);
  });
});
