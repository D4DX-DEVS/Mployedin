/**
 * @jest-environment node
 *
 * GDPR erasure must also remove the files a seeker uploaded beyond the main CV:
 * their document library (JobSeeker.documents — ID scans, certificates) and the
 * per-application attachments (Application.documents). Both used to survive
 * erasure, still downloadable by the employers the seeker had applied to. The
 * CV records (each CV's full text and reading) go too.
 *
 * The erasure runs when an admin completes a deletion request
 * (lib/gdpr/erasure.ts), not on the user's own DELETE any more.
 */
const USER_ID = "64e000000000000000000001";
const SEEKER_ID = "64e0000000000000000000aa";

jest.mock("@/lib/gdpr/redactMessages", () => ({ redactUserMessages: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/audit/log", () => ({ actorFromCtx: jest.fn(() => ({})), logActivity: jest.fn().mockResolvedValue(undefined) }));

const deleteFile = jest.fn().mockResolvedValue(undefined);
jest.mock("@/lib/storage/spaces", () => ({ deleteFile: (...a: unknown[]) => deleteFile(...a) }));

const lean = (value: unknown) => ({
  select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(value) }),
  lean: jest.fn().mockResolvedValue(value),
});

const seekerUpdate = jest.fn((..._a: unknown[]) => lean({
  _id: SEEKER_ID,
  cv: { originalUrl: "https://s3/cvs/cv.pdf" },
  documents: [{ url: "https://s3/documents/passport.pdf" }],
}));
jest.mock("@/models/JobSeeker", () => ({ __esModule: true, default: { findOneAndUpdate: (...a: unknown[]) => seekerUpdate(...a) } }));

const appFind = jest.fn((..._a: unknown[]) => lean([
  { _id: "app1", documents: [{ url: "https://s3/documents/cover.pdf" }] },
  { _id: "app2", documents: [] },
]));
const appUpdateMany = jest.fn().mockResolvedValue({ modifiedCount: 1 });
jest.mock("@/models/Application", () => ({
  __esModule: true,
  default: { find: (...a: unknown[]) => appFind(...a), updateMany: (...a: unknown[]) => appUpdateMany(...a) },
}));
// The subject's number, read before anonymisation so log rows under another user's id can be erased too.
const userFindById = jest.fn((..._a: unknown[]) => lean({ phone: "971501234567", whatsapp: { waId: "971501234567" } }));
jest.mock("@/models/User", () => ({
  __esModule: true,
  // updateOne: eraseWhatsAppData clears the whatsapp subdocument.
  default: { findById: (...a: unknown[]) => userFindById(...a), findByIdAndUpdate: jest.fn().mockResolvedValue(undefined), updateOne: jest.fn().mockResolvedValue({}) },
}));
jest.mock("@/models/Interview", () => ({ __esModule: true, default: { find: jest.fn() } }));
jest.mock("@/models/Notification", () => ({ __esModule: true, default: { deleteMany: jest.fn().mockResolvedValue(undefined) } }));
const waDeleteMany = jest.fn((..._a: unknown[]) => Promise.resolve(undefined));
jest.mock("@/models/WhatsAppMessageLog", () => ({ __esModule: true, default: { deleteMany: (...a: unknown[]) => waDeleteMany(...a) } }));
// The STOP list: the erasure drops the subject's entries that no longer suppress anything (erasureWhatsApp.test.ts).
const deleteLiftedSuppressions = jest.fn((..._a: unknown[]) => Promise.resolve(undefined));
jest.mock("@/models/WhatsAppSuppression", () => ({ __esModule: true, deleteLiftedSuppressions: (...a: unknown[]) => deleteLiftedSuppressions(...a) }));
jest.mock("@/models/GdprRequest", () => ({ __esModule: true, default: { create: jest.fn().mockResolvedValue({}) } }));
const deleteCvRecordsOfSeeker = jest.fn().mockResolvedValue(undefined);
jest.mock("@/lib/cv/cvDocuments", () => ({ deleteCvRecordsOfSeeker: (...a: unknown[]) => deleteCvRecordsOfSeeker(...a) }));

describe("eraseUserPersonalData removes every uploaded file", () => {
  it("unsets the document library and application attachments and deletes their objects", async () => {
    const { eraseUserPersonalData } = await import("@/lib/gdpr/erasure");
    const result = await eraseUserPersonalData(USER_ID);
    expect(result.anonymizedEmail).toBe(`deleted_${USER_ID}@anonymized.mployedin.com`);

    const [, update] = seekerUpdate.mock.calls[0] as unknown as [unknown, { $unset: Record<string, unknown> }];
    expect(update.$unset).toHaveProperty("documents");

    expect(appFind).toHaveBeenCalledWith({ jobSeekerId: SEEKER_ID });
    expect(appUpdateMany).toHaveBeenCalledWith({ jobSeekerId: SEEKER_ID }, { $set: { documents: [] } });

    const deleted = deleteFile.mock.calls.map((c) => c[0]).sort();
    expect(deleted).toEqual([
      "https://s3/cvs/cv.pdf",
      "https://s3/documents/cover.pdf",
      "https://s3/documents/passport.pdf",
    ]);
    expect(deleteCvRecordsOfSeeker).toHaveBeenCalledWith(SEEKER_ID);

    // WhatsApp delivery log: the user's own rows, and rows under another user's id that hold their number.
    expect(waDeleteMany).toHaveBeenCalledWith({ userId: USER_ID });
    const byNumber = waDeleteMany.mock.calls.map((c) => c[0] as { to?: { $in: string[] } }).find((f) => f.to);
    expect([...(byNumber?.to?.$in ?? [])].sort()).toEqual(["+971501234567", "971501234567"]);
    // STOP-list entries of the same numbers that are no longer in force.
    expect([...(deleteLiftedSuppressions.mock.calls[0][0] as string[])].sort()).toEqual(["+971501234567", "971501234567"]);
  });
});
