/**
 * @jest-environment node
 */
/**
 * Who sees whose profit target: an agent only their own, a super agent their
 * own team's, admin everyone's. Plus the super agent's budget rule: what they
 * give their agents never adds up to more than their own target.
 */
import { NextRequest } from "next/server";

jest.mock("@/lib/db/mongoose", () => ({ __esModule: true, default: jest.fn(), connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/auth/config", () => ({ auth: jest.fn() }));
jest.mock("@/lib/permissions/matrix", () => ({ canAccess: jest.fn().mockReturnValue(true) }));
jest.mock("@/lib/audit/log", () => ({
  actorFromCtx: jest.fn((ctx) => ({ userId: ctx.userId, role: ctx.role })),
  logActivity: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/lib/notifications/trigger", () => ({ notifyTargetAssigned: jest.fn().mockResolvedValue(undefined) }));

const findOneLean = jest.fn();
const findOne = jest.fn((..._args: unknown[]) => ({ lean: findOneLean }));
const findLean = jest.fn();
const find = jest.fn((..._args: unknown[]) => ({ lean: findLean }));
const create = jest.fn();
const findByIdAndUpdate = jest.fn();
const userCountDocuments = jest.fn();
const userFindLean = jest.fn();
const getSuperAgentTeam = jest.fn();
const allocatedProfitCents = jest.fn();
const enrichProfiles = jest.fn();
const loadTargetReport = jest.fn();

jest.mock("@/models/TargetProfile", () => ({
  __esModule: true,
  PROFIT_TARGET_FILTER: { targetType: "profit" },
  default: {
    findOne: (...a: unknown[]) => findOne(...a),
    find: (...a: unknown[]) => find(...a),
    create: (...a: unknown[]) => create(...a),
    findByIdAndUpdate: (...a: unknown[]) => findByIdAndUpdate(...a),
  },
}));
jest.mock("@/models/User", () => ({
  __esModule: true,
  default: {
    countDocuments: (...a: unknown[]) => userCountDocuments(...a),
    find: jest.fn(() => ({ select: jest.fn(() => ({ lean: userFindLean })) })),
  },
}));
jest.mock("@/models/Agent", () => ({
  __esModule: true,
  default: { find: jest.fn(() => ({ select: jest.fn(() => ({ lean: jest.fn().mockResolvedValue([]) })) })) },
}));
jest.mock("@/lib/auth/agentRestrictions", () => ({ getSuperAgentTeam: (...a: unknown[]) => getSuperAgentTeam(...a) }));
jest.mock("@/lib/targets/budget", () => ({
  ...jest.requireActual("@/lib/targets/budget"),
  allocatedProfitCents: (...a: unknown[]) => allocatedProfitCents(...a),
}));
jest.mock("@/lib/targets/profileAchievementCalculator", () => ({
  ...jest.requireActual("@/lib/targets/profileAchievementCalculator"),
  enrichProfile: jest.fn(),
  enrichProfiles: (...a: unknown[]) => enrichProfiles(...a),
}));
jest.mock("@/lib/targets/loadReport", () => ({ loadTargetReport: (...a: unknown[]) => loadTargetReport(...a) }));

const { auth } = jest.requireMock("@/lib/auth/config") as { auth: jest.Mock };

const AGENT_A = "507f1f77bcf86cd799439011";
const AGENT_B = "507f1f77bcf86cd799439012";
const OUTSIDER = "507f1f77bcf86cd799439013";
const OWN_PROFILE = { _id: "own-profile", profitTarget: 1000, currency: "AED", region: "UAE", year: 2027 };

const signIn = (role: string, id = "user_1") => auth.mockResolvedValue({ user: { id, role, locale: "en" } });
const ctx = { params: Promise.resolve({}) };

function post(path: string, body: unknown) {
  return new NextRequest(`http://localhost${path}`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  getSuperAgentTeam.mockResolvedValue({ agentUserIds: [AGENT_A, AGENT_B] });
  allocatedProfitCents.mockResolvedValue(0);
});

describe("super agent report", () => {
  async function get(query: string) {
    const { GET } = await import("@/app/api/super-agent/target-report/route");
    return GET(new NextRequest(`http://localhost/api/super-agent/target-report${query}`), ctx);
  }

  it("is for super agents only", async () => {
    signIn("agent");
    expect((await get("?year=2027")).status).toBe(403);
  });

  it("returns the own report with the team included", async () => {
    signIn("super_agent", "sa_1");
    findOneLean.mockResolvedValue({ _id: "own", assigneeRole: "super_agent" });
    loadTargetReport.mockResolvedValue({ year: 2027 });

    const body = await (await get("?year=2027")).json();

    expect(body.report).toEqual({ year: 2027 });
    expect(loadTargetReport).toHaveBeenCalledWith(expect.anything(), { includeTeam: true });
  });

  it("shows an agent from the team", async () => {
    signIn("super_agent", "sa_1");
    findOneLean.mockResolvedValue({ _id: "agent-profile", assigneeId: AGENT_A, assigneeRole: "agent" });
    loadTargetReport.mockResolvedValue({ year: 2027, person: { userId: AGENT_A } });

    const res = await get(`?year=2027&agentId=${AGENT_A}`);

    expect(res.status).toBe(200);
    expect(findOne).toHaveBeenCalledWith(expect.objectContaining({ assigneeId: AGENT_A, assigneeRole: "agent" }));
    // An agent's report never carries a team.
    expect(loadTargetReport).toHaveBeenCalledWith(expect.anything());
  });

  it("refuses an agent outside the team and never loads their report", async () => {
    signIn("super_agent", "sa_1");

    const res = await get(`?year=2027&agentId=${OUTSIDER}`);

    expect(res.status).toBe(403);
    expect(findOne).not.toHaveBeenCalled();
    expect(loadTargetReport).not.toHaveBeenCalled();
  });

  it("refuses everyone when the super agent has no team record, and rejects a malformed id", async () => {
    signIn("super_agent", "sa_1");
    getSuperAgentTeam.mockResolvedValue(null);

    expect((await get(`?year=2027&agentId=${AGENT_A}`)).status).toBe(403);
    expect((await get("?year=2027&agentId=nope")).status).toBe(400);
  });
});

describe("agent report", () => {
  async function get() {
    const { GET } = await import("@/app/api/agent/target-report/route");
    return GET(new NextRequest("http://localhost/api/agent/target-report?year=2027"), ctx);
  }

  it("is for agents only", async () => {
    signIn("super_agent");
    expect((await get()).status).toBe(403);
  });

  it("always looks the profile up by the signed-in agent", async () => {
    signIn("agent", AGENT_A);
    findOneLean.mockResolvedValue({ _id: "p", assigneeRole: "agent" });
    loadTargetReport.mockResolvedValue({ year: 2027 });

    await get();

    expect(findOne).toHaveBeenCalledWith(expect.objectContaining({ assigneeId: AGENT_A, assigneeRole: "agent", targetType: "profit" }));
  });

  it("returns no report, not someone else's, when the agent has no target", async () => {
    signIn("agent", AGENT_A);
    findOneLean.mockResolvedValue(null);

    expect((await (await get()).json()).report).toBeNull();
    expect(loadTargetReport).not.toHaveBeenCalled();
  });
});

describe("agent leaderboard", () => {
  it("ranks teammates by progress and shows no profit amounts", async () => {
    signIn("agent", AGENT_A);
    findOneLean.mockResolvedValue({ _id: "mine", parentProfileId: "parent" });
    findLean.mockResolvedValue([{ _id: "mine", assigneeId: AGENT_A }, { _id: "theirs", assigneeId: AGENT_B }]);
    userFindLean.mockResolvedValue([{ _id: AGENT_A, name: "Adam" }, { _id: AGENT_B, name: "Bea" }]);
    enrichProfiles.mockResolvedValue([
      { assigneeId: AGENT_A, profitProgress: 40, incentiveTier: "bronze", profitAchieved: 400, profitTarget: 1000 },
      { assigneeId: AGENT_B, profitProgress: 90, incentiveTier: "gold", profitAchieved: 900, profitTarget: 1000 },
    ]);

    const { GET } = await import("@/app/api/agent/target-profiles/route");
    const body = await (await GET(new NextRequest("http://localhost/api/agent/target-profiles?view=leaderboard&year=2027"), ctx)).json();

    expect(body.leaderboard.map((row: { assigneeName: string }) => row.assigneeName)).toEqual(["Bea", "Adam"]);
    expect(body.myRank).toMatchObject({ rank: 2, isMe: true });
    for (const row of body.leaderboard) {
      expect(row).not.toHaveProperty("profitAchieved");
      expect(row).not.toHaveProperty("profitTarget");
    }
  });
});

describe("super agent distribution", () => {
  function distribute(allocations: unknown[]) {
    return post("/api/super-agent/target-profiles?action=distribute", { year: 2027, allocations });
  }
  const allocation = (agentUserId: string, profitTarget: number, extra: Record<string, unknown> = {}) => ({
    agentUserId,
    profitTarget,
    distributionStrategy: "equal",
    ...extra,
  });

  async function run(request: NextRequest) {
    const { POST } = await import("@/app/api/super-agent/target-profiles/route");
    return POST(request, ctx);
  }

  beforeEach(() => {
    signIn("super_agent", "sa_1");
    findOneLean.mockResolvedValue(OWN_PROFILE);
    findLean.mockResolvedValue([]);
    // Every requested agent is an active account unless a test says otherwise.
    userCountDocuments.mockImplementation(async (filter: { _id: { $in: string[] } }) => filter._id.$in.length);
    create.mockImplementation(async (payload) => ({ _id: `new-${payload.assigneeId}`, ...payload }));
  });

  it("funds each agent in the super agent's currency, parented to their own target", async () => {
    const res = await run(distribute([allocation(AGENT_A, 400), allocation(AGENT_B, 300)]));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      assigneeId: AGENT_A, profitTarget: 400, currency: "AED", parentProfileId: "own-profile", assigneeRole: "agent",
    }));
    expect(body.remainingBudget).toBe(300);
  });

  it("lets each agent have their own kind of schedule", async () => {
    const res = await run(distribute([
      allocation(AGENT_A, 400, { periodType: "weekly", distributionStrategy: "seasonal" }),
      allocation(AGENT_B, 300, { periodType: "annual" }),
    ]));

    expect(res.status).toBe(201);
    const [weekly, annual] = create.mock.calls.map(([payload]) => payload);
    expect(weekly).toMatchObject({ assigneeId: AGENT_A, periodType: "weekly", distributionStrategy: "seasonal" });
    expect(weekly.periods).toHaveLength(53);
    expect(weekly.periods.reduce((sum: number, p: { profitTarget: number }) => sum + Math.round(p.profitTarget * 100), 0)).toBe(40000);
    expect(annual).toMatchObject({ assigneeId: AGENT_B, periodType: "annual" });
    expect(annual.periods).toHaveLength(1);
  });

  it("takes a custom schedule an agent was given in the dialog", async () => {
    const res = await run(distribute([
      allocation(AGENT_A, 400, {
        periodType: "custom",
        distributionStrategy: "custom",
        periods: [
          { label: "Launch", startDate: "2027-02-01", endDate: "2027-03-31", profitTarget: 150 },
          { startDate: "2027-10-01", endDate: "2027-11-30", profitTarget: 250 },
        ],
      }),
    ]));

    expect(res.status).toBe(201);
    expect(create.mock.calls[0][0].periods).toHaveLength(2);
  });

  it("refuses to give away more than the super agent's own target, counting what others already hold", async () => {
    allocatedProfitCents.mockResolvedValue(70000); // 700 already held by other agents

    const res = await run(distribute([allocation(AGENT_A, 400)]));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.remainingBudget).toBe(-100);
    expect(create).not.toHaveBeenCalled();
  });

  it("checks the budget in cents so decimals cannot slip over it", async () => {
    allocatedProfitCents.mockResolvedValue(99990);

    expect((await run(distribute([allocation(AGENT_A, 0.1)]))).status).toBe(201);
    expect((await run(distribute([allocation(AGENT_B, 0.11)]))).status).toBe(400);
  });

  it("refuses an agent who is not in the team, before writing anything", async () => {
    const res = await run(distribute([allocation(AGENT_A, 100), allocation(OUTSIDER, 100)]));

    expect(res.status).toBe(403);
    expect(create).not.toHaveBeenCalled();
  });

  it("will not overwrite a target another super agent set", async () => {
    findLean.mockResolvedValue([{ _id: "old", assigneeId: AGENT_A, parentProfileId: "someone-elses-profile" }]);

    const res = await run(distribute([allocation(AGENT_A, 100)]));

    expect(res.status).toBe(409);
    expect(create).not.toHaveBeenCalled();
    expect(findByIdAndUpdate).not.toHaveBeenCalled();
  });

  it("rejects bad schedules before any write, not halfway through", async () => {
    const months = Array.from({ length: 12 }, (_, i) => {
      const month = String(i + 1).padStart(2, "0");
      return { startDate: `2027-${month}-01`, endDate: `2027-${month}-${new Date(Date.UTC(2027, i + 1, 0)).getUTCDate()}`, profitTarget: 1 };
    });

    const res = await run(distribute([
      allocation(AGENT_A, 100),
      allocation(AGENT_B, 100, { periodType: "monthly", distributionStrategy: "custom", periods: months }),
    ]));

    expect(res.status).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });

  it("rejects inactive agents, a missing plan, and non-super-agents", async () => {
    userCountDocuments.mockResolvedValue(1);
    expect((await run(distribute([allocation(AGENT_A, 100), allocation(AGENT_B, 100)]))).status).toBe(400);

    findOneLean.mockResolvedValue(null);
    expect((await run(distribute([allocation(AGENT_A, 100)]))).status).toBe(404);

    signIn("agent");
    expect((await run(distribute([allocation(AGENT_A, 100)]))).status).toBe(403);
  });

  it("no longer creates a single agent target outside a distribution", async () => {
    const res = await run(post("/api/super-agent/target-profiles", { assigneeId: AGENT_A, profitTarget: 100 }));

    expect(res.status).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });
});

describe("super agent team view", () => {
  async function team() {
    const { GET } = await import("@/app/api/super-agent/target-profiles/route");
    return (await GET(new NextRequest("http://localhost/api/super-agent/target-profiles?view=team&year=2027"), ctx)).json();
  }

  it("is empty, not everybody's, when the super agent has no plan", async () => {
    signIn("super_agent", "sa_1");
    findOneLean.mockResolvedValue(null);

    const body = await team();

    expect(body.profiles).toEqual([]);
    expect(find).not.toHaveBeenCalled();
  });

  it("only lists agents funded from this plan who are in the team", async () => {
    signIn("super_agent", "sa_1");
    findOneLean.mockResolvedValue(OWN_PROFILE);
    findLean.mockResolvedValue([]);
    enrichProfiles.mockResolvedValue([]);
    userFindLean.mockResolvedValue([]);

    await team();

    expect(find).toHaveBeenCalledWith(expect.objectContaining({
      parentProfileId: "own-profile",
      assigneeId: { $in: [AGENT_A, AGENT_B] },
      targetType: "profit",
    }));
  });

  it("is refused for agents", async () => {
    signIn("agent");
    const { GET } = await import("@/app/api/super-agent/target-profiles/route");
    expect((await GET(new NextRequest("http://localhost/api/super-agent/target-profiles?view=team"), ctx)).status).toBe(403);
  });
});
