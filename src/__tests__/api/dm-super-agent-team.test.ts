/**
 * @jest-environment node
 *
 * Owner decision 2026-10-13: a super agent finds and starts chats only with
 * agents in their own team (getSuperAgentTeamAgentUserIds); admins and employers as
 * before. Enforced in GET /api/users/search and POST /api/dm; a conversation
 * that already exists still opens.
 */
import { NextRequest } from "next/server";

const SA_USER = "651000000000000000000a01";
const TEAM_AGENT = "651000000000000000000b11";
const OTHER_AGENT = "651000000000000000000b12";
const EMP_USER = "651000000000000000000f01";

let mockCtx = { userId: SA_USER, role: "super_agent", locale: "en" };
let existingConversation: unknown = null;
const users: Record<string, { _id: string; role: string; name: string }> = {
  [SA_USER]: { _id: SA_USER, role: "super_agent", name: "Sana" },
  [TEAM_AGENT]: { _id: TEAM_AGENT, role: "agent", name: "Team Agent" },
  [OTHER_AGENT]: { _id: OTHER_AGENT, role: "agent", name: "Other Agent" },
  [EMP_USER]: { _id: EMP_USER, role: "employer", name: "Acme" },
};

const mockTeam = jest.fn();
const mockAggregate = jest.fn();
const mockCreate = jest.fn();

jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: (req: NextRequest, ctx: unknown) => Promise<Response>) =>
    (req: NextRequest) => handler(req, mockCtx),
}));
jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/security/rateLimit", () => ({ checkRateLimitDual: jest.fn().mockResolvedValue({ allowed: true }) }));
jest.mock("@/lib/realtime", () => ({ triggerRealtimeEvent: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/audit/log", () => ({ actorFromCtx: jest.fn(() => ({})), logActivity: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/logger", () => ({ __esModule: true, default: { error: jest.fn(), warn: jest.fn(), info: jest.fn() } }));
jest.mock("@/lib/auth/agentRestrictions", () => ({
  getSuperAgentTeamAgentUserIds: (...a: unknown[]) => mockTeam(...a),
}));

const chain = (value: unknown) => {
  const c: Record<string, unknown> = {};
  c.select = () => c;
  c.lean = async () => value;
  return c;
};
jest.mock("@/models/User", () => ({
  __esModule: true,
  default: {
    findById: jest.fn((id: string) => chain(users[id] ?? null)),
    aggregate: (...a: unknown[]) => mockAggregate(...a),
  },
}));
jest.mock("@/models/Conversation", () => ({
  __esModule: true,
  default: {
    findOne: jest.fn(() => ({ lean: async () => existingConversation })),
    create: (...a: unknown[]) => mockCreate(...a),
    countDocuments: jest.fn().mockResolvedValue(0),
  },
}));
jest.mock("@/models/JobSeeker", () => ({ __esModule: true, default: { findOne: jest.fn(() => chain(null)) } }));
jest.mock("@/models/Employer", () => {
  const model = { findOne: jest.fn(() => chain(null)) };
  return { __esModule: true, Employer: model, default: model };
});

async function startChat(recipientId: string) {
  const { POST } = await import("@/app/api/dm/route");
  return POST(new NextRequest("http://localhost/api/dm", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ recipientId }),
  }), {} as never);
}

async function search(q: string) {
  const { GET } = await import("@/app/api/users/search/route");
  return GET(new NextRequest(`http://localhost/api/users/search?q=${q}`), {} as never);
}

beforeEach(() => {
  jest.clearAllMocks();
  mockCtx = { userId: SA_USER, role: "super_agent", locale: "en" };
  existingConversation = null;
  mockCreate.mockImplementation(async (doc: object) => ({ _id: "conv1", ...doc }));
  mockAggregate.mockResolvedValue([]);
  mockTeam.mockResolvedValue([TEAM_AGENT]);
});

describe("POST /api/dm as a super agent", () => {
  it("refuses an agent outside their team", async () => {
    const res = await startChat(OTHER_AGENT);
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "not_in_team" });
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockTeam).toHaveBeenCalledWith(SA_USER);
  });

  it("opens a chat with a team agent", async () => {
    const res = await startChat(TEAM_AGENT);
    expect(res.status).toBe(200);
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it("still reaches employers without a team check", async () => {
    const res = await startChat(EMP_USER);
    expect(res.status).toBe(200);
    expect(mockTeam).not.toHaveBeenCalled();
  });

  it("still opens a chat that already exists", async () => {
    existingConversation = { _id: "conv0", participants: [SA_USER, OTHER_AGENT] };
    const res = await startChat(OTHER_AGENT);
    expect(res.status).toBe(200);
  });

  it("does not limit an agent writing to their super agent", async () => {
    mockCtx = { userId: OTHER_AGENT, role: "agent", locale: "en" };
    const res = await startChat(SA_USER);
    expect(res.status).toBe(200);
    expect(mockTeam).not.toHaveBeenCalled();
  });
});

describe("GET /api/users/search as a super agent", () => {
  it("matches admins, employers and only their team's agents", async () => {
    await search("agent");
    expect(mockAggregate).toHaveBeenCalledTimes(2);
    for (const [pipeline] of mockAggregate.mock.calls) {
      const match = pipeline[0].$match;
      expect(match.role).toBeUndefined();
      expect(match.$or).toEqual([{ role: { $in: ["admin", "employer"] } }, { role: "agent", _id: { $in: [TEAM_AGENT] } }]);
    }
  });

  it("an empty team finds no agents at all", async () => {
    mockTeam.mockResolvedValue([]);
    await search("agent");
    expect(mockAggregate.mock.calls[0][0][0].$match.$or[1]).toEqual({ role: "agent", _id: { $in: [] } });
  });
});
