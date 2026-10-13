/**
 * @jest-environment node
 *
 * /api/super-agent/messages — a super agent messaging their agents
 * (owner request 2026-10-13): one message to the whole team or to chosen
 * agents, each delivered into that agent's private chat plus a notification.
 * Only agents in the super agent's team can be reached.
 */
import { NextRequest } from "next/server";

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/security/rateLimit", () => ({
  checkRateLimitDual: jest.fn().mockResolvedValue({ allowed: true }),
}));
jest.mock("@/lib/audit/log", () => ({ logActivity: jest.fn(), actorFromCtx: jest.fn(() => ({})) }));
jest.mock("@/lib/logger", () => ({ __esModule: true, default: { error: jest.fn() } }));

const notify = jest.fn().mockResolvedValue(undefined);
jest.mock("@/lib/notifications/trigger", () => ({ notify: (...a: unknown[]) => notify(...a) }));

const TEAM_A = "aaaaaaaaaaaaaaaaaaaaaaa1";
const TEAM_B = "aaaaaaaaaaaaaaaaaaaaaaa2";
const OUTSIDER = "bbbbbbbbbbbbbbbbbbbbbbb9";
const SA = "cccccccccccccccccccccccc";

const listAssignableAgents = jest.fn();
jest.mock("@/lib/agentTasks/assigned", () => ({
  listAssignableAgents: (...a: unknown[]) => listAssignableAgents(...a),
}));

const ensurePairConversation = jest.fn();
const postPairMessage = jest.fn();
jest.mock("@/lib/dm/teamMessage", () => ({
  ensurePairConversation: (...a: unknown[]) => ensurePairConversation(...a),
  postPairMessage: (...a: unknown[]) => postPairMessage(...a),
}));

const userFind = jest.fn();
jest.mock("@/models/User", () => ({
  __esModule: true,
  default: {
    findById: () => ({ select: () => ({ lean: () => Promise.resolve({ _id: SA, name: "Sana SA", role: "super_agent" }) }) }),
    find: (q: { _id: { $in: string[] } }) => {
      userFind(q);
      return { select: () => ({ lean: () => Promise.resolve(q._id.$in.map((id) => ({ _id: id, name: `Agent ${id.slice(-1)}`, role: "agent" }))) }) };
    },
  },
}));

jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: (req: NextRequest, ctx: unknown) => unknown) =>
    // Like the real wrapper: validateBody throws its 400 response.
    async (req: NextRequest) => {
      try {
        return await handler(req, JSON.parse(req.headers.get("x-ctx") ?? "{}"));
      } catch (err) {
        if (err instanceof Response) return err;
        throw err;
      }
    },
}));

import { GET, POST } from "@/app/api/super-agent/messages/route";

const call = (method: "GET" | "POST", body?: unknown, role = "super_agent") =>
  (method === "GET" ? GET : POST)(
    new NextRequest("http://localhost/api/super-agent/messages", {
      method,
      headers: { "content-type": "application/json", "x-ctx": JSON.stringify({ userId: SA, role }) },
      ...(body !== undefined && { body: JSON.stringify(body) }),
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    {} as any,
  ) as Promise<Response>;

beforeEach(() => {
  jest.clearAllMocks();
  listAssignableAgents.mockResolvedValue([
    { userId: TEAM_A, name: "Agent 1", email: "a1@x.test" },
    { userId: TEAM_B, name: "Agent 2", email: "a2@x.test" },
  ]);
  ensurePairConversation.mockImplementation(async (_s: unknown, agent: { _id: string }) => ({ conversation: { _id: `conv-${agent._id}`, participants: [] }, created: true }));
  postPairMessage.mockResolvedValue("msg");
});

it("lists only the super agent's team", async () => {
  const res = await call("GET");
  expect(res.status).toBe(200);
  expect((await res.json()).agents.map((a: { userId: string }) => a.userId)).toEqual([TEAM_A, TEAM_B]);
});

it("refuses anyone who is not a super agent", async () => {
  expect((await call("GET", undefined, "agent")).status).toBe(403);
  expect((await call("POST", { content: "hi", recipients: "all" }, "admin")).status).toBe(403);
  expect(postPairMessage).not.toHaveBeenCalled();
});

it("'all' sends the same text into every team agent's chat and notifies each", async () => {
  const res = await call("POST", { content: "  Team call at 5pm  ", recipients: "all" });
  expect(res.status).toBe(201);
  expect(await res.json()).toEqual({ sent: 2, failed: 0 });
  expect(postPairMessage).toHaveBeenCalledTimes(2);
  for (const [, , content] of postPairMessage.mock.calls) expect(content).toBe("Team call at 5pm");
  expect(notify.mock.calls.map(([p]) => p.userId).sort()).toEqual([TEAM_A, TEAM_B]);
  expect(notify.mock.calls[0][0]).toMatchObject({ type: "message", link: "/agent/messages", titleKey: "teamMessageTitle", sendEmail: true, sendPush: true, actorId: SA });
});

it("chosen agents: an agent outside the team is skipped, never messaged", async () => {
  const res = await call("POST", { content: "Check your leads", recipients: [TEAM_B, OUTSIDER] });
  expect(await res.json()).toEqual({ sent: 1, failed: 0 });
  expect(userFind.mock.calls[0][0]._id.$in).toEqual([TEAM_B]);
  expect(notify).toHaveBeenCalledTimes(1);
  expect(notify.mock.calls[0][0].userId).toBe(TEAM_B);
});

it("rejects a list with nobody from the team", async () => {
  const res = await call("POST", { content: "hello", recipients: [OUTSIDER] });
  expect(res.status).toBe(400);
  expect(postPairMessage).not.toHaveBeenCalled();
});

it("rejects an empty message", async () => {
  await expect(call("POST", { content: "   ", recipients: "all" }).then((r) => r.status)).resolves.toBe(400);
});

it("reports agents whose delivery failed instead of failing the whole send", async () => {
  postPairMessage.mockImplementation(async (conv: { _id: string }) => {
    if (conv._id === `conv-${TEAM_A}`) throw new Error("db down");
    return "msg";
  });
  const res = await call("POST", { content: "hi", recipients: "all" });
  expect(await res.json()).toEqual({ sent: 1, failed: 1 });
});
