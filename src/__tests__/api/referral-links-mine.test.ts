/**
 * @jest-environment node
 */
import { NextRequest } from "next/server";

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/auth/withAuth", () => {
  const { NextResponse: Res } = jest.requireActual("next/server");
  return {
    withAuth: (handler: (...args: unknown[]) => unknown) => async (req: NextRequest) => {
      try {
        return await handler(req, { userId: "64c000000000000000000001", role: "super_agent", locale: "en" });
      } catch (err) {
        if (err instanceof Res) return err;
        throw err;
      }
    },
  };
});
jest.mock("@/lib/audit/log", () => ({
  actorFromCtx: jest.fn(() => ({ actorId: "test", actorRole: "test" })),
  logActivity: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/lib/security/sanitize", () => ({ escapeRegex: (s: string) => s }));
jest.mock("@/lib/auth/agentRestrictions", () => ({
  getSuperAgentScope: jest.fn(async () => ({
    effectiveAgentIds: ["64c000000000000000000010", "64c000000000000000000011"],
  })),
}));
jest.mock("@/models/Agent", () => ({
  __esModule: true,
  default: {
    findOne: jest.fn(() => ({ select: () => ({ lean: async () => ({ _id: "64c000000000000000000010" }) }) })),
    create: jest.fn(),
    find: jest.fn(() => ({
      select: () => ({
        lean: async () => [
          { _id: "64c000000000000000000010", userId: "64c000000000000000000002" },
          { _id: "64c000000000000000000011", userId: "64c000000000000000000003" },
        ],
      }),
    })),
  },
}));
jest.mock("@/models/SuperAgent", () => ({
  __esModule: true,
  default: {
    findOne: jest.fn(() => ({
      select: () => ({ lean: async () => ({ _id: "64c000000000000000000099" }) }),
    })),
    create: jest.fn(),
  },
}));

const findFilters: Array<Record<string, unknown>> = [];
function chain(result: unknown) {
  const c: Record<string, jest.Mock> = {};
  for (const m of ["sort", "skip", "limit", "populate"]) c[m] = jest.fn(() => c);
  c.lean = jest.fn(async () => result);
  return c;
}
jest.mock("@/models/ReferralLink", () => ({
  __esModule: true,
  default: {
    exists: jest.fn(async () => null),
    create: jest.fn(async () => ({})),
    find: jest.fn((filter: Record<string, unknown>) => {
      findFilters.push(filter);
      return chain([]);
    }),
    countDocuments: jest.fn(async () => 0),
    aggregate: jest.fn(async () => []),
  },
}));

describe("referral-links: mine parameter", () => {
  beforeEach(() => {
    findFilters.length = 0;
    jest.clearAllMocks();
  });

  it("without mine=1, super_agent sees own links plus team agents' links", async () => {
    const { GET } = await import("@/app/api/referral-links/route");
    await GET(new NextRequest("http://localhost:3888/api/referral-links"), { params: Promise.resolve({}) });
    const filter = findFilters[0];
    // Should have $in with SA's userId and both agent userIds
    expect(filter.createdBy).toHaveProperty("$in");
    const createdByIds = (filter.createdBy as { $in: unknown[] }).$in;
    expect(createdByIds.length).toBeGreaterThanOrEqual(3); // SA + 2 agents
  });

  it("with mine=1, super_agent sees only own links", async () => {
    const { GET } = await import("@/app/api/referral-links/route");
    await GET(new NextRequest("http://localhost:3888/api/referral-links?mine=1"), { params: Promise.resolve({}) });
    const filter = findFilters[0];
    // Should have a direct ObjectId, not $in
    expect(filter.createdBy).toBeDefined();
    // Check it's not $in (indicating it's a single value)
    expect(filter.createdBy).not.toHaveProperty("$in");
  });

  it("mine=1 with audience filter works correctly", async () => {
    const { GET } = await import("@/app/api/referral-links/route");
    await GET(new NextRequest("http://localhost:3888/api/referral-links?mine=1&audience=job_seeker"), { params: Promise.resolve({}) });
    const filter = findFilters[0];
    expect(filter.audience).toBe("job_seeker");
    // Check createdBy is a single value, not $in
    expect(filter.createdBy).not.toHaveProperty("$in");
  });
});
