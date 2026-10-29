/**
 * @jest-environment node
 */
/** Applications are anonymised 24 months after their job closes (owner decision 2026-10-28). */

const jobDistinct = jest.fn();
const appFind = jest.fn();
const appUpdateMany = jest.fn();
const diversityDelete = jest.fn();
const checksDelete = jest.fn();

jest.mock("@/models/Job", () => ({ __esModule: true, default: { distinct: (...a: unknown[]) => jobDistinct(...a) } }));
jest.mock("@/models/Application", () => ({
  __esModule: true,
  default: {
    find: (...a: unknown[]) => appFind(...a),
    updateMany: (...a: unknown[]) => appUpdateMany(...a),
  },
}));
jest.mock("@/models/DiversityResponse", () => ({ __esModule: true, default: { deleteMany: (...a: unknown[]) => diversityDelete(...a) } }));
jest.mock("@/models/BackgroundCheck", () => ({ __esModule: true, default: { deleteMany: (...a: unknown[]) => checksDelete(...a) } }));
jest.mock("@/lib/gdpr/erasure", () => ({ ERASED_APPLICATION_FIELDS: ["coverLetter", "screeningAnswers", "employerNotes"] }));

import { anonymiseExpiredApplications, retentionCutoff } from "@/lib/gdpr/applicationRetention";

const NOW = new Date("2026-10-28T03:30:00Z");
const found = (rows: unknown[]) => ({ select: () => ({ limit: () => ({ lean: async () => rows }) }) });

beforeEach(() => {
  jest.clearAllMocks();
  jobDistinct.mockResolvedValue(["job1"]);
  appFind.mockReturnValue(found([{ _id: "a1" }, { _id: "a2" }]));
  appUpdateMany.mockResolvedValue({ modifiedCount: 2 });
  diversityDelete.mockResolvedValue({ deletedCount: 1 });
  checksDelete.mockResolvedValue({ deletedCount: 0 });
});

it("counts 24 months back from today", () => {
  expect(retentionCutoff(NOW).toISOString()).toBe("2024-10-28T03:30:00.000Z");
});

it("only looks at jobs closed, expired or deleted and unchanged for 24 months", async () => {
  await anonymiseExpiredApplications(NOW);
  const filter = jobDistinct.mock.calls[0][1];
  expect(jobDistinct.mock.calls[0][0]).toBe("_id");
  expect(filter).toEqual({
    $or: [{ status: { $in: ["closed", "expired"] } }, { deletedAt: { $ne: null } }],
    updatedAt: { $lte: retentionCutoff(NOW) },
  });
  expect(appFind).toHaveBeenCalledWith({
    jobId: { $in: ["job1"] },
    updatedAt: { $lte: retentionCutoff(NOW) },
    retentionAnonymisedAt: { $exists: false },
  });
});

it("clears what was written, the attached documents, diversity answers and checks — and stamps the row", async () => {
  const result = await anonymiseExpiredApplications(NOW);
  expect(appUpdateMany).toHaveBeenCalledWith(
    { _id: { $in: ["a1", "a2"] } },
    {
      $set: { retentionAnonymisedAt: NOW },
      $unset: { coverLetter: 1, screeningAnswers: 1, employerNotes: 1, documents: 1 },
    },
  );
  expect(diversityDelete).toHaveBeenCalledWith({ applicationId: { $in: ["a1", "a2"] } });
  expect(checksDelete).toHaveBeenCalledWith({ applicationId: { $in: ["a1", "a2"] } });
  expect(result).toEqual({ anonymised: 2, diversityDeleted: 1, checksDeleted: 0 });
});

it("does nothing when no job has been closed that long", async () => {
  jobDistinct.mockResolvedValue([]);
  expect(await anonymiseExpiredApplications(NOW)).toEqual({ anonymised: 0, diversityDeleted: 0, checksDeleted: 0 });
  expect(appFind).not.toHaveBeenCalled();
  expect(appUpdateMany).not.toHaveBeenCalled();
});
