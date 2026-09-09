/**
 * @jest-environment node
 */
import { NextRequest } from "next/server";

const SEEKER_USER = "64b000000000000000000001";
const SEEKER_ID = "64b000000000000000000002";

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: (req: NextRequest, ctx: unknown) => Promise<Response>) =>
    (req: NextRequest) => handler(req, { userId: SEEKER_USER, role: "job_seeker", locale: "en" }),
}));
jest.mock("@/lib/audit/log", () => ({ logActivity: jest.fn(), actorFromCtx: jest.fn() }));
jest.mock("@/lib/logger", () => ({ __esModule: true, default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));

function chain<T>(result: T) {
  const c: Record<string, jest.Mock> = {};
  for (const m of ["populate", "sort", "skip", "limit", "select"]) c[m] = jest.fn(() => c);
  c.lean = jest.fn(async () => result);
  return c;
}

jest.mock("@/models/JobSeeker", () => ({ __esModule: true, default: { findOne: jest.fn(() => chain({ _id: SEEKER_ID })) } }));
jest.mock("@/models/Job", () => ({ __esModule: true, default: {} }));
jest.mock("@/models/Application", () => ({ __esModule: true, default: {} }));

const find = jest.fn((..._a: unknown[]) => chain([]));
const countDocuments = jest.fn(async (q: Record<string, unknown>) => {
  // total → 9; the two scoped journey counts are told apart by their $and shape
  const and = q.$and as Array<Record<string, unknown>> | undefined;
  if (!and) return 9;
  return JSON.stringify(and).includes('"$gte"') ? 1 : 8;
});
const aggregate = jest.fn(async (..._a: unknown[]) => []);
jest.mock("@/models/Interview", () => ({
  __esModule: true,
  default: {
    find: (...a: unknown[]) => find(...a),
    countDocuments: (...a: unknown[]) => countDocuments(...(a as [Record<string, unknown>])),
    aggregate: (...a: unknown[]) => aggregate(...a),
  },
}));

async function call(qs: string) {
  const { GET } = await import("@/app/api/interviews/route");
  return GET(new NextRequest(`http://localhost:3000/api/interviews?${qs}`), { params: Promise.resolve({}) } as never);
}

describe("GET /api/interviews journey counts", () => {
  beforeEach(() => { find.mockClear(); countDocuments.mockClear(); aggregate.mockClear(); });

  it("returns upcoming/past on the seeker scope when fetchCounts=true, ignoring the status filter", async () => {
    const res = await call("status=confirmed&fetchCounts=true&limit=10");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.counts).toEqual({ upcoming: 1, past: 8 });
    expect(countDocuments).toHaveBeenCalledTimes(3);
    const scoped = countDocuments.mock.calls
      .map((c) => c[0])
      .filter((q) => Array.isArray(q.$and)) as Array<{ $and: Array<Record<string, unknown>> }>;
    expect(scoped).toHaveLength(2);
    for (const q of scoped) {
      expect(q.$and[0]).toEqual({ jobSeekerId: SEEKER_ID });
      expect(JSON.stringify(q)).not.toContain('"confirmed"');
    }

    // Assert the literal clauses, not just the mock's "$gte"-substring guess —
    // reversing $gte/$lt, emptying $nin, or dropping status:$ne would all slip
    // past a looser check.
    const [firstScoped, secondScoped] = scoped;
    const upcoming = "scheduledAt" in firstScoped.$and[1] ? firstScoped : secondScoped;
    const past = upcoming === firstScoped ? secondScoped : firstScoped;
    expect(upcoming.$and.slice(1)).toEqual([
      { scheduledAt: { $gte: expect.any(Date) } },
      { status: { $nin: ["cancelled", "rescheduled"] } },
    ]);
    expect(past.$and.slice(1)).toEqual([
      { status: { $ne: "rescheduled" } },
      { $or: [{ scheduledAt: { $lt: expect.any(Date) } }, { status: "cancelled" }] },
    ]);
  });

  it("leaves the response untouched without the param", async () => {
    const res = await call("limit=10");
    const body = await res.json();
    expect(body.counts).toBeUndefined();
    expect(countDocuments).toHaveBeenCalledTimes(1);
  });
});
