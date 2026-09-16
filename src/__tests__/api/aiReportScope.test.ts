/**
 * @jest-environment node
 */
/**
 * The AI analytics report must stop at the edge of the caller's own branch of
 * the hierarchy.
 *
 * Before this guard, /api/ai/report read the whole platform for everyone who
 * could reach it, and the super-agent and agent report pages both posted
 * `scope: "platform"`. A super-agent asking "how are we doing?" got back every
 * territory's commission totals, top employers and candidate nationalities.
 *
 * Two things are checked here, and they are separate: that a scoped role's
 * queries carry an employer filter at all, and that the `scope` field on the
 * request body cannot lift it — that field picks the prompt, never the data.
 */
import { NextRequest } from "next/server";
import mongoose from "mongoose";

const EMPLOYER_A = new mongoose.Types.ObjectId();
const AGENT_A = new mongoose.Types.ObjectId();
const SA_PROFILE = new mongoose.Types.ObjectId();

let currentCtx = { userId: "sa_001", role: "super_agent", locale: "en", permissionMode: "role_default" };

const mockRouteGenerate = jest.fn();

jest.mock("@/lib/auth/withAuth", () => ({
  withAuth:
    (handler: (req: NextRequest, ctx: typeof currentCtx) => Promise<Response>) =>
    (req: NextRequest) =>
      handler(req, currentCtx),
}));

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/subscription/featureGate", () => ({
  enforceFeatureGate: jest.fn().mockResolvedValue(null),
}));
jest.mock("@/lib/audit/log", () => ({
  logActivity: jest.fn().mockResolvedValue(undefined),
  actorFromCtx: () => ({ actorId: "sa_001", actorRole: "super_agent" }),
}));
jest.mock("@/lib/ai/router", () => ({
  routeGenerate: (...args: unknown[]) => mockRouteGenerate(...args),
}));
jest.mock("@/lib/ai/sanitize", () => ({
  sanitizeAIInput: (value: string) => value,
  redactPII: (value: string) => value,
}));
jest.mock("@/lib/security/rateLimit", () => ({
  checkRateLimitDual: jest.fn().mockResolvedValue({ allowed: true, resetAt: Date.now() + 60_000 }),
  RATE_LIMIT_CONFIGS: { ai: { windowMs: 60_000, limit: 10 } },
}));

const mockGetSuperAgentBook = jest.fn();
jest.mock("@/lib/auth/agentRestrictions", () => ({
  getSuperAgentBook: (...args: unknown[]) => mockGetSuperAgentBook(...args),
}));

/** The filter a territory-scoped caller must be held to. */
const TERRITORY_MATCH = {
  $or: [{ agentId: { $in: [AGENT_A] } }, { employerId: { $in: [EMPLOYER_A] } }],
};

function selectLean<T>(value: T) {
  return { select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(value) }) };
}

const mockUserCount = jest.fn().mockResolvedValue(0);
jest.mock("@/models/User", () => ({
  __esModule: true,
  default: {
    countDocuments: (...a: unknown[]) => mockUserCount(...a),
    find: () => selectLean([]),
  },
}));

const mockJobCount = jest.fn().mockResolvedValue(0);
const mockJobAggregate = jest.fn().mockResolvedValue([]);
jest.mock("@/models/Job", () => ({
  __esModule: true,
  default: {
    countDocuments: (...a: unknown[]) => mockJobCount(...a),
    aggregate: (...a: unknown[]) => mockJobAggregate(...a),
  },
}));

const mockAppCount = jest.fn().mockResolvedValue(0);
const mockAppAggregate = jest.fn().mockResolvedValue([]);
const mockAppDistinct = jest.fn().mockResolvedValue([]);
jest.mock("@/models/Application", () => ({
  Application: {
    countDocuments: (...a: unknown[]) => mockAppCount(...a),
    aggregate: (...a: unknown[]) => mockAppAggregate(...a),
    distinct: (...a: unknown[]) => mockAppDistinct(...a),
  },
}));

jest.mock("@/models/Agent", () => ({
  __esModule: true,
  // The route no longer sorts/limits in Mongo: top agents are ranked in JS
  // over live counts, because the old `.sort({"performance.placementsCompleted"})`
  // ordered the table by a denormalized subdoc that had drifted from reality.
  Agent: {
    find: () => ({
      select: () => ({ lean: jest.fn().mockResolvedValue([]) }),
    }),
  },
  default: { findOne: () => selectLean(null) },
}));

const mockEmployerFind = jest.fn();
const mockEmployerCount = jest.fn().mockResolvedValue(0);
jest.mock("@/models/Employer", () => ({
  Employer: {
    find: (...a: unknown[]) => mockEmployerFind(...a),
    countDocuments: (...a: unknown[]) => mockEmployerCount(...a),
  },
}));

jest.mock("@/models/Placement", () => ({
  Placement: { countDocuments: jest.fn().mockResolvedValue(0) },
}));

const mockCommissionAggregate = jest.fn().mockResolvedValue([]);
jest.mock("@/models/Commission", () => ({
  Commission: { aggregate: (...a: unknown[]) => mockCommissionAggregate(...a) },
}));

jest.mock("@/models/JobSeeker", () => ({
  __esModule: true,
  default: { aggregate: jest.fn().mockResolvedValue([]) },
}));

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost:3000/api/ai/report", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

async function post(body: Record<string, unknown>) {
  const { POST } = await import("@/app/api/ai/report/route");
  return POST(makeRequest(body), { params: Promise.resolve({}) });
}

/** The prompt the route handed to the model. */
function generatedPrompt(): string {
  return String(mockRouteGenerate.mock.calls[0]?.[0] ?? "");
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRouteGenerate.mockResolvedValue("# Analytics Report\n\n## Direct Answer\n- ok");
  mockEmployerFind.mockReturnValue(selectLean([{ _id: EMPLOYER_A, companyName: "Acme", industry: "Tech" }]));
  mockGetSuperAgentBook.mockResolvedValue({
    saProfileId: SA_PROFILE,
    agentIds: [AGENT_A],
    employerIds: [EMPLOYER_A],
    ownershipMatch: TERRITORY_MATCH,
  });
});

describe("POST /api/ai/report — data boundary", () => {
  it("filters a super-agent's figures to the employers under their agents", async () => {
    currentCtx = { userId: "sa_001", role: "super_agent", locale: "en", permissionMode: "role_default" };

    const res = await post({ query: "How are we doing?" });
    expect(res.status).toBe(200);

    // Every job figure in the report is ownership-filtered, not platform-wide.
    expect(mockJobCount).toHaveBeenCalled();
    for (const [filter] of mockJobCount.mock.calls) {
      expect(filter).toMatchObject(TERRITORY_MATCH);
    }
    for (const [filter] of mockAppCount.mock.calls) {
      expect(filter).toMatchObject(TERRITORY_MATCH);
    }

    // Commission totals follow the agents, plus the SA's own override lines —
    // `superAgentId` on someone else's commission marks the overseer, not the earner.
    expect(mockCommissionAggregate.mock.calls[0][0][0]).toEqual({
      $match: {
        $or: [
          { agentId: { $in: [AGENT_A] } },
          { superAgentId: SA_PROFILE, type: "override" },
        ],
      },
    });

    // And platform role counts never run.
    expect(mockUserCount).not.toHaveBeenCalled();

    const prompt = generatedPrompt();
    expect(prompt).toContain("COVERAGE: YOUR TERRITORY ONLY");
    expect(prompt).not.toContain("Total users:");
  });

  it("ignores a scope of \"platform\" sent by the client", async () => {
    currentCtx = { userId: "sa_001", role: "super_agent", locale: "en", permissionMode: "role_default" };

    // This is the body the super-agent reports page actually posts.
    await post({ query: "Revenue this quarter", scope: "platform" });

    expect(mockUserCount).not.toHaveBeenCalled();
    expect(generatedPrompt()).toContain("COVERAGE: YOUR TERRITORY ONLY");
    for (const [filter] of mockJobCount.mock.calls) {
      expect(filter).toMatchObject(TERRITORY_MATCH);
    }
  });

  it("still gives an admin the whole platform", async () => {
    currentCtx = { userId: "admin_001", role: "admin", locale: "en", permissionMode: "role_default" };

    await post({ query: "Platform summary", scope: "platform" });

    expect(mockUserCount).toHaveBeenCalled();
    for (const [filter] of mockJobCount.mock.calls) {
      expect(filter).not.toHaveProperty("employerId");
      expect(filter).not.toHaveProperty("$or");
    }
    expect(generatedPrompt()).toContain("COVERAGE: THE ENTIRE PLATFORM");
  });

  it("shows a super-agent with no agents nothing rather than everything", async () => {
    currentCtx = { userId: "sa_002", role: "super_agent", locale: "en", permissionMode: "role_default" };
    mockGetSuperAgentBook.mockResolvedValue({
      saProfileId: SA_PROFILE,
      agentIds: [],
      employerIds: [],
      ownershipMatch: { employerId: { $in: [] } },
    });

    await post({ query: "How are we doing?" });

    expect(mockUserCount).not.toHaveBeenCalled();
    for (const [filter] of mockJobCount.mock.calls) {
      expect(filter).toMatchObject({ employerId: { $in: [] } });
    }
  });
});
