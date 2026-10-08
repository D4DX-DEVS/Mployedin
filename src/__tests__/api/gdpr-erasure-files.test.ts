/**
 * @jest-environment node
 *
 * GDPR erasure must also remove the files a seeker uploaded beyond the main CV:
 * their document library (JobSeeker.documents — ID scans, certificates) and the
 * per-application attachments (Application.documents). Both used to survive
 * erasure, still downloadable by the employers the seeker had applied to. The
 * CV records (each CV's full text and reading) go too.
 */
import { NextRequest } from "next/server";

const USER_ID = "64e000000000000000000001";
const SEEKER_ID = "64e0000000000000000000aa";

jest.mock("@/lib/gdpr/redactMessages", () => ({ redactUserMessages: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/audit/log", () => ({ actorFromCtx: jest.fn(() => ({})), logActivity: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/security/rateLimit", () => ({ checkRateLimit: jest.fn().mockResolvedValue({ allowed: true }) }));
jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: (req: NextRequest, ctx: unknown) => Promise<Response>) =>
    (req: NextRequest) => handler(req, { userId: USER_ID, role: "job_seeker", locale: "en" }),
}));

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
jest.mock("@/models/User", () => ({
  __esModule: true,
  default: {
    // OAuth-only job seeker: no password to confirm.
    findById: jest.fn(() => ({ select: jest.fn().mockResolvedValue({ _id: USER_ID, role: "job_seeker" }) })),
    findByIdAndUpdate: jest.fn().mockResolvedValue(undefined),
  },
}));
jest.mock("@/models/Interview", () => ({ __esModule: true, default: { find: jest.fn() } }));
// Cookie-consent proof: listed on export, unlinked from the account on erasure.
jest.mock("@/models/CookieConsentRecord", () => {
  const chain = { select: () => chain, sort: () => chain, limit: () => chain, lean: () => Promise.resolve([]) };
  return { __esModule: true, default: { find: jest.fn(() => chain), updateMany: jest.fn().mockResolvedValue({}) } };
});
jest.mock("@/models/Notification", () => ({ __esModule: true, default: { deleteMany: jest.fn().mockResolvedValue(undefined) } }));
jest.mock("@/models/GdprRequest", () => ({ __esModule: true, default: { create: jest.fn().mockResolvedValue({}) } }));
const deleteCvRecordsOfSeeker = jest.fn().mockResolvedValue(undefined);
jest.mock("@/lib/cv/cvDocuments", () => ({ deleteCvRecordsOfSeeker: (...a: unknown[]) => deleteCvRecordsOfSeeker(...a) }));

describe("DELETE /api/gdpr/export removes every uploaded file", () => {
  it("unsets the document library and application attachments and deletes their objects", async () => {
    const { DELETE } = await import("@/app/api/gdpr/export/route");
    const res = await DELETE(new NextRequest("http://localhost/api/gdpr/export", { method: "DELETE" }), { params: Promise.resolve({}) });
    expect(res.status).toBe(200);

    const [, update] = seekerUpdate.mock.calls[0] as unknown as [unknown, { $unset: Record<string, unknown> }];
    expect(update.$unset).toHaveProperty("documents");
    // Allow-list erasure (GD-1): identity fields go, structural refs stay.
    for (const f of ["fullName", "dateOfBirth", "nationalId", "visaNumber", "hometown", "socialLinks", "searchEmbedding"]) {
      expect(update.$unset).toHaveProperty(f);
    }
    expect(update.$unset).not.toHaveProperty("userId");
    expect((update as unknown as { $set: Record<string, unknown> }).$set).toMatchObject({ profileVisibility: "hidden" });

    expect(appFind).toHaveBeenCalledWith({ jobSeekerId: SEEKER_ID });
    expect(appUpdateMany).toHaveBeenCalledWith({ jobSeekerId: SEEKER_ID }, { $set: { documents: [] } });

    const deleted = deleteFile.mock.calls.map((c) => c[0]).sort();
    expect(deleted).toEqual([
      "https://s3/cvs/cv.pdf",
      "https://s3/documents/cover.pdf",
      "https://s3/documents/passport.pdf",
    ]);
    expect(deleteCvRecordsOfSeeker).toHaveBeenCalledWith(SEEKER_ID);
  });
});
