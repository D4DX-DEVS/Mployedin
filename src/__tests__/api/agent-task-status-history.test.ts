/**
 * @jest-environment node
 */
/**
 * Agent task status changes (PATCH /api/agent/tasks/[id]) and their history.
 *  - Any status change takes an optional note and records one history line
 *    (from → to, who, note); re-sending the same status records nothing.
 *  - Completed / Failed on an assigned task is a report: it goes to review,
 *    note optional; while with the reviewer, the agent can't change it.
 *  - GET returns the activity newest first, names resolved; a task made before
 *    history existed still shows its creation line.
 */
import { NextRequest } from "next/server";

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: Function) => async (req: NextRequest, params?: Record<string, string>) =>
    handler(req, (req as unknown as { __ctx: unknown }).__ctx, params ?? {}),
}));

const submitAssignedTask = jest.fn();
jest.mock("@/lib/agentTasks/assigned", () => ({
  ...jest.requireActual("@/lib/agentTasks/assigned"),
  submitAssignedTask: (...a: unknown[]) => submitAssignedTask(...a),
}));

function chain(result: unknown) {
  const node: Record<string, unknown> = {};
  for (const m of ["select", "sort", "skip", "limit"]) node[m] = jest.fn(() => node);
  node.lean = jest.fn(async () => result);
  return node;
}

const taskFindOne = jest.fn();
const taskUpdate = jest.fn();
jest.mock("@/models/AgentTask", () => {
  const model = {
    findOne: (...a: unknown[]) => taskFindOne(...a),
    findOneAndUpdate: (...a: unknown[]) => taskUpdate(...a),
  };
  return { __esModule: true, default: model, CLOSED_TASK_STATUSES: ["completed", "failed"] };
});
const userFind = jest.fn();
jest.mock("@/models/User", () => ({ __esModule: true, default: { find: (...a: unknown[]) => userFind(...a) } }));

const AGENT = "64b0000000000000000000a1";
const SA = "64b0000000000000000000b1";
const TASK = "64b0000000000000000000c1";

function req(method: string, body?: unknown) {
  const r = new NextRequest(`http://t/api/agent/tasks/${TASK}`, {
    method,
    ...(body ? { body: JSON.stringify(body), headers: { "Content-Type": "application/json" } } : {}),
  });
  (r as unknown as { __ctx: unknown }).__ctx = { userId: AGENT, role: "agent", locale: "en" };
  return r;
}

async function patch(body: unknown) {
  const { PATCH } = await import("@/app/api/agent/tasks/[id]/route");
  return (PATCH as unknown as (r: NextRequest, p: Record<string, string>) => Promise<Response>)(req("PATCH", body), { id: TASK });
}

type Update = { $set: Record<string, unknown>; $push?: { history: { $each: Array<Record<string, unknown>> } } };
const lastUpdate = () => taskUpdate.mock.calls[0][1] as Update;

beforeEach(() => {
  jest.clearAllMocks();
  taskUpdate.mockResolvedValue({ _id: TASK });
});

describe("PATCH /api/agent/tasks/[id] — status changes", () => {
  it("records a personal task's status change with its note", async () => {
    taskFindOne.mockReturnValue(chain({ status: "pending" }));
    const res = await patch({ status: "in_progress", note: "Started on the job post" });
    expect(res.status).toBe(200);
    const update = lastUpdate();
    expect(update.$set.status).toBe("in_progress");
    expect(update.$push!.history.$each[0]).toMatchObject({ action: "status", from: "pending", to: "in_progress", note: "Started on the job post" });
    expect(String(update.$push!.history.$each[0].by)).toBe(AGENT);
  });

  it("closes a personal task as failed with no note", async () => {
    taskFindOne.mockReturnValue(chain({ status: "in_progress" }));
    const res = await patch({ status: "failed" });
    expect(res.status).toBe(200);
    const update = lastUpdate();
    expect(update.$set).toMatchObject({ status: "failed" });
    expect(update.$set.completionNote).toBeUndefined();
    expect(update.$push!.history.$each[0]).toMatchObject({ from: "in_progress", to: "failed" });
    expect(update.$push!.history.$each[0].note).toBeUndefined();
  });

  it("records nothing when the status doesn't change", async () => {
    taskFindOne.mockReturnValue(chain({ status: "in_progress" }));
    await patch({ status: "in_progress" });
    expect(lastUpdate().$push).toBeUndefined();
  });

  it("sends an assigned task reported failed to review, note optional", async () => {
    taskFindOne.mockReturnValue(chain({ status: "in_progress", reviewStatus: "none", assignedBy: { userId: SA } }));
    submitAssignedTask.mockResolvedValue({ _id: TASK });
    const res = await patch({ status: "failed" });
    expect(res.status).toBe(200);
    expect(submitAssignedTask).toHaveBeenCalledWith(AGENT, TASK, "failed", undefined);
    expect(taskUpdate).not.toHaveBeenCalled();
  });

  it("refuses a status change while the task is with the reviewer", async () => {
    taskFindOne.mockReturnValue(chain({ status: "completed", reviewStatus: "awaiting_review", assignedBy: { userId: SA } }));
    const res = await patch({ status: "in_progress" });
    expect(res.status).toBe(409);
    expect(taskUpdate).not.toHaveBeenCalled();
  });
});

describe("GET /api/agent/tasks/[id] — history", () => {
  async function get() {
    const { GET } = await import("@/app/api/agent/tasks/[id]/route");
    return (GET as unknown as (r: NextRequest, p: Record<string, string>) => Promise<Response>)(req("GET"), { id: TASK });
  }

  it("lists the activity newest first with names", async () => {
    taskFindOne.mockReturnValue(chain({
      userId: AGENT,
      createdAt: new Date("2026-10-18T09:00:00Z"),
      assignedBy: { userId: SA },
      history: [
        { action: "assigned", to: "pending", by: SA, at: new Date("2026-10-18T09:00:00Z") },
        { action: "status", from: "pending", to: "in_progress", note: "Started", by: AGENT, at: new Date("2026-10-19T10:15:00Z") },
      ],
    }));
    userFind.mockReturnValue(chain([{ _id: SA, name: "Sam Super" }, { _id: AGENT, name: "Ali Agent" }]));
    const body = await (await get()).json();
    expect(body.history.map((h: { action: string }) => h.action)).toEqual(["status", "assigned"]);
    expect(body.history[0]).toMatchObject({ from: "pending", to: "in_progress", note: "Started", byName: "Ali Agent" });
    expect(body.history[1].byName).toBe("Sam Super");
  });

  it("gives a task from before history its creation line", async () => {
    taskFindOne.mockReturnValue(chain({ userId: AGENT, createdAt: new Date("2026-09-01T00:00:00Z") }));
    userFind.mockReturnValue(chain([{ _id: AGENT, name: "Ali Agent" }]));
    const body = await (await get()).json();
    expect(body.history).toEqual([expect.objectContaining({ action: "created", byName: "Ali Agent" })]);
  });

  it("404s on someone else's task", async () => {
    taskFindOne.mockReturnValue(chain(null));
    expect((await get()).status).toBe(404);
  });
});
