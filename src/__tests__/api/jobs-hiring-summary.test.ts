/**
 * @jest-environment node
 */
import { NextRequest } from "next/server";

const EMPLOYER_USER = "64b000000000000000000001";
const EMPLOYER_ID = "64b000000000000000000002";
const JOB_ID = "64b000000000000000000010";

let role = "employer";
jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: (req: NextRequest, ctx: unknown, params?: Record<string, string>) => Promise<Response>) =>
    (req: NextRequest, context: { params: Promise<Record<string, string>> }) =>
      context.params.then((params) => handler(req, { userId: EMPLOYER_USER, role, locale: "en" }, params)),
}));
jest.mock("@/lib/auth/agentRestrictions", () => ({ getSuperAgentScope: jest.fn(async () => ({ effectiveAgentIds: [] })) }));

function chain<T>(result: T) {
  const c: Record<string, jest.Mock> = {};
  for (const m of ["populate", "sort", "skip", "limit", "select"]) c[m] = jest.fn(() => c);
  c.lean = jest.fn(async () => result);
  return c;
}

jest.mock("@/models/Job", () => ({
  __esModule: true,
  default: { findById: jest.fn(() => chain({ _id: JOB_ID, employerId: EMPLOYER_ID, agentId: null, status: "active", vacancies: 2, views: 48 })) },
}));
jest.mock("@/models/Employer", () => ({
  __esModule: true,
  Employer: { findOne: jest.fn(() => chain({ _id: EMPLOYER_ID })) },
}));
jest.mock("@/models/Agent", () => ({ __esModule: true, default: { findOne: jest.fn(() => chain(null)), findById: jest.fn(() => chain(null)) } }));

const appAggregate = jest.fn(async (..._args: unknown[]) => [{
  byStatus: [{ _id: "applied", count: 7 }, { _id: "shortlisted", count: 3 }, { _id: "hired", count: 1 }],
  unreviewed: [{ n: 4 }],
}]);
const appCountDocuments = jest.fn(async (..._args: unknown[]) => 0);
jest.mock("@/models/Application", () => ({
  __esModule: true,
  default: {
    aggregate: (...a: unknown[]) => appAggregate(...a),
    countDocuments: (...a: unknown[]) => appCountDocuments(...a),
  },
}));

interface InterviewFacets {
  open: Array<{ n: number }>;
  upcoming: Array<{ n: number }>;
  awaitingOutcome: Array<{ n: number }>;
  rescheduleRequests: Array<{ n: number }>;
  openApplicationIds?: Array<{ _id: string }>;
}
const interviewAggregate = jest.fn<Promise<InterviewFacets[]>, unknown[]>(async () => [
  { open: [{ n: 3 }], upcoming: [{ n: 2 }], awaitingOutcome: [{ n: 1 }], rescheduleRequests: [] },
]);
jest.mock("@/models/Interview", () => ({ __esModule: true, default: { aggregate: (...a: unknown[]) => interviewAggregate(...a) } }));

const offerAggregate = jest.fn(async (..._args: unknown[]) => [{ pending: [{ n: 1 }], expiringSoon: [{ n: 1 }], accepted: [{ n: 1 }] }]);
jest.mock("@/models/Offer", () => ({ __esModule: true, default: { aggregate: (...a: unknown[]) => offerAggregate(...a) } }));

const checkAggregate = jest.fn(async (..._args: unknown[]) => [{ inProgress: [], completed: [{ n: 1 }] }]);
jest.mock("@/models/BackgroundCheck", () => ({ __esModule: true, default: { aggregate: (...a: unknown[]) => checkAggregate(...a) } }));

const placementAggregate = jest.fn(async (..._args: unknown[]) => [{ active: [{ n: 1 }], completed: [] }]);
jest.mock("@/models/Placement", () => ({ __esModule: true, default: { aggregate: (...a: unknown[]) => placementAggregate(...a) } }));

const posterCount = jest.fn(async (..._args: unknown[]) => 2);
jest.mock("@/models/PosterGeneration", () => ({ __esModule: true, default: { countDocuments: (...a: unknown[]) => posterCount(...a) } }));

async function call() {
  const { GET } = await import("@/app/api/jobs/[id]/hiring-summary/route");
  return GET(new NextRequest(`http://localhost:3000/api/jobs/${JOB_ID}/hiring-summary`), { params: Promise.resolve({ id: JOB_ID }) });
}

describe("GET /api/jobs/[id]/hiring-summary", () => {
  beforeEach(() => {
    role = "employer";
    appCountDocuments.mockClear();
    appCountDocuments.mockResolvedValue(0);
    interviewAggregate.mockResolvedValue([{ open: [{ n: 3 }], upcoming: [{ n: 2 }], awaitingOutcome: [{ n: 1 }], rescheduleRequests: [] }]);
    appAggregate.mockResolvedValue([{
      byStatus: [{ _id: "applied", count: 7 }, { _id: "shortlisted", count: 3 }, { _id: "hired", count: 1 }],
      unreviewed: [{ n: 4 }],
    }]);
  });

  /** A candidate can hold an open interview while sitting at another stage —
      someone moved them back — and a stage-only count then reads 0 beside an
      Interviews tab reading 1. */
  it("counts candidates with an open interview outside the interview stage", async () => {
    appAggregate.mockResolvedValue([{
      byStatus: [{ _id: "interview_scheduled", count: 2 }, { _id: "shortlisted", count: 1 }],
      unreviewed: [],
    }]);
    interviewAggregate.mockResolvedValue([{
      open: [{ n: 3 }], upcoming: [], awaitingOutcome: [], rescheduleRequests: [],
      openApplicationIds: [{ _id: "app-a" }, { _id: "app-b" }, { _id: "app-c" }],
    }]);
    // Of those three, one sits outside the interview stage (and is not closed).
    appCountDocuments.mockResolvedValue(1);

    const body = await (await call()).json();
    expect(body.interviews.interviewingCandidates).toBe(3);
    expect(appCountDocuments).toHaveBeenCalledWith({
      _id: { $in: ["app-a", "app-b", "app-c"] },
      status: { $nin: ["interview_scheduled", "rejected", "withdrawn"] },
    });
  });

  it("does not query applications when no interview is open", async () => {
    const body = await (await call()).json();
    expect(body.interviews.interviewingCandidates).toBe(0);
    expect(appCountDocuments).not.toHaveBeenCalled();
  });

  it("returns zero-filled status counts and the needs-attention signals for the job", async () => {
    const res = await call();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.total).toBe(11);
    expect(body.statusCounts).toEqual({
      applied: 7, shortlisted: 3, interview_scheduled: 0, selected: 0, offer: 0, hired: 1, rejected: 0, withdrawn: 0,
    });
    expect(body.unreviewed).toBe(4);
    expect(body.interviews).toEqual({ open: 3, upcoming: 2, awaitingOutcome: 1, rescheduleRequests: 0, interviewingCandidates: 0 });
    expect(body.offers).toEqual({ pending: 1, expiringSoon: 1, accepted: 1 });
    expect(body.checks).toEqual({ inProgress: 0, completed: 1 });
    expect(body.placements).toEqual({ active: 1, completed: 0 });
    expect(body.posters).toBe(2);
    expect(body.vacancies).toBe(2);
    expect(body.views).toBe(48);
    expect(body.status).toBe("active");
  });

  it("scopes every aggregation to the job", async () => {
    await call();
    for (const agg of [appAggregate, interviewAggregate, offerAggregate, checkAggregate, placementAggregate]) {
      const pipeline = (agg.mock.calls[0] as unknown[])[0] as Array<Record<string, unknown>>;
      expect(String((pipeline[0].$match as { jobId: unknown }).jobId)).toBe(JOB_ID);
    }
    expect(posterCount).toHaveBeenCalledWith(expect.objectContaining({ jobId: expect.anything() }));
  });

  it("refuses a job the caller does not own", async () => {
    const { Employer } = jest.requireMock("@/models/Employer") as { Employer: { findOne: jest.Mock } };
    Employer.findOne.mockImplementationOnce(() => chain({ _id: "64b000000000000000000099" }));
    const res = await call();
    expect(res.status).toBe(403);
  });

  it("rejects an invalid id", async () => {
    const { GET } = await import("@/app/api/jobs/[id]/hiring-summary/route");
    const res = await GET(new NextRequest("http://localhost:3000/api/jobs/nope/hiring-summary"), { params: Promise.resolve({ id: "nope" }) });
    expect(res.status).toBe(400);
  });
});
