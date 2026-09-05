/**
 * @jest-environment node
 */
/**
 * ⌘K entity search must not become a new scope fall-through.
 *
 * `getScopedEmployerIds` returns `null` for admin ("no employer filter") and an
 * explicit list for everyone else, where an empty list means "see nothing". A
 * handler that treats an empty list the same as `null` hands one employer's
 * pipeline to another; these tests pin that boundary plus the job-seeker refusal.
 */
import { NextRequest } from "next/server";

jest.mock("@/lib/db/mongoose", () => ({
  connectDB: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: Function) => {
    return async (req: NextRequest) => handler(req, (req as unknown as { __ctx: unknown }).__ctx);
  },
}));

const rateLimitResult = { allowed: true, remaining: 10, resetAt: Date.now() + 60_000 };
jest.mock("@/lib/security/rateLimit", () => ({
  checkRateLimitDual: jest.fn(() => Promise.resolve(rateLimitResult)),
}));

const scopedEmployerIds = jest.fn();
jest.mock("@/lib/auth/agentRestrictions", () => ({
  getScopedEmployerIds: (...args: unknown[]) => scopedEmployerIds(...args),
}));

let jobQuery: Record<string, unknown> | null = null;
let applicationQuery: Record<string, unknown> | null = null;

jest.mock("@/models/Job", () => ({
  Job: {
    find: jest.fn((query: Record<string, unknown>) => {
      jobQuery = query;
      return {
        select: () => ({
          sort: () => ({
            limit: () => ({
              lean: async () => [{ _id: "job1", title: "Senior Nurse", status: "active" }],
            }),
          }),
        }),
      };
    }),
  },
}));

// Seekers are now resolved by name BEFORE the application query, so the mock
// answers both shapes: findOne for the job-seeker branch, find for the name
// lookup that replaced the old scan-and-filter-in-JS approach.
let seekerRows: Record<string, unknown>[] = [];
let seekerQueries: Record<string, unknown>[] = [];
jest.mock("@/models/JobSeeker", () => ({
  __esModule: true,
  default: {
    findOne: jest.fn(() => ({ select: () => ({ lean: async () => ({ _id: "seeker1" }) }) })),
    find: jest.fn((query: Record<string, unknown>) => {
      seekerQueries.push(query);
      return {
        select: () => ({ limit: () => ({ lean: async () => seekerRows }) }),
      };
    }),
  },
}));

let userRows: Record<string, unknown>[] = [];
jest.mock("@/models/User", () => ({
  __esModule: true,
  default: {
    find: jest.fn(() => ({
      select: () => ({ limit: () => ({ lean: async () => userRows }) }),
    })),
  },
}));

let employerRows: Record<string, unknown>[] = [];
jest.mock("@/models/Employer", () => ({
  __esModule: true,
  default: {
    find: jest.fn(() => ({
      select: () => ({ limit: () => ({ lean: async () => employerRows }) }),
    })),
  },
}));

let applicationRows: Record<string, unknown>[] = [];

// The route chains a different number of populate() calls per role, so the
// mock is a generic chainable that only resolves at lean().
jest.mock("@/models/Application", () => ({
  Application: {
    find: jest.fn((query: Record<string, unknown>) => {
      applicationQuery = query;
      const chain: Record<string, unknown> = {};
      for (const method of ["select", "populate", "sort", "limit"]) {
        chain[method] = () => chain;
      }
      chain.lean = async () => applicationRows;
      return chain;
    }),
  },
}));

import { GET } from "@/app/api/workspace-search/route";

function request(role: string, q: string) {
  const req = new NextRequest(`http://localhost/api/workspace-search?q=${encodeURIComponent(q)}`);
  (req as unknown as { __ctx: unknown }).__ctx = { userId: "user1", role };
  return req;
}

async function call(role: string, q: string) {
  const res = await (GET as unknown as (r: NextRequest) => Promise<Response>)(request(role, q));
  return { status: res.status, body: await res.json() };
}

beforeEach(() => {
  jobQuery = null;
  applicationQuery = null;
  scopedEmployerIds.mockReset();
  seekerQueries = [];
  // One seeker matches the name query; the route turns that into an indexed
  // `jobSeekerId: { $in: [...] }` application read.
  seekerRows = [{ _id: "507f1f77bcf86cd799439011" }];
  userRows = [];
  employerRows = [];
  applicationRows = [
    {
      _id: "app1",
      status: "applied",
      jobId: { title: "Senior Nurse" },
      jobSeekerId: { fullName: "Fatima Noor", userId: { name: "Fatima Noor" } },
    },
    {
      _id: "app2",
      status: "applied",
      jobId: { title: "Senior Nurse" },
      jobSeekerId: { fullName: "Rahul Menon", userId: { name: "Rahul Menon" } },
    },
  ];
});

describe("GET /api/workspace-search", () => {
  it("never routes a job seeker through the employer-scoped branch", async () => {
    // A seeker searches open jobs and their own applications (added alongside
    // this route). What must never happen is the employer path running for
    // them: no employer scope lookup, and no read filtered by employerId.
    await call("job_seeker", "nurse");
    expect(scopedEmployerIds).not.toHaveBeenCalled();
    expect(applicationQuery).not.toHaveProperty("employerId");
    expect(applicationQuery).toMatchObject({ jobSeekerId: "seeker1" });
  });

  it("returns nothing for a one-character query", async () => {
    const { body } = await call("employer", "n");
    expect(body).toEqual({ jobs: [], candidates: [], people: [] });
    expect(scopedEmployerIds).not.toHaveBeenCalled();
  });

  it("filters by the caller's employer ids", async () => {
    scopedEmployerIds.mockResolvedValue(["emp1"]);
    const { body } = await call("employer", "nurse");
    expect(jobQuery).toMatchObject({ employerId: { $in: ["emp1"] } });
    expect(applicationQuery).toMatchObject({ employerId: { $in: ["emp1"] } });
    expect(body.jobs).toHaveLength(1);
  });

  it("treats an empty scope as see-nothing, never as unfiltered", async () => {
    scopedEmployerIds.mockResolvedValue([]);
    const { body } = await call("agent", "nurse");
    expect(body).toEqual({ jobs: [], candidates: [], people: [] });
    expect(jobQuery).toBeNull();
    expect(applicationQuery).toBeNull();
  });

  it("applies no employer filter for admin", async () => {
    scopedEmployerIds.mockResolvedValue(null);
    await call("admin", "nurse");
    expect(jobQuery).toEqual({ title: expect.any(RegExp) });
    // The candidate read is now keyed by the seekers whose name matched; what
    // must never appear for admin is an employer filter.
    expect(applicationQuery).not.toHaveProperty("employerId");
    expect(applicationQuery).toMatchObject({ jobSeekerId: { $in: expect.any(Array) } });
  });

  it("matches candidates by querying the seekers, not by scanning recent applications", async () => {
    // The old implementation pulled the 400 most recent applications and
    // filtered names in JavaScript, so anyone who applied before that window
    // was silently unfindable — worst for admin, whose window is the whole
    // platform. The name match must reach the database.
    scopedEmployerIds.mockResolvedValue(["emp1"]);
    applicationRows = [
      {
        _id: "app2",
        status: "applied",
        jobId: { title: "Senior Nurse" },
        jobSeekerId: { fullName: "Rahul Menon", userId: { name: "Rahul Menon" } },
      },
    ];
    const { body } = await call("employer", "rahul");

    expect(seekerQueries.some((query) => "fullName" in query)).toBe(true);
    expect(applicationQuery).toMatchObject({
      employerId: { $in: ["emp1"] },
      jobSeekerId: { $in: expect.any(Array) },
    });
    expect(body.candidates.map((c: { name: string }) => c.name)).toEqual(["Rahul Menon"]);
  });

  it("returns no candidates when no seeker matches the name", async () => {
    scopedEmployerIds.mockResolvedValue(["emp1"]);
    seekerRows = [];
    const { body } = await call("employer", "nobody");
    expect(body.candidates).toEqual([]);
    // No seeker ids means the application read is skipped entirely.
    expect(applicationQuery).toBeNull();
  });

  it("returns people only for admin", async () => {
    employerRows = [{ _id: "emp9", companyName: "Gulf Medical", industry: "Healthcare" }];
    userRows = [{ _id: "usr9", name: "Sara Admin", email: "sara@x.com", role: "agent" }];

    scopedEmployerIds.mockResolvedValue(null);
    const asAdmin = await call("admin", "gulf");
    expect(asAdmin.body.people).toEqual([
      expect.objectContaining({ name: "Gulf Medical", href: expect.stringContaining("/admin/employers") }),
      expect.objectContaining({ name: "Sara Admin", href: expect.stringContaining("/admin/agents") }),
    ]);

    scopedEmployerIds.mockResolvedValue(["emp1"]);
    const asEmployer = await call("employer", "gulf");
    expect(asEmployer.body.people).toEqual([]);
  });

  it("escapes regex metacharacters in the query", async () => {
    scopedEmployerIds.mockResolvedValue(["emp1"]);
    await call("employer", "a.*b");
    const titleRx = (jobQuery as { title: RegExp }).title;
    expect(titleRx.source).toBe("a\\.\\*b");
  });

  it("rejects a caller over the rate limit", async () => {
    const { checkRateLimitDual } = jest.requireMock("@/lib/security/rateLimit");
    checkRateLimitDual.mockResolvedValueOnce({ allowed: false, remaining: 0, resetAt: Date.now() });
    const { status } = await call("employer", "nurse");
    expect(status).toBe(429);
  });
});
