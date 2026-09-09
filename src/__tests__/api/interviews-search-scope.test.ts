/**
 * @jest-environment node
 */
import { NextRequest } from "next/server";

const mockSeekerUserId = "64b000000000000000000001";
const mockOwnSeekerId = "64b000000000000000000002";
const mockOtherSeekerId = "64b000000000000000000003";
const mockAgentUserId = "64b000000000000000000005";
const mockAgentId = "64b000000000000000000006";
const mockAgentEmployerId = "64b000000000000000000007";
let mockCurrentRole: "job_seeker" | "agent" = "job_seeker";

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: (req: NextRequest, ctx: unknown) => Promise<Response>) =>
    (req: NextRequest) =>
      handler(
        req,
        mockCurrentRole === "agent"
          ? { userId: mockAgentUserId, role: "agent", locale: "en" }
          : { userId: mockSeekerUserId, role: "job_seeker", locale: "en" },
      ),
}));
jest.mock("@/lib/audit/log", () => ({ logActivity: jest.fn(), actorFromCtx: jest.fn() }));
jest.mock("@/lib/logger", () => ({ __esModule: true, default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));

function chain<T>(result: T) {
  const c: Record<string, jest.Mock> = {};
  for (const m of ["populate", "sort", "skip", "limit", "select"]) c[m] = jest.fn(() => c);
  c.lean = jest.fn(async () => result);
  return c;
}

// The seeker's own profile, and the OTHER seeker whose name the search matches.
jest.mock("@/models/JobSeeker", () => ({
  __esModule: true,
  default: {
    findOne: jest.fn(() => chain({ _id: mockOwnSeekerId })),
    find: jest.fn(() => chain([{ _id: mockOtherSeekerId }])),
  },
}));
jest.mock("@/models/User", () => ({
  __esModule: true,
  default: { find: jest.fn(() => chain([{ _id: "64b000000000000000000004" }])) },
}));
// No job title matches the search text — this is the branch that leaked.
jest.mock("@/models/Job", () => ({ __esModule: true, default: { find: jest.fn(() => chain([])) } }));
jest.mock("@/models/Application", () => ({ __esModule: true, default: {} }));
// The agent's own profile: one assigned employer plus the agent's own id — the
// scope the old bug could erase. This branch previously had no test coverage
// at all even though the review called it the worse of the two leaks.
jest.mock("@/models/Agent", () => ({
  __esModule: true,
  Agent: { findOne: jest.fn(() => chain({ _id: mockAgentId, assignedEmployerIds: [mockAgentEmployerId] })) },
}));

const find = jest.fn((..._a: unknown[]) => chain([]));
const countDocuments = jest.fn(async (..._a: unknown[]) => 0);
const aggregate = jest.fn(async (..._a: unknown[]) => []);
jest.mock("@/models/Interview", () => ({
  __esModule: true,
  default: {
    find: (...a: unknown[]) => find(...a),
    countDocuments: (...a: unknown[]) => countDocuments(...a),
    aggregate: (...a: unknown[]) => aggregate(...a),
  },
}));

async function call(qs: string) {
  const { GET } = await import("@/app/api/interviews/route");
  return GET(new NextRequest(`http://localhost:3000/api/interviews?${qs}`), { params: Promise.resolve({}) } as never);
}

describe("GET /api/interviews search cannot widen the caller's scope", () => {
  beforeEach(() => { find.mockClear(); aggregate.mockClear(); mockCurrentRole = "job_seeker"; });

  it("keeps the seeker's own id when a name matches and no job title does", async () => {
    const res = await call("search=Someone%20Else");
    expect(res.status).toBe(200);

    expect(find).toHaveBeenCalledTimes(1);
    const query = (find.mock.calls[0] as unknown as [Record<string, unknown>])[0];

    // The caller's own scope survives...
    expect(String(query.jobSeekerId)).toBe(mockOwnSeekerId);
    // ...and the other seeker's id is only ever an additional AND clause.
    expect(JSON.stringify(query)).toContain(mockOtherSeekerId);
    expect(query.jobSeekerId).not.toEqual({ $in: [mockOtherSeekerId] });

    // The statusCounts aggregate must be scoped the same way.
    const match = (aggregate.mock.calls[0] as unknown as [{ $match: Record<string, unknown> }[]])[0][0].$match;
    expect(String(match.jobSeekerId)).toBe(mockOwnSeekerId);
  });

  it("keeps the agent's own scope $or alongside the new $and when a name matches", async () => {
    mockCurrentRole = "agent";
    const res = await call("search=Someone%20Else");
    expect(res.status).toBe(200);

    expect(find).toHaveBeenCalledTimes(1);
    const query = (find.mock.calls[0] as unknown as [Record<string, unknown>])[0];

    // The agent's own scope ($or, set by the role block before search runs)
    // survives untouched...
    expect(query.$or).toEqual([
      { employerId: { $in: [mockAgentEmployerId] } },
      { agentId: mockAgentId },
    ]);
    // ...and the search is ANDed on top as a separate top-level key, not
    // assigned over $or the way the pre-fix code did.
    const and = query.$and as Array<{ $or: unknown[] }>;
    expect(Array.isArray(and)).toBe(true);
    expect(and[0]).toEqual({ $or: [{ jobSeekerId: { $in: [mockOtherSeekerId] } }] });
  });

  it("still returns the empty short-circuit when nothing matches at all", async () => {
    const User = (await import("@/models/User")).default as unknown as { find: jest.Mock };
    User.find.mockImplementationOnce(() => chain([]));

    const res = await call("search=nothing-matches-this");
    const body = await res.json();
    expect(body.interviews).toEqual([]);
    expect(body.total).toBe(0);
    expect(find).not.toHaveBeenCalled();
  });

  it("still returns counts on the empty short-circuit when fetchCounts=true", async () => {
    const User = (await import("@/models/User")).default as unknown as { find: jest.Mock };
    User.find.mockImplementationOnce(() => chain([]));

    const res = await call("search=nothing-matches-this&fetchCounts=true");
    const body = await res.json();
    expect(body.interviews).toEqual([]);
    expect(body.counts).toEqual({ upcoming: 0, past: 0 });
    expect(find).not.toHaveBeenCalled();
  });
});
