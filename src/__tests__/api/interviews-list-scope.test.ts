/**
 * @jest-environment node
 */
import { NextRequest } from "next/server";
import { Types } from "mongoose";

const EMPLOYER_USER = "64b000000000000000000001";
const EMPLOYER_ID = "64b000000000000000000002";
const JOB_ID = "64b000000000000000000010";
const APP_ID = "64b000000000000000000020";

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: (req: NextRequest, ctx: unknown) => Promise<Response>) =>
    (req: NextRequest) => handler(req, { userId: EMPLOYER_USER, role: "employer", locale: "en" }),
}));
jest.mock("@/lib/audit/log", () => ({ logActivity: jest.fn(), actorFromCtx: jest.fn() }));
jest.mock("@/lib/logger", () => ({ __esModule: true, default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));

function chain<T>(result: T) {
  const c: Record<string, jest.Mock> = {};
  for (const m of ["populate", "sort", "skip", "limit", "select"]) c[m] = jest.fn(() => c);
  c.lean = jest.fn(async () => result);
  return c;
}

jest.mock("@/models/Employer", () => ({ __esModule: true, Employer: { findOne: jest.fn(() => chain({ _id: EMPLOYER_ID })) } }));
jest.mock("@/models/Job", () => ({ __esModule: true, default: {} }));
jest.mock("@/models/Application", () => ({ __esModule: true, default: {} }));
jest.mock("@/models/JobSeeker", () => ({ __esModule: true, default: {} }));

const find = jest.fn((..._a: unknown[]) => chain([]));
const countDocuments = jest.fn(async (..._a: unknown[]) => 0);
const aggregate = jest.fn(async (..._a: unknown[]) => [{ _id: "scheduled", count: 1 }]);
jest.mock("@/models/Interview", () => ({ __esModule: true, default: { find: (...a: unknown[]) => find(...a), countDocuments: (...a: unknown[]) => countDocuments(...a), aggregate: (...a: unknown[]) => aggregate(...a) } }));

async function call(qs: string) {
  const { GET } = await import("@/app/api/interviews/route");
  return GET(new NextRequest(`http://localhost:3000/api/interviews?${qs}`), { params: Promise.resolve({}) } as never);
}

describe("GET /api/interviews scoped by job / application", () => {
  beforeEach(() => { find.mockClear(); aggregate.mockClear(); });

  it("casts ?jobId= to an ObjectId so the statusCounts aggregate matches the same rows as the list", async () => {
    const res = await call(`jobId=${JOB_ID}&limit=10`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.statusCounts).toEqual({ scheduled: 1 });
    const match = (aggregate.mock.calls[0] as unknown as [{ $match: Record<string, unknown> }[]])[0][0].$match;
    expect(match.jobId).toBeInstanceOf(Types.ObjectId);
    expect(String(match.jobId)).toBe(JOB_ID);
    const findQuery = (find.mock.calls[0] as unknown as [Record<string, unknown>])[0];
    expect(String(findQuery.jobId)).toBe(JOB_ID);
  });

  it("casts ?applicationId= the same way and ignores malformed ids", async () => {
    await call(`applicationId=${APP_ID}`);
    const match = (aggregate.mock.calls[0] as unknown as [{ $match: Record<string, unknown> }[]])[0][0].$match;
    expect(match.applicationId).toBeInstanceOf(Types.ObjectId);
    aggregate.mockClear();
    await call("applicationId=not-an-id");
    const match2 = (aggregate.mock.calls[0] as unknown as [{ $match: Record<string, unknown> }[]])[0][0].$match;
    expect(match2.applicationId).toBeUndefined();
  });
});
