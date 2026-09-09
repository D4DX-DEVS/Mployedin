/**
 * @jest-environment node
 */
import { NextRequest } from "next/server";

const EMPLOYER_USER = "64b000000000000000000001";
const EMPLOYER_ID = "64b000000000000000000002";
const JOB_ID = "64b000000000000000000010";
const APPLICATION_ID = "64b000000000000000000020";

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/audit/log", () => ({
  actorFromCtx: jest.fn((ctx) => ({ actorId: ctx.userId, actorRole: ctx.role })),
  logActivity: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: (req: NextRequest, ctx: unknown, params?: Record<string, string>) => Promise<Response>) =>
    (req: NextRequest, context?: { params: Promise<Record<string, string>> }) =>
      (context?.params ?? Promise.resolve({})).then((params) =>
        handler(req, { userId: EMPLOYER_USER, role: "employer", locale: "en" }, params)),
}));
jest.mock("@/lib/auth/agentRestrictions", () => ({ getSuperAgentScope: jest.fn(), getSuperAgentEmployerIds: jest.fn() }));

/** A Mongoose-style chain whose every builder method returns itself and resolves to `result`. */
function chain<T>(result: T): any {
  const c: any = {};
  for (const m of ["populate", "sort", "skip", "limit", "select"]) c[m] = jest.fn(() => c);
  c.lean = jest.fn(async () => result);
  return c;
}

const employerFindOne: jest.Mock<any> = jest.fn(() => chain({ _id: EMPLOYER_ID }));
jest.mock("@/models/Employer", () => ({
  __esModule: true,
  Employer: {
    findOne: jest.fn((query: any) => employerFindOne(query)) as jest.Mock<any>,
    findById: jest.fn() as jest.Mock<any>
  }
}));
jest.mock("@/models/Agent", () => ({ __esModule: true, default: { findOne: jest.fn() as jest.Mock<any> } }));
jest.mock("@/models/JobSeeker", () => ({ __esModule: true, default: { findOne: jest.fn() as jest.Mock<any>, find: jest.fn(() => chain([])) as jest.Mock<any> } }));
jest.mock("@/models/Job", () => ({ __esModule: true, default: { find: jest.fn(() => chain([])) as jest.Mock<any>, findById: jest.fn(() => chain(null)) as jest.Mock<any> } }));

const placementFind: jest.Mock<any> = jest.fn(() => chain([]));
const placementCount: jest.Mock<any> = jest.fn(async () => 0);
const placementAggregate: jest.Mock<any> = jest.fn(async () => [{ statusCounts: [], visaCounts: [], commission: [], employers: [], upcomingStarts: [] }]);
jest.mock("@/models/Placement", () => ({
  __esModule: true,
  default: {
    find: jest.fn((query: any) => placementFind(query)) as jest.Mock<any>,
    countDocuments: jest.fn((query: any) => placementCount(query)) as jest.Mock<any>,
    aggregate: jest.fn((pipeline: any) => placementAggregate(pipeline)) as jest.Mock<any>
  },
}));

const checkFind: jest.Mock<any> = jest.fn(() => chain([]));
const checkCount: jest.Mock<any> = jest.fn(async () => 0);
jest.mock("@/models/BackgroundCheck", () => ({
  __esModule: true,
  default: {
    find: jest.fn((query: any) => checkFind(query)) as jest.Mock<any>,
    countDocuments: jest.fn((query: any) => checkCount(query)) as jest.Mock<any>
  },
}));
jest.mock("@/models/Application", () => ({ __esModule: true, default: { findById: jest.fn() as jest.Mock<any> } }));

const posterFind: jest.Mock<any> = jest.fn(() => chain([]));
const posterCount: jest.Mock<any> = jest.fn(async () => 0);
jest.mock("@/models/PosterGeneration", () => ({
  __esModule: true,
  default: {
    find: jest.fn((query: any) => posterFind(query)) as jest.Mock<any>,
    countDocuments: jest.fn((query: any) => posterCount(query)) as jest.Mock<any>
  },
}));

const offerFind: jest.Mock<any> = jest.fn(() => chain([]));
const offerCount: jest.Mock<any> = jest.fn(async () => 0);
jest.mock("@/models/Offer", () => ({
  __esModule: true,
  default: {
    find: jest.fn((query: any) => offerFind(query)) as jest.Mock<any>,
    countDocuments: jest.fn((query: any) => offerCount(query)) as jest.Mock<any>
  },
}));

const get = (url: string) => new NextRequest(url);

describe("per-job / per-application scoping params", () => {
  beforeEach(() => {
    placementFind.mockClear(); checkFind.mockClear(); posterFind.mockClear(); offerFind.mockClear();
  });

  it("GET /api/placements honours jobId and applicationId", async () => {
    const { GET } = await import("@/app/api/placements/route");
    await GET(get(`http://localhost:3000/api/placements?jobId=${JOB_ID}&applicationId=${APPLICATION_ID}`), {} as any);
    // ids are cast to ObjectId so the stats aggregate $match sees the same rows as find()
    const q = placementFind.mock.calls[0][0];
    expect(String(q.jobId)).toBe(JOB_ID);
    expect(String(q.applicationId)).toBe(APPLICATION_ID);
  });

  it("GET /api/placements ignores an invalid jobId", async () => {
    const { GET } = await import("@/app/api/placements/route");
    await GET(get("http://localhost:3000/api/placements?jobId=not-an-id"), {} as any);
    expect(placementFind.mock.calls[0][0]).not.toHaveProperty("jobId");
  });

  it("GET /api/employer/background-checks honours jobId and applicationId", async () => {
    const { GET } = await import("@/app/api/employer/background-checks/route");
    await GET(get(`http://localhost:3000/api/employer/background-checks?jobId=${JOB_ID}&applicationId=${APPLICATION_ID}`), {} as any);
    expect(checkFind).toHaveBeenCalledWith(expect.objectContaining({ employerId: EMPLOYER_ID, jobId: JOB_ID, applicationId: APPLICATION_ID }));
  });

  it("GET /api/employers/posters honours jobId", async () => {
    const { GET } = await import("@/app/api/employers/posters/route");
    await GET(get(`http://localhost:3000/api/employers/posters?jobId=${JOB_ID}`), {} as any);
    expect(posterFind).toHaveBeenCalledWith(expect.objectContaining({ employerId: EMPLOYER_ID, jobId: JOB_ID }));
    expect(posterCount).toHaveBeenCalledWith(expect.objectContaining({ jobId: JOB_ID }));
  });

  it("GET /api/offers honours applicationId", async () => {
    const { GET } = await import("@/app/api/offers/route");
    await GET(get(`http://localhost:3000/api/offers?applicationId=${APPLICATION_ID}`), {} as any);
    expect(offerFind).toHaveBeenCalledWith(expect.objectContaining({ employerId: EMPLOYER_ID, applicationId: APPLICATION_ID }));
  });
});
