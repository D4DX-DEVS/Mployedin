/**
 * @jest-environment node
 *
 * QA EMP-001 (2026-10-06): an employer could find and message any user on the
 * platform. Owner decision: only its applicants, its agent and support
 * (admins). Enforced server-side in both GET /api/users/search and
 * POST /api/dm; a conversation the other side already started still opens.
 */
import { NextRequest } from "next/server";

const EMP_USER = "651000000000000000000f01";
const SEEKER_USER = "651000000000000000000d11";
const CONTACT = "651000000000000000000d12";

let mockCtx = { userId: EMP_USER, role: "employer", locale: "en" };
let existingConversation: unknown = null;
const users: Record<string, { _id: string; role: string; name: string }> = {
  [EMP_USER]: { _id: EMP_USER, role: "employer", name: "Acme" },
  [SEEKER_USER]: { _id: SEEKER_USER, role: "job_seeker", name: "Asha" },
};

const mockCanStart = jest.fn();
const mockContactIds = jest.fn();
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
jest.mock("@/lib/dm/employerContacts", () => ({
  canEmployerStartConversation: (...a: unknown[]) => mockCanStart(...a),
  getEmployerContactUserIds: (...a: unknown[]) => mockContactIds(...a),
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
  mockCtx = { userId: EMP_USER, role: "employer", locale: "en" };
  existingConversation = null;
  mockCreate.mockImplementation(async (doc: object) => ({ _id: "conv1", ...doc }));
  mockAggregate.mockResolvedValue([]);
  mockContactIds.mockResolvedValue([CONTACT]);
});

describe("POST /api/dm as an employer", () => {
  it("refuses a user the employer has no connection to", async () => {
    mockCanStart.mockResolvedValue(false);
    const res = await startChat(SEEKER_USER);
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ code: "not_connected" });
    expect(mockCreate).not.toHaveBeenCalled();
    expect(mockCanStart).toHaveBeenCalledWith(EMP_USER, expect.objectContaining({ _id: SEEKER_USER, role: "job_seeker" }));
  });

  it("opens a conversation with an applicant", async () => {
    mockCanStart.mockResolvedValue(true);
    const res = await startChat(SEEKER_USER);
    expect(res.status).toBe(200);
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it("still opens a conversation the other side already started", async () => {
    existingConversation = { _id: "conv0", participants: [EMP_USER, SEEKER_USER] };
    const res = await startChat(SEEKER_USER);
    expect(res.status).toBe(200);
    expect(mockCanStart).not.toHaveBeenCalled();
  });

  it("does not apply the employer rule to other roles", async () => {
    mockCtx = { userId: SEEKER_USER, role: "job_seeker", locale: "en" };
    const res = await startChat(EMP_USER);
    expect(res.status).toBe(200);
    expect(mockCanStart).not.toHaveBeenCalled();
  });
});

describe("GET /api/users/search as an employer", () => {
  it("only matches the employer's contacts and admins", async () => {
    await search("asha");
    expect(mockContactIds).toHaveBeenCalledWith(EMP_USER);
    for (const [pipeline] of mockAggregate.mock.calls) {
      const match = pipeline[0].$match;
      expect(match.role).toBeUndefined();
      expect(match.$or).toEqual([{ role: "admin" }, { _id: { $in: [CONTACT] }, role: { $in: ["job_seeker", "agent"] } }]);
    }
    expect(mockAggregate).toHaveBeenCalledTimes(2);
  });

  it("keeps the role filter for other roles", async () => {
    mockCtx = { userId: SEEKER_USER, role: "job_seeker", locale: "en" };
    await search("acme");
    expect(mockContactIds).not.toHaveBeenCalled();
    expect(mockAggregate.mock.calls[0][0][0].$match.role).toEqual({ $in: ["employer", "job_seeker"] });
  });
});
