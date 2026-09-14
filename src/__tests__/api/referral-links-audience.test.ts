/**
 * @jest-environment node
 */
import { NextRequest } from "next/server";

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
// Mirrors the real wrapper, which returns a thrown NextResponse (validateBody
// throws its 400 rather than returning it).
jest.mock("@/lib/auth/withAuth", () => {
  const { NextResponse: Res } = jest.requireActual("next/server");
  return {
    withAuth: (handler: (...args: unknown[]) => unknown) => async (req: NextRequest) => {
      try {
        return await handler(req, { userId: "64c000000000000000000001", role: "agent", locale: "en" });
      } catch (err) {
        if (err instanceof Res) return err;
        throw err;
      }
    },
  };
});
jest.mock("@/lib/audit/log", () => ({
  actorFromCtx: jest.fn((ctx: { userId: string; role: string }) => ({ actorId: ctx.userId, actorRole: ctx.role })),
  logActivity: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/lib/security/sanitize", () => ({ escapeRegex: (s: string) => s }));
jest.mock("@/lib/auth/agentRestrictions", () => ({ getSuperAgentScope: jest.fn(async () => null) }));
jest.mock("@/models/Agent", () => ({
  __esModule: true,
  default: {
    findOne: jest.fn(() => ({ select: () => ({ lean: async () => ({ _id: "64c000000000000000000010" }) }) })),
    create: jest.fn(),
    find: jest.fn(() => ({ select: () => ({ lean: async () => [] }) })),
  },
}));
jest.mock("@/models/SuperAgent", () => ({ __esModule: true, default: { findOne: jest.fn(), create: jest.fn() } }));

const created: Array<Record<string, unknown>> = [];
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
    create: jest.fn(async (doc: Record<string, unknown>) => { created.push(doc); return { _id: "64c000000000000000000099", ...doc }; }),
    find: jest.fn((filter: Record<string, unknown>) => { findFilters.push(filter); return chain([]); }),
    countDocuments: jest.fn(async () => 0),
    aggregate: jest.fn(async () => []),
  },
}));

function post(body: Record<string, unknown>) {
  return new NextRequest("http://localhost:3888/api/referral-links", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("referral links: audience", () => {
  beforeEach(() => { created.length = 0; findFilters.length = 0; jest.clearAllMocks(); });

  it("stores audience=job_seeker and returns the /register URL", async () => {
    const { POST } = await import("@/app/api/referral-links/route");
    const res = await POST(post({ audience: "job_seeker", label: "Campus drive" }), { params: Promise.resolve({}) });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(created[0].audience).toBe("job_seeker");
    expect(body.referralUrl).toMatch(/\/en\/register\?ref=MPL-[A-F0-9]{16}$/);
  });

  it("defaults to employer and the employer-register URL", async () => {
    const { POST } = await import("@/app/api/referral-links/route");
    const res = await POST(post({}), { params: Promise.resolve({}) });
    const body = await res.json();
    expect(created[0].audience).toBe("employer");
    expect(body.referralUrl).toMatch(/\/en\/employer-register\?ref=MPL-[A-F0-9]{16}$/);
  });

  it("rejects an unknown audience", async () => {
    const { POST } = await import("@/app/api/referral-links/route");
    const res = await POST(post({ audience: "admin" }), { params: Promise.resolve({}) });
    expect(res.status).toBe(400);
  });

  it("filters the list by audience, counting legacy links as employer", async () => {
    const { GET } = await import("@/app/api/referral-links/route");
    await GET(new NextRequest("http://localhost:3888/api/referral-links?audience=employer"), { params: Promise.resolve({}) });
    expect(findFilters[0].audience).toEqual({ $ne: "job_seeker" });
    await GET(new NextRequest("http://localhost:3888/api/referral-links?audience=job_seeker"), { params: Promise.resolve({}) });
    expect(findFilters[1].audience).toBe("job_seeker");
    await GET(new NextRequest("http://localhost:3888/api/referral-links?audience=bogus"), { params: Promise.resolve({}) });
    expect(findFilters[2].audience).toBeUndefined();
  });
});
