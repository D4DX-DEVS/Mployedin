/**
 * @jest-environment node
 *
 * UK GDPR Art 17: what the admin erasure (lib/gdpr/erasure.ts) must also remove
 * beyond the profile and files (gdpr-erasure-files.test.ts):
 *   - the profile photo: the object in our storage is deleted (best effort) and
 *     `avatar` is nulled;
 *   - the password hash and every reset / verification / sign-in secret;
 *   - the name, IP address and user agent on the person's consent rows, while
 *     the evidence of each choice (type, granted, version, reference, source,
 *     dates) is kept (Art 7(1), Art 17(3)(e)).
 */
const USER_ID = "64e000000000000000000001";
const CDN = "https://bucket.blr1.digitaloceanspaces.com";

jest.mock("@/lib/gdpr/redactMessages", () => ({ redactUserMessages: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/cv/cvDocuments", () => ({ deleteCvRecordsOfSeeker: jest.fn().mockResolvedValue(undefined) }));
const logWarn = jest.fn();
jest.mock("@/lib/logger", () => ({ __esModule: true, default: { error: jest.fn(), warn: (...a: unknown[]) => logWarn(...a), info: jest.fn() } }));

const deleteFile = jest.fn((..._a: unknown[]) => Promise.resolve(undefined));
jest.mock("@/lib/storage/spaces", () => ({
  deleteFile: (...a: unknown[]) => deleteFile(...a),
  // The real helper: strips the bucket's CDN base, leaves anything else unchanged.
  urlToKey: (url: string) => (url.startsWith(`${CDN}/`) ? url.slice(CDN.length + 1) : url),
}));

const chain = (value: unknown) => ({
  select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(value) }),
  lean: jest.fn().mockResolvedValue(value),
});

/** The account as stored before the erasure (findByIdAndUpdate returns the pre-update document). */
let before: { avatar?: string | null } | null = null;
const userUpdate = jest.fn((..._a: unknown[]) => chain(before));
jest.mock("@/models/User", () => ({
  __esModule: true,
  default: {
    findById: () => chain({ phone: null }),
    findByIdAndUpdate: (...a: unknown[]) => userUpdate(...a),
    updateOne: jest.fn().mockResolvedValue({}),
  },
}));
jest.mock("@/models/JobSeeker", () => ({ __esModule: true, default: { findOneAndUpdate: () => chain(null) } }));
jest.mock("@/models/Application", () => ({ __esModule: true, default: { find: () => chain([]), updateMany: jest.fn() } }));
jest.mock("@/models/Notification", () => ({ __esModule: true, default: { deleteMany: jest.fn().mockResolvedValue(undefined) } }));
jest.mock("@/models/WhatsAppMessageLog", () => ({ __esModule: true, default: { deleteMany: jest.fn().mockResolvedValue(undefined) } }));
jest.mock("@/models/WhatsAppSuppression", () => ({ __esModule: true, deleteLiftedSuppressions: jest.fn().mockResolvedValue(undefined) }));
const consentUpdateMany = jest.fn((..._a: unknown[]) => Promise.resolve({ modifiedCount: 3 }));
jest.mock("@/models/ConsentLog", () => ({ __esModule: true, default: { updateMany: (...a: unknown[]) => consentUpdateMany(...a) } }));

import { eraseUserPersonalData } from "@/lib/gdpr/erasure";

type UserUpdate = { $set: Record<string, unknown>; $unset: Record<string, unknown> };
const userUpdateDoc = () => userUpdate.mock.calls[0][1] as UserUpdate;

beforeEach(() => {
  jest.clearAllMocks();
  before = null;
});

describe("eraseUserPersonalData: the account itself", () => {
  it("nulls the profile photo and unsets the password hash and every reset, verification and sign-in secret", async () => {
    await eraseUserPersonalData(USER_ID);
    const update = userUpdateDoc();
    expect(update.$set).toMatchObject({ name: "Deleted User", phone: null, avatar: null, isActive: false });
    for (const field of [
      "passwordHash",
      "emailVerificationToken",
      "emailVerificationOtp",
      "emailVerificationExpiry",
      "pendingEmail",
      "emailChangeToken",
      "emailChangeExpires",
      "passwordResetToken",
      "passwordResetExpiry",
      "linkedinAccessToken",
      "twoFactorSecretEnc",
      "twoFactorPendingSecretEnc",
      "twoFactorRecoveryCodes",
      "calendarFeedToken",
    ]) {
      expect(update.$unset).toHaveProperty(field);
    }
  });

  it("deletes a photo stored in our bucket", async () => {
    before = { avatar: `${CDN}/avatars/oauth-1234.jpg` };
    await eraseUserPersonalData(USER_ID);
    expect(deleteFile).toHaveBeenCalledWith(`${CDN}/avatars/oauth-1234.jpg`);
  });

  it("never sends a delete for a photo that is not in our bucket (a Google or LinkedIn URL)", async () => {
    before = { avatar: "https://lh3.googleusercontent.com/a/photo=s96-c" };
    await eraseUserPersonalData(USER_ID);
    expect(deleteFile).not.toHaveBeenCalled();
    // The field is still nulled.
    expect(userUpdateDoc().$set.avatar).toBeNull();
  });

  it("logs a photo it could not delete and carries on", async () => {
    before = { avatar: `${CDN}/avatars/a.png` };
    deleteFile.mockRejectedValueOnce(new Error("spaces down"));
    await expect(eraseUserPersonalData(USER_ID)).resolves.toEqual({ anonymizedEmail: `deleted_${USER_ID}@anonymized.mployedin.com` });
    expect(logWarn).toHaveBeenCalledWith(expect.objectContaining({ userId: USER_ID }), expect.stringContaining("photo"));
  });
});

describe("eraseUserPersonalData: the consent rows", () => {
  it("replaces the name and removes the IP address and user agent, keeping the evidence of each choice", async () => {
    await eraseUserPersonalData(USER_ID);
    expect(consentUpdateMany).toHaveBeenCalledTimes(1);
    const [filter, update] = consentUpdateMany.mock.calls[0] as [Record<string, unknown>, UserUpdate];
    expect(filter).toEqual({ userId: USER_ID });
    expect(update.$set).toEqual({ userName: "Deleted User" });
    expect(update.$unset).toEqual({ ipAddress: 1, userAgent: 1 });
    // The evidence fields are never touched.
    for (const kept of ["consentType", "granted", "policyVersion", "receiptId", "source", "createdAt", "updatedAt"]) {
      expect(update.$set).not.toHaveProperty(kept);
      expect(update.$unset).not.toHaveProperty(kept);
    }
  });

  it("fails the erasure when the consent rows can't be anonymised, so the request stays open for a retry", async () => {
    consentUpdateMany.mockRejectedValueOnce(new Error("db down"));
    await expect(eraseUserPersonalData(USER_ID)).rejects.toThrow("db down");
  });
});
