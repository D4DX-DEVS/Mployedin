/**
 * @jest-environment node
 */
/**
 * Super-agent reads must fail closed.
 *
 * Three routes shared one shape of bug: the team scope was applied inside an
 * `if` with no `else`, or inside the `else` of a caller-supplied filter. A
 * super-agent whose scope resolved to nothing therefore queried the whole
 * collection, and one who passed an agent id they did not own skipped the
 * scope entirely.
 *
 * These assert the filter that reaches the model, because that is where the
 * leak was — the handlers all returned a 200 either way.
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

const OWNED_AGENT = "agent_owned_1";
const SELF_SA = "sa_self_1";
const FOREIGN_AGENT = "agent_someone_elses";

/** Scope resolved by the canonical helper. Empty by default — the leak case. */
let scopeAgentIds: string[] = [];

jest.mock("@/lib/auth/agentRestrictions", () => ({
  getSuperAgentScope: jest.fn(async () => ({
    saProfileId: "sa_profile_1",
    teamAgentIds: scopeAgentIds,
    regionAgentIds: [],
    effectiveAgentIds: scopeAgentIds,
    assignedCityIds: [],
    assignedStateIds: [],
  })),
}));

jest.mock("@/lib/search/relatedEntitySearch", () => ({
  relatedEntitySearchOr: jest.fn(async () => []),
}));

/** Records the filter every read was given. */
const seen: { interviews: unknown[]; jobSeekers: unknown[]; applications: unknown[] } = {
  interviews: [],
  jobSeekers: [],
  applications: [],
};

function chain(result: unknown) {
  const node: Record<string, unknown> = {};
  for (const method of ["sort", "skip", "limit", "populate", "select"]) {
    node[method] = jest.fn(() => node);
  }
  node.lean = jest.fn(async () => result);
  return node;
}

jest.mock("@/models/Interview", () => ({
  __esModule: true,
  default: {
    find: jest.fn((filter: unknown) => {
      seen.interviews.push(filter);
      return chain([]);
    }),
    countDocuments: jest.fn(async (filter: unknown) => {
      seen.interviews.push(filter);
      return 0;
    }),
  },
}));

jest.mock("@/models/JobSeeker", () => ({
  __esModule: true,
  default: {
    find: jest.fn((filter: unknown) => {
      seen.jobSeekers.push(filter);
      return chain([]);
    }),
    countDocuments: jest.fn(async (filter: unknown) => {
      seen.jobSeekers.push(filter);
      return 0;
    }),
    distinct: jest.fn(async (_field: string, filter: unknown) => {
      seen.jobSeekers.push(filter);
      return [];
    }),
    /* The header figures are a fourth read of the same collection; its
       `$match` has to carry the same scope as the list. */
    aggregate: jest.fn(async (pipeline: Array<Record<string, unknown>>) => {
      seen.jobSeekers.push((pipeline[0] as { $match?: unknown })?.$match);
      return [];
    }),
  },
}));

jest.mock("@/models/Application", () => ({
  __esModule: true,
  default: {
    find: jest.fn((filter: unknown) => {
      seen.applications.push(filter);
      return chain([]);
    }),
    countDocuments: jest.fn(async (filter: unknown) => {
      seen.applications.push(filter);
      return 0;
    }),
  },
}));

jest.mock("@/models/SuperAgent", () => ({
  __esModule: true,
  default: {
    findOne: jest.fn(() => ({ select: () => ({ lean: async () => ({ _id: SELF_SA }) }) })),
  },
}));

jest.mock("@/models/Agent", () => ({
  __esModule: true,
  default: {
    find: jest.fn(() => chain([])),
  },
}));

jest.mock("@/models/Job", () => ({
  __esModule: true,
  default: { find: jest.fn(() => chain([])) },
}));

jest.mock("@/models/User", () => ({
  __esModule: true,
  default: { find: jest.fn(() => chain([])) },
}));

jest.mock("@/lib/security/sanitize", () => ({
  escapeRegex: (value: string) => value,
}));

/**
 * The mocked `withAuth` collapses each route to a one-argument handler, but the
 * exported type still carries the real two-argument signature.
 */
type MockedRoute = (req: NextRequest) => Promise<unknown>;

function request(url: string, role = "super_agent") {
  const req = new NextRequest(url);
  (req as unknown as { __ctx: unknown }).__ctx = {
    userId: "sa_user_1",
    role,
    locale: "en",
  };
  return req;
}

/** Every filter the route handed the model must constrain the collection. */
/** The `$or` branches of a scope filter, whether it stands alone or inside an `$and`. */
function scopeBranches(filter: unknown): Array<Record<string, unknown>> {
  const f = filter as { $and?: Array<{ $or?: Array<Record<string, unknown>> }>; $or?: Array<Record<string, unknown>> };
  if (Array.isArray(f.$or)) return f.$or;
  const withOr = f.$and?.find((c) => Array.isArray(c.$or));
  return withOr?.$or ?? [];
}

function isScoped(filters: unknown[]): boolean {
  return filters.length > 0 && filters.every((filter) => Object.keys(filter as object).length > 0);
}

beforeEach(() => {
  seen.interviews = [];
  seen.jobSeekers = [];
  seen.applications = [];
  scopeAgentIds = [];
});

describe("GET /api/super-agent/interviews", () => {
  it("returns nothing rather than everything when the scope is empty", async () => {
    const { GET } = (await import("@/app/api/super-agent/interviews/route")) as unknown as { GET: MockedRoute };
    await GET(request("http://t/api/super-agent/interviews"));

    expect(isScoped(seen.interviews)).toBe(true);
    for (const filter of seen.interviews) {
      expect((filter as { agentId?: { $in: string[] } }).agentId).toEqual({ $in: [] });
    }
  });

  it("constrains to the resolved team when the scope has agents", async () => {
    scopeAgentIds = [OWNED_AGENT];
    const { GET } = (await import("@/app/api/super-agent/interviews/route")) as unknown as { GET: MockedRoute };
    await GET(request("http://t/api/super-agent/interviews"));

    for (const filter of seen.interviews) {
      expect((filter as { agentId?: { $in: string[] } }).agentId).toEqual({ $in: [OWNED_AGENT] });
    }
  });
});

describe("GET /api/super-agent/job-seekers", () => {
  it("returns nothing rather than the whole seeker table when the scope is empty", async () => {
    const { GET } = (await import("@/app/api/super-agent/job-seekers/route")) as unknown as { GET: MockedRoute };
    await GET(request("http://t/api/super-agent/job-seekers"));

    expect(isScoped(seen.jobSeekers)).toBe(true);
    /* The scope is a union: assignments of team agents, seekers those agents
       referred, and seekers this super-agent referred through their own link.
       With no team, the first two branches are empty sets and the third is
       their own id — so the query still matches only what is theirs, never
       the whole table. */
    for (const filter of seen.jobSeekers) {
      const branches = scopeBranches(filter);
      expect(branches.length).toBeGreaterThan(0);
      expect(branches).toContainEqual({ _id: { $in: [] } });
      expect(branches).toContainEqual({ "referral.agentId": { $in: [] } });
      expect(branches).toContainEqual({ "referral.superAgentId": SELF_SA });
      for (const branch of branches) {
        const value = Object.values(branch)[0] as { $in?: unknown[] } | string;
        const isEmptySet = typeof value === "object" && Array.isArray(value.$in) && value.$in.length === 0;
        expect(isEmptySet || value === SELF_SA).toBe(true);
      }
    }
  });
});

describe("GET /api/super-agent/applications", () => {
  it("keeps the team scope when a caller supplies ?agent", async () => {
    scopeAgentIds = [OWNED_AGENT];
    const { GET } = (await import("@/app/api/super-agent/applications/route")) as unknown as { GET: MockedRoute };
    await GET(request(`http://t/api/super-agent/applications?agent=${FOREIGN_AGENT}`));

    // An id outside the scope must not become the filter. Either the handler
    // refuses it outright or it survives only alongside the scope clause.
    for (const filter of seen.applications) {
      expect((filter as { agentId?: string }).agentId).not.toBe(FOREIGN_AGENT);
    }
  });

  it("accepts ?agent for an agent inside the scope", async () => {
    scopeAgentIds = [OWNED_AGENT];
    const { GET } = (await import("@/app/api/super-agent/applications/route")) as unknown as { GET: MockedRoute };
    await GET(request(`http://t/api/super-agent/applications?agent=${OWNED_AGENT}`));

    expect(
      seen.applications.some((filter) => (filter as { agentId?: string }).agentId === OWNED_AGENT)
    ).toBe(true);
  });
});
