/**
 * @jest-environment node
 */
/**
 * Own task lists for every role (Tasks for every role, Phase 1).
 *  - /api/agent/tasks, /api/super-agent/my-tasks, /api/admin/my-tasks each
 *    admit exactly one role; an admin calling the agent API is refused.
 *  - Every read and write is pinned to the caller's own userId, so another
 *    person's task answers 404 and is never listed.
 */
import { NextRequest } from "next/server";

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: Function) => async (req: NextRequest, params?: Record<string, string>) =>
    handler(req, (req as unknown as { __ctx: unknown }).__ctx, params ?? {}),
}));
jest.mock("@/lib/agentTasks/links", () => ({
  resolveTaskLinks: jest.fn(async () => new Map()),
  validateTaskLinks: jest.fn(async () => undefined),
}));

function chain(result: unknown) {
  const node: Record<string, unknown> = {};
  for (const m of ["select", "sort", "skip", "limit"]) node[m] = jest.fn(() => node);
  node.lean = jest.fn(async () => result);
  return node;
}

const find = jest.fn();
const countDocuments = jest.fn();
const aggregate = jest.fn();
const create = jest.fn();
const findOne = jest.fn();
const findOneAndUpdate = jest.fn();
const deleteOne = jest.fn();
const exists = jest.fn();
jest.mock("@/models/AgentTask", () => ({
  __esModule: true,
  default: {
    find: (...a: unknown[]) => find(...a),
    countDocuments: (...a: unknown[]) => countDocuments(...a),
    aggregate: (...a: unknown[]) => aggregate(...a),
    create: (...a: unknown[]) => create(...a),
    findOne: (...a: unknown[]) => findOne(...a),
    findOneAndUpdate: (...a: unknown[]) => findOneAndUpdate(...a),
    deleteOne: (...a: unknown[]) => deleteOne(...a),
    exists: (...a: unknown[]) => exists(...a),
  },
  CLOSED_TASK_STATUSES: ["completed", "failed"],
}));
jest.mock("@/models/User", () => ({ __esModule: true, default: { find: jest.fn(() => chain([])) } }));

const ADMIN = "64b0000000000000000000d1";
const SA = "64b0000000000000000000b1";
const AGENT = "64b0000000000000000000a1";
const TASK = "64b0000000000000000000c1";

type Role = "admin" | "super_agent" | "agent";
type Route = (r: NextRequest, p?: Record<string, string>) => Promise<Response>;

function req(path: string, method: string, ctx: { userId: string; role: Role }, body?: unknown) {
  const r = new NextRequest(`http://t${path}`, {
    method,
    ...(body ? { body: JSON.stringify(body), headers: { "Content-Type": "application/json" } } : {}),
  });
  (r as unknown as { __ctx: unknown }).__ctx = { ...ctx, locale: "en" };
  return r;
}

const LIST = {
  agent: () => import("@/app/api/agent/tasks/route"),
  super_agent: () => import("@/app/api/super-agent/my-tasks/route"),
  admin: () => import("@/app/api/admin/my-tasks/route"),
};
const ONE = {
  agent: () => import("@/app/api/agent/tasks/[id]/route"),
  super_agent: () => import("@/app/api/super-agent/my-tasks/[id]/route"),
  admin: () => import("@/app/api/admin/my-tasks/[id]/route"),
};
const USER: Record<Role, string> = { admin: ADMIN, super_agent: SA, agent: AGENT };

beforeEach(() => {
  jest.clearAllMocks();
  find.mockReturnValue(chain([]));
  countDocuments.mockResolvedValue(0);
  aggregate.mockResolvedValue([]);
  create.mockImplementation(async (doc: unknown) => doc);
});

describe("each own-task route admits only its own role", () => {
  const roles: Role[] = ["agent", "super_agent", "admin"];
  for (const route of roles) {
    for (const caller of roles.filter((r) => r !== route)) {
      it(`${caller} is refused on the ${route} list, create, update, history and delete`, async () => {
        const ctx = { userId: USER[caller], role: caller };
        const list = await LIST[route]();
        const one = await ONE[route]();
        expect((await (list.GET as unknown as Route)(req("/x", "GET", ctx))).status).toBe(403);
        expect((await (list.POST as unknown as Route)(req("/x", "POST", ctx, { title: "T" }))).status).toBe(403);
        expect((await (one.GET as unknown as Route)(req("/x", "GET", ctx), { id: TASK })).status).toBe(403);
        expect((await (one.PATCH as unknown as Route)(req("/x", "PATCH", ctx, { status: "in_progress" }), { id: TASK })).status).toBe(403);
        expect((await (one.DELETE as unknown as Route)(req("/x", "DELETE", ctx), { id: TASK })).status).toBe(403);
        expect(find).not.toHaveBeenCalled();
        expect(create).not.toHaveBeenCalled();
        expect(deleteOne).not.toHaveBeenCalled();
      });
    }
  }
});

describe.each<Role>(["admin", "super_agent"])("%s own tasks", (role) => {
  const ctx = { userId: USER[role], role };

  it("lists only the caller's tasks", async () => {
    const { GET } = await LIST[role]();
    const res = await (GET as unknown as Route)(req("/x?status=open", "GET", ctx));
    expect(res.status).toBe(200);
    expect(find.mock.calls[0][0]).toMatchObject({ userId: USER[role] });
    expect(countDocuments.mock.calls.every((c) => (c[0] as { userId: string }).userId === USER[role])).toBe(true);
  });

  it("creates a task owned by the caller, with a created history line", async () => {
    const { POST } = await LIST[role]();
    const res = await (POST as unknown as Route)(req("/x", "POST", ctx, { title: "Approve November commission run", priority: "high" }));
    expect(res.status).toBe(200);
    const doc = create.mock.calls[0][0] as { userId: string; assignedBy?: unknown; history: Array<{ action: string }> };
    expect(doc.userId).toBe(USER[role]);
    expect(doc.assignedBy).toBeUndefined();
    expect(doc.history[0].action).toBe("created");
  });

  it("someone else's task answers 404 on update and history", async () => {
    findOne.mockReturnValue(chain(null));
    const one = await ONE[role]();
    const patch = await (one.PATCH as unknown as Route)(req("/x", "PATCH", ctx, { status: "completed" }), { id: TASK });
    expect(patch.status).toBe(404);
    expect(findOne.mock.calls[0][0]).toMatchObject({ _id: TASK, userId: USER[role] });
    const hist = await (one.GET as unknown as Route)(req("/x", "GET", ctx), { id: TASK });
    expect(hist.status).toBe(404);
    expect(findOneAndUpdate).not.toHaveBeenCalled();
  });

  it("deletes only the caller's own personal task", async () => {
    deleteOne.mockResolvedValue({ deletedCount: 0 });
    exists.mockResolvedValue(null);
    const { DELETE } = await ONE[role]();
    const res = await (DELETE as unknown as Route)(req("/x", "DELETE", ctx), { id: TASK });
    expect(res.status).toBe(404);
    expect(deleteOne.mock.calls[0][0]).toMatchObject({ _id: TASK, userId: USER[role], "assignedBy.userId": { $exists: false } });
  });

  it("closes a personal task directly, without review", async () => {
    findOne.mockReturnValue(chain({ status: "in_progress" }));
    findOneAndUpdate.mockResolvedValue({ _id: TASK });
    const { PATCH } = await ONE[role]();
    const res = await (PATCH as unknown as Route)(req("/x", "PATCH", ctx, { status: "completed" }), { id: TASK });
    expect(res.status).toBe(200);
    const update = findOneAndUpdate.mock.calls[0][1] as { $set: Record<string, unknown> };
    expect(update.$set.status).toBe("completed");
    expect(update.$set.reviewStatus).toBeUndefined();
  });
});
