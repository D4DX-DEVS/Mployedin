/**
 * @jest-environment node
 *
 * One invite per candidate per job, claimed atomically before anything is sent.
 */
const JOB = "64a000000000000000000010";
const SEEKER = "64a000000000000000000020";

const createIndex = jest.fn().mockResolvedValue("jobId_1_jobSeekerId_1");
const create = jest.fn();
const deleteOne = jest.fn().mockResolvedValue({});
const inviteFind = jest.fn();
jest.mock("@/models/JobInvite", () => ({
  __esModule: true,
  JobInvite: {
    collection: { createIndex: (...a: unknown[]) => createIndex(...a) },
    create: (...a: unknown[]) => create(...a),
    deleteOne: (...a: unknown[]) => deleteOne(...a),
    find: (...a: unknown[]) => inviteFind(...a),
  },
}));
const auditExists = jest.fn();
const auditFind = jest.fn();
jest.mock("@/models/AuditLog", () => ({
  __esModule: true,
  default: { exists: (...a: unknown[]) => auditExists(...a), find: (...a: unknown[]) => auditFind(...a) },
}));

import { claimJobInvite, invitedSeekerIds, releaseJobInvite } from "@/lib/jobs/jobInvites";

const lean = (rows: unknown[]) => ({ select: () => ({ lean: async () => rows }) });
const input = { jobId: JOB, jobSeekerId: SEEKER, invitedBy: "u1", invitedByRole: "agent" };

beforeEach(() => {
  jest.clearAllMocks();
  auditExists.mockResolvedValue(null);
});

it("claims a first invite, building the unique index before the insert", async () => {
  create.mockResolvedValue({ _id: "claim1" });
  expect(await claimJobInvite(input)).toBe("claim1");
  expect(createIndex).toHaveBeenCalledWith({ jobId: 1, jobSeekerId: 1 }, { unique: true });
  expect(create).toHaveBeenCalledWith(input);
});

it("refuses a second claim: the unique index rejects the insert", async () => {
  create.mockRejectedValue(Object.assign(new Error("E11000 duplicate key"), { code: 11000 }));
  expect(await claimJobInvite(input)).toBeNull();
});

it("refuses an invite already recorded before JobInvite existed (audit log only)", async () => {
  auditExists.mockResolvedValue({ _id: "log1" });
  expect(await claimJobInvite(input)).toBeNull();
  expect(create).not.toHaveBeenCalled();
});

it("rethrows anything other than a duplicate", async () => {
  create.mockRejectedValue(new Error("network"));
  await expect(claimJobInvite(input)).rejects.toThrow("network");
});

it("releases a claim by id", async () => {
  await releaseJobInvite("claim1");
  expect(deleteOne).toHaveBeenCalledWith({ _id: "claim1" });
});

it("lists invited candidates from both the claims and the older audit records", async () => {
  inviteFind.mockReturnValue(lean([{ jobSeekerId: "s1" }]));
  auditFind.mockReturnValue(lean([{ meta: { jobSeekerId: "s2" } }]));
  expect([...(await invitedSeekerIds(JOB))].sort()).toEqual(["s1", "s2"]);
});
