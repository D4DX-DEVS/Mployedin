/**
 * @jest-environment node
 *
 * The admin Job Seekers list, "searching for a job": every row carries its
 * newest application, and with `?jobId=` its application to that job and its
 * CV exports for it, plus the job bar's counts. `hideExported` / `hideApplied`
 * leave out the seekers the client already has. The job is admin-only.
 */
import { NextRequest } from "next/server";

const oid = (n: number) => `65${"0".repeat(20)}${String(n).padStart(2, "0")}`;
const JOB = oid(80);
let role = "admin";

jest.mock("@/models/Industry", () => ({
  __esModule: true,
  default: { find: () => ({ select: () => ({ lean: async () => [] }) }) },
}));
jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/auth/withAuth", () => ({
  withAuth:
    (handler: (...args: unknown[]) => unknown) =>
    async (req: NextRequest) =>
      handler(req, { userId: "staff_1", role, locale: "en" }),
}));
jest.mock("@/lib/referrals/summary", () => ({ decorateReferralSummaries: jest.fn(async (items: unknown[]) => items) }));
jest.mock("@/lib/jobseekers/suggestedRole.server", () => ({ suggestedRolesFor: jest.fn(async () => new Map()) }));
jest.mock("@/models/User", () => ({ __esModule: true, default: { collection: { name: "users" } } }));
jest.mock("@/models/Agent", () => ({ __esModule: true, default: { findOne: jest.fn() } }));
jest.mock("@/models/SuperAgent", () => ({ __esModule: true, default: { findOne: jest.fn() } }));

const applicationsBySeeker = jest.fn(async (_ids: unknown[]) => new Map<string, unknown[]>());
jest.mock("@/lib/jobseekers/hiringStatus.server", () => ({
  applicationsBySeeker: (ids: unknown[]) => applicationsBySeeker(ids),
  applicationStatusesBySeeker: jest.fn(async () => new Map()),
}));

const history = {
  findJobForContext: jest.fn(async (id: string): Promise<unknown> => (id === JOB ? JOB : null)),
  jobApplicationsBySeeker: jest.fn(async () => new Map([[oid(1), { applicationId: oid(50), status: "interview_scheduled", updatedAt: "2026-11-21T00:00:00.000Z" }]])),
  jobExportsBySeeker: jest.fn(async () => new Map([[oid(2), { count: 1, lastAt: "2026-11-18T00:00:00.000Z", lastBy: "Sam", lastVersions: ["standardised"] }]])),
  jobContextFor: jest.fn(async () => ({ job: { id: JOB, title: "Site Engineer", status: "active" }, appliedCount: 14, exportedCount: 22 })),
  seekerIdsExportedForJob: jest.fn(async () => [oid(7)]),
  seekerIdsAppliedToJob: jest.fn(async () => [oid(8)]),
};
jest.mock("@/lib/cv/cvExportHistory.server", () => ({
  findJobForContext: (id: string) => history.findJobForContext(id),
  jobApplicationsBySeeker: () => history.jobApplicationsBySeeker(),
  jobExportsBySeeker: () => history.jobExportsBySeeker(),
  jobContextFor: () => history.jobContextFor(),
  seekerIdsExportedForJob: () => history.seekerIdsExportedForJob(),
  seekerIdsAppliedToJob: () => history.seekerIdsAppliedToJob(),
}));

const findFilters: Array<{ $and?: Array<Record<string, unknown>> }> = [];
function chain(result: unknown) {
  const c: Record<string, jest.Mock> = {};
  for (const m of ["populate", "sort", "skip", "limit", "select"]) c[m] = jest.fn(() => c);
  c.lean = jest.fn(async () => result);
  return c;
}
jest.mock("@/models/JobSeeker", () => ({
  __esModule: true,
  default: {
    find: jest.fn((f: { $and?: Array<Record<string, unknown>> }) => {
      findFilters.push(f);
      return chain([{ _id: oid(1), fullName: "Nikhil" }, { _id: oid(2), fullName: "Fahad" }, { _id: oid(3), fullName: "Karthik" }]);
    }),
    countDocuments: jest.fn(async () => 3),
    aggregate: jest.fn(async () => []),
  },
}));

async function list(qs = "") {
  const { GET } = await import("@/app/api/job-seekers/route");
  const res = await GET(new NextRequest(`http://localhost:3888/api/job-seekers?${qs}`), { params: Promise.resolve({}) });
  return res.json();
}

const ninOf = (filter: { $and?: Array<Record<string, unknown>> }) =>
  (filter.$and ?? []).flatMap((c) => {
    const id = c._id as { $nin?: unknown[] } | undefined;
    return id?.$nin ? [id.$nin] : [];
  });

beforeEach(() => {
  jest.clearAllMocks();
  findFilters.length = 0;
  role = "admin";
});

describe("GET /api/job-seekers — applications and the job being filled", () => {
  it("every row carries its newest application, or none", async () => {
    applicationsBySeeker.mockResolvedValueOnce(new Map([
      [oid(1), [
        { id: "a2", jobId: "j2", jobTitle: "Site Engineer", company: "Al Noor", status: "interview_scheduled", updatedAt: "2026-11-21T00:00:00.000Z" },
        { id: "a1", jobId: "j1", jobTitle: "Civil Engineer", status: "rejected", updatedAt: "2026-11-06T00:00:00.000Z" },
      ]],
    ]));
    const body = await list();
    expect(body.items[0].lastApplication).toMatchObject({ jobTitle: "Site Engineer", status: "interview_scheduled" });
    expect(body.items[0].applicationCount).toBe(2);
    expect(body.items[1].lastApplication).toBeUndefined();
    expect(body.items[1].applicationCount).toBe(0);
    // No job asked: no job fields, no job lookups.
    expect(body.items[0]).not.toHaveProperty("forJob");
    expect(body).not.toHaveProperty("jobContext");
    expect(history.findJobForContext).not.toHaveBeenCalled();
  });

  it("with a job: each row's application to it and CV exports for it, and the job bar counts", async () => {
    const body = await list(`jobId=${JOB}`);
    expect(body.items[0].forJob).toEqual({ application: expect.objectContaining({ status: "interview_scheduled" }), exported: null });
    expect(body.items[1].forJob).toEqual({ application: null, exported: expect.objectContaining({ lastBy: "Sam" }) });
    expect(body.items[2].forJob).toEqual({ application: null, exported: null });
    expect(body.jobContext).toMatchObject({ appliedCount: 14, exportedCount: 22 });
    // Showing context is not filtering: nobody is left out unless asked.
    expect(ninOf(findFilters[0])).toEqual([]);
  });

  it("hideExported / hideApplied leave out the seekers the client already has", async () => {
    await list(`jobId=${JOB}&hideExported=1&hideApplied=1`);
    expect(ninOf(findFilters[0])).toEqual([[oid(7)], [oid(8)]]);
  });

  it("an unknown job is ignored: no job fields and no filters", async () => {
    const body = await list(`jobId=${oid(81)}&hideExported=1`);
    expect(body.items[0]).not.toHaveProperty("forJob");
    expect(body).not.toHaveProperty("jobContext");
    expect(ninOf(findFilters[0])).toEqual([]);
  });

  it("is admin-only: a super agent's job is never looked up", async () => {
    role = "super_agent";
    const { default: SuperAgent } = await import("@/models/SuperAgent");
    (SuperAgent.findOne as jest.Mock).mockReturnValue({ select: () => ({ lean: async () => null }) });
    const body = await list(`jobId=${JOB}&hideExported=1`);
    expect(history.findJobForContext).not.toHaveBeenCalled();
    expect(body).not.toHaveProperty("jobContext");
  });
});
