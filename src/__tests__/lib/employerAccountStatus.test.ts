/**
 * @jest-environment node
 */
export {};

const EMPLOYER_USER = "64f000000000000000000001";
const EMPLOYER_ID = "64f000000000000000000002";

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));

const employerFindOneAndUpdate = jest.fn();
jest.mock("@/models/Employer", () => ({
  __esModule: true,
  Employer: { findOneAndUpdate: (...a: unknown[]) => employerFindOneAndUpdate(...a) },
  default: { findOneAndUpdate: (...a: unknown[]) => employerFindOneAndUpdate(...a) },
}));

const jobUpdateMany = jest.fn();
jest.mock("@/models/Job", () => ({
  __esModule: true,
  default: { updateMany: (...a: unknown[]) => jobUpdateMany(...a) },
}));

const withEmployer = (doc: unknown) =>
  employerFindOneAndUpdate.mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(doc) }) });

describe("employer account status → job visibility", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jobUpdateMany.mockResolvedValue({ modifiedCount: 2 });
  });

  it("deactivating pauses the employer's live jobs and flags them as paused by deactivation", async () => {
    withEmployer({ _id: EMPLOYER_ID });
    const { deactivateEmployerAccount } = await import("@/lib/employers/accountStatus");

    const result = await deactivateEmployerAccount(EMPLOYER_USER);

    expect(employerFindOneAndUpdate).toHaveBeenCalledWith(
      { userId: EMPLOYER_USER },
      { $set: { isActive: false } },
      expect.anything(),
    );
    expect(jobUpdateMany).toHaveBeenCalledWith(
      { employerId: EMPLOYER_ID, status: "active", deletedAt: null },
      { $set: { status: "paused", pauseReason: "employer_deactivated" } },
    );
    expect(result).toEqual({ employerId: EMPLOYER_ID, affectedJobs: 2 });
  });

  it("reactivating resumes only the jobs that were paused by deactivation", async () => {
    withEmployer({ _id: EMPLOYER_ID });
    const { reactivateEmployerAccount } = await import("@/lib/employers/accountStatus");

    const result = await reactivateEmployerAccount(EMPLOYER_USER);

    expect(employerFindOneAndUpdate).toHaveBeenCalledWith(
      { userId: EMPLOYER_USER },
      { $set: { isActive: true } },
      expect.anything(),
    );
    expect(jobUpdateMany).toHaveBeenCalledWith(
      { employerId: EMPLOYER_ID, status: "paused", pauseReason: "employer_deactivated" },
      { $set: { status: "active" }, $unset: { pauseReason: 1 } },
    );
    expect(result).toEqual({ employerId: EMPLOYER_ID, affectedJobs: 2 });
  });

  it("is a no-op for users without an employer profile", async () => {
    withEmployer(null);
    const { deactivateEmployerAccount } = await import("@/lib/employers/accountStatus");

    const result = await deactivateEmployerAccount(EMPLOYER_USER);

    expect(jobUpdateMany).not.toHaveBeenCalled();
    expect(result).toEqual({ employerId: null, affectedJobs: 0 });
  });
});
