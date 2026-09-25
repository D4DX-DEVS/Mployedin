/**
 * @jest-environment node
 */
/**
 * POST / PATCH /api/admin/super-agents — "Assign Agents"
 *
 * An agent belongs to one super agent. The Add/Edit Super Agent form used to
 * list every agent, and saving silently took an agent away from the super
 * agent that had it (on create it also left the agent in that super agent's
 * agentIds). The form may only claim unassigned agents or keep its own;
 * moving an agent between super agents happens in Admin → Agents → Edit.
 * A pointer at a super agent that no longer exists is not ownership.
 */
import { NextRequest } from "next/server";

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: Function) => async (req: NextRequest) =>
    handler(req, { userId: "admin_1", role: "admin", locale: "en" }),
}));
jest.mock("@/lib/validators", () => ({
  ...jest.requireActual("@/lib/validators"),
  validateBody: jest.fn(async (req: NextRequest) => req.json()),
}));
jest.mock("@/lib/audit/log", () => ({ logActivity: jest.fn(), actorFromCtx: jest.fn(() => ({})) }));
jest.mock("@/lib/targets/profileAchievementCalculator", () => ({ enrichProfiles: jest.fn() }));
jest.mock("@/lib/logger", () => ({ __esModule: true, default: { error: jest.fn(), warn: jest.fn(), info: jest.fn() } }));
jest.mock("bcryptjs", () => ({ __esModule: true, default: { hash: jest.fn(async () => "hash") } }));
jest.mock("@/models/TargetProfile", () => ({ __esModule: true, default: {} }));
jest.mock("@/models/City", () => ({ __esModule: true, default: {} }));
jest.mock("@/models/State", () => ({ __esModule: true, default: {} }));

/** agent_free: nobody's · agent_mine: sa_self's · agent_theirs: sa_other's · agent_orphan: a deleted SA's */
const AGENTS = [
  { _id: "agent_free", superAgentId: undefined },
  { _id: "agent_mine", superAgentId: "sa_self" },
  { _id: "agent_theirs", superAgentId: "sa_other" },
  { _id: "agent_orphan", superAgentId: "sa_deleted" },
];
const LIVE_SAS = ["sa_self", "sa_other"];

function lean<T>(value: T) {
  const node: Record<string, unknown> = {};
  node.select = jest.fn(() => node);
  node.lean = jest.fn(async () => value);
  return node;
}

const agentUpdateMany = jest.fn(async () => ({}));
const saUpdateMany = jest.fn(async () => ({}));

jest.mock("@/models/Agent", () => ({
  __esModule: true,
  default: {
    find: jest.fn((filter: { _id: { $in: string[] }; superAgentId: { $nin: (string | null)[] } }) =>
      lean(
        AGENTS.filter(
          (a) => filter._id.$in.includes(a._id) && !filter.superAgentId.$nin.includes(a.superAgentId ?? null)
        )
      )
    ),
    updateMany: (...args: unknown[]) => agentUpdateMany(...(args as [])),
  },
}));

jest.mock("@/models/SuperAgent", () => ({
  __esModule: true,
  default: {
    find: jest.fn((filter: { _id: { $in: string[] } }) =>
      lean(filter._id.$in.filter((id) => LIVE_SAS.includes(id)).map((id) => ({ _id: id })))
    ),
    findOne: jest.fn(() => lean({ _id: "sa_self" })),
    findOneAndUpdate: jest.fn(async () => ({ _id: "sa_self" })),
    create: jest.fn(async () => ({ _id: "sa_new" })),
    updateMany: (...args: unknown[]) => saUpdateMany(...(args as [])),
  },
}));

jest.mock("@/models/User", () => ({
  __esModule: true,
  default: {
    findOne: jest.fn(async () => null),
    create: jest.fn(async () => ({ _id: "user_new" })),
    findByIdAndUpdate: jest.fn(async () => ({})),
    findByIdAndDelete: jest.fn(async () => ({})),
    find: jest.fn(() => lean([])),
  },
}));

import { POST, PATCH } from "@/app/api/admin/super-agents/route";

function req(method: "POST" | "PATCH", body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/admin/super-agents", {
    method,
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}

const create = (agentIds: string[]) =>
  POST(req("POST", { name: "New SA", email: "new@sa.test", password: "Str0ng!Passw0rd", agentIds }) as never, {
    params: Promise.resolve({}),
  } as never);
const update = (agentIds: string[]) =>
  PATCH(req("PATCH", { userId: "user_self", agentIds }) as never, { params: Promise.resolve({}) } as never);

beforeEach(() => {
  agentUpdateMany.mockClear();
  saUpdateMany.mockClear();
});

describe("admin super-agents: assigning agents", () => {
  it("rejects creating a super agent with an agent another super agent owns", async () => {
    const res = await create(["agent_free", "agent_theirs"]);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.details).toEqual([expect.objectContaining({ path: "agentIds" })]);
    expect(body.takenAgentIds).toEqual(["agent_theirs"]);
    expect(agentUpdateMany).not.toHaveBeenCalled();
  });

  it("creates with unassigned agents and clears any stale team entry elsewhere", async () => {
    const res = await create(["agent_free"]);
    expect(res.status).toBe(201);
    expect(saUpdateMany).toHaveBeenCalledWith(
      { _id: { $ne: "sa_new" }, agentIds: { $in: ["agent_free"] } },
      { $pull: { agentIds: { $in: ["agent_free"] } } }
    );
  });

  it("treats an agent pointing at a deleted super agent as unassigned", async () => {
    const res = await create(["agent_orphan"]);
    expect(res.status).toBe(201);
  });

  it("lets a super agent keep its own agents on edit", async () => {
    const res = await update(["agent_mine", "agent_free"]);
    expect(res.status).toBe(200);
  });

  it("rejects an edit that would take another super agent's agent", async () => {
    const res = await update(["agent_mine", "agent_theirs"]);
    expect(res.status).toBe(400);
    expect((await res.json()).takenAgentIds).toEqual(["agent_theirs"]);
    expect(agentUpdateMany).not.toHaveBeenCalled();
  });
});
