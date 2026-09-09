/**
 * @jest-environment node
 */
import { NextRequest } from "next/server";

jest.mock("@/lib/db/mongoose", () => ({
  connectDB: jest.fn().mockResolvedValue(undefined),
}));

const EMPLOYER_USER = "emp_user_1";

jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: Function, _opts: unknown) => {
    return async (req: NextRequest) => handler(req, { userId: EMPLOYER_USER, role: "employer", locale: "en" });
  },
}));

jest.mock("@/models/JobSeeker", () => ({
  __esModule: true,
  default: {
    findOne: jest.fn(() => ({ select: () => ({ lean: async () => null }) })),
    find: jest.fn(() => ({ select: () => ({ lean: async () => [] }) })),
  },
}));

jest.mock("@/models/Agent", () => ({
  __esModule: true,
  default: {
    findOne: jest.fn(() => ({ select: () => ({ lean: async () => null }) })),
  },
}));

const EMPLOYER_ID = "64b000000000000000000001";
const JOB_ID = "64b000000000000000000002";

jest.mock("@/models/Employer", () => ({
  __esModule: true,
  Employer: {
    findOne: jest.fn(() => ({ select: () => ({ lean: async () => ({ _id: EMPLOYER_ID }) }) })),
  },
}));

jest.mock("@/models/CompanyUser", () => ({
  __esModule: true,
  CompanyUser: {
    findOne: jest.fn(() => ({ select: () => ({ lean: async () => null }) })),
  },
}));

jest.mock("@/models/Job", () => ({
  __esModule: true,
  default: {
    find: jest.fn(() => ({ select: () => ({ lean: async () => [{ _id: JOB_ID }] }) })),
  },
}));

jest.mock("@/lib/auth/agentRestrictions", () => ({
  getSuperAgentEmployerIds: jest.fn(async () => []),
}));

let applicationQueries: Array<Record<string, unknown>> = [];

function chain() {
  const c: Record<string, jest.Mock> = {};
  for (const m of ["sort", "skip", "limit", "select", "populate"]) c[m] = jest.fn(() => c);
  c.lean = jest.fn(async () => []);
  return c;
}

jest.mock("@/models/Application", () => ({
  __esModule: true,
  default: {
    find: jest.fn((query: Record<string, unknown>) => {
      applicationQueries.push(query);
      return chain();
    }),
    countDocuments: jest.fn(async () => 0),
  },
}));

const callHandler = async (req: NextRequest) => {
  const { getHandler: handler } = await import("@/app/api/applications/handlers");
  // getHandler is wrapped by withAuth, which adds the context
  // Since we're importing the unwrapped version, we need to wrap it ourselves
  return handler(req, { userId: EMPLOYER_USER, role: "employer", locale: "en" });
};

function makeReq(url: string) {
  return new NextRequest(`http://localhost:3000${url}`, { method: "GET" });
}

describe("GET /api/applications — unreviewed filter", () => {
  beforeEach(() => {
    applicationQueries = [];
    jest.clearAllMocks();
  });

  it("adds viewedByEmployerAt: null and status: 'applied' when unreviewed=true with no status", async () => {
    await callHandler(
      makeReq(`/api/applications?jobId=${JOB_ID}&unreviewed=true&page=1&limit=10`)
    );

    expect(applicationQueries.length).toBeGreaterThan(0);
    const query = applicationQueries[0];
    expect(query.viewedByEmployerAt).toEqual(null);
    expect(query.status).toBe("applied");
  });

  it("keeps existing status when unreviewed=true and status is provided", async () => {
    await callHandler(
      makeReq(`/api/applications?jobId=${JOB_ID}&unreviewed=true&status=shortlisted&page=1&limit=10`)
    );

    expect(applicationQueries.length).toBeGreaterThan(0);
    const query = applicationQueries[0];
    expect(query.viewedByEmployerAt).toEqual(null);
    expect(query.status).toBe("shortlisted");
  });

  /** Shortlisting is what sends a candidate to interview, so the shortlist has
      to keep them once they get there. `stageFrom` matches the stage and every
      later one; rejected and withdrawn stay out. */
  it("expands stageFrom into the stage and every later one", async () => {
    await callHandler(makeReq(`/api/applications?jobId=${JOB_ID}&stageFrom=shortlisted&page=1&limit=10`));

    const query = applicationQueries[0];
    expect(query.status).toEqual({
      $in: ["shortlisted", "interview_scheduled", "selected", "offer", "hired"],
    });
  });

  it("lets an explicit status win over stageFrom", async () => {
    await callHandler(makeReq(`/api/applications?jobId=${JOB_ID}&status=hired&stageFrom=shortlisted&page=1&limit=10`));

    expect(applicationQueries[0].status).toBe("hired");
  });

  it("ignores a stageFrom that is not a pipeline stage", async () => {
    await callHandler(makeReq(`/api/applications?jobId=${JOB_ID}&stageFrom=rejected&page=1&limit=10`));

    expect(applicationQueries[0].status).toBeUndefined();
  });

  it("does not add unreviewed filter when unreviewed is not true", async () => {
    await callHandler(
      makeReq(`/api/applications?jobId=${JOB_ID}&page=1&limit=10`)
    );

    expect(applicationQueries.length).toBeGreaterThan(0);
    const query = applicationQueries[0];
    expect(query.viewedByEmployerAt).toBeUndefined();
  });
});
