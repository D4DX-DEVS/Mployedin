/**
 * @jest-environment node
 */
/**
 * Tasks for every role, phases 2–5:
 *  - admin gives one task to several super agents: one copy each, one group
 *  - who may act on a given task (giver, routed-through SA while on team, admin)
 *  - review switch: done closes directly when off; a failure still waits
 *  - withdraw / give to someone else / change due / review switch rules
 *  - withdrawn tasks are frozen for the assignee
 */
export {};

const SA = "650000000000000000000010";
const SA2 = "650000000000000000000011";
const ADMIN = "650000000000000000000020";
const AGENT = "650000000000000000000031";
const AGENT2 = "650000000000000000000032";
const TASK = "650000000000000000000050";
const GROUP = "650000000000000000000060";

const team = jest.fn(async (_sa: string): Promise<unknown[]> => []);
jest.mock("@/lib/auth/agentRestrictions", () => ({
  getSuperAgentTeamAgentUserIds: (sa: string) => team(sa),
}));
const notify = jest.fn(async (_p: unknown) => undefined);
jest.mock("@/lib/notifications/trigger", () => ({ notify: (p: unknown) => notify(p) }));
jest.mock("@/lib/agentTasks/links", () => ({
  validateTaskLinks: jest.fn(async () => ({ jobId: "x" })),
  resolveTaskLinks: async () => new Map(),
}));
jest.mock("@/models/SuperAgent", () => ({ __esModule: true, default: { exists: jest.fn(async () => null) } }));

const userFindOne = jest.fn();
jest.mock("@/models/User", () => ({
  __esModule: true,
  default: {
    findOne: (...a: unknown[]) => userFindOne(...a),
    findById: () => ({ select: () => ({ lean: async () => ({ name: "Sam" }) }) }),
  },
}));

const created: Array<Record<string, unknown>> = [];
const findById = jest.fn();
const findOne = jest.fn();
const findOneAndUpdate = jest.fn();
const updateOne = jest.fn();
const find = jest.fn();
const exists = jest.fn();
jest.mock("@/models/AgentTask", () => ({
  __esModule: true,
  CLOSED_TASK_STATUSES: ["completed", "failed", "cancelled"],
  default: {
    create: async (d: Record<string, unknown>) => { created.push(d); return { _id: `t${created.length}`, ...d }; },
    findById: (...a: unknown[]) => { const q = { lean: async () => findById(...a), select: () => q }; return q; },
    findOne: (...a: unknown[]) => { const q = { lean: async () => findOne(...a), select: () => q }; return q; },
    findOneAndUpdate: (...a: unknown[]) => ({ lean: async () => findOneAndUpdate(...a) }),
    updateOne: (...a: unknown[]) => updateOne(...a),
    find: (...a: unknown[]) => ({ lean: async () => find(...a) }),
    exists: (...a: unknown[]) => exists(...a),
  },
}));

const mongoose = jest.requireActual("mongoose") as typeof import("mongoose");
const oid = (s: string) => new mongoose.Types.ObjectId(s);
const admin = { userId: ADMIN, role: "admin" };
const sa = { userId: SA, role: "super_agent" };

const given = (over: Record<string, unknown> = {}) => ({
  _id: oid(TASK),
  title: "Count the stock",
  userId: oid(AGENT),
  status: "pending",
  reviewStatus: "none",
  assignedBy: { userId: oid(SA), role: "super_agent" },
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  created.length = 0;
  userFindOne.mockReturnValue({ select: () => ({ lean: async () => ({ name: "Pat" }) }) });
  updateOne.mockResolvedValue({ modifiedCount: 1 });
});

describe("giving tasks", () => {
  it("admin gives one task to several super agents: one copy each, one group, each notified on Given to me", async () => {
    const { assignTasks } = await import("@/lib/agentTasks/assigned");
    await assignTasks(admin, { assigneeRole: "super_agent", assigneeUserIds: [SA, SA2], title: "Stock count", priority: "high" });
    expect(created).toHaveLength(2);
    expect(created.map((c) => String(c.userId))).toEqual([SA, SA2]);
    expect(created.every((c) => c.assigneeRole === "super_agent" && c.reviewRequired === true)).toBe(true);
    expect(String(created[0].groupId)).toBe(String(created[1].groupId));
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ userId: SA, link: "/super-agent/tasks?tab=given" }));
  });

  it("a single person gets no group", async () => {
    const { assignTasks } = await import("@/lib/agentTasks/assigned");
    await assignTasks(admin, { assigneeUserIds: [AGENT], title: "x", priority: "low" });
    expect(created[0].groupId).toBeUndefined();
  });

  it("a super agent can't give tasks to super agents", async () => {
    const { assignTasks } = await import("@/lib/agentTasks/assigned");
    await expect(assignTasks(sa, { assigneeRole: "super_agent", assigneeUserIds: [SA2], title: "x", priority: "low" }))
      .rejects.toMatchObject({ status: 403 });
    expect(created).toHaveLength(0);
  });

  it("creates nothing when one of several agents is outside the super agent's team", async () => {
    team.mockResolvedValue([oid(AGENT)]);
    const { assignTasks } = await import("@/lib/agentTasks/assigned");
    await expect(assignTasks(sa, { assigneeUserIds: [AGENT, AGENT2], title: "x", priority: "low" })).rejects.toMatchObject({ status: 403 });
    expect(created).toHaveLength(0);
  });

  it("refuses record links when the task goes to more than one person", async () => {
    const { assignTasks } = await import("@/lib/agentTasks/assigned");
    await expect(assignTasks(admin, { assigneeUserIds: [AGENT, AGENT2], title: "x", priority: "low", jobId: TASK }))
      .rejects.toMatchObject({ status: 400 });
  });

  it("stores the review switch when it is turned off", async () => {
    const { assignTasks } = await import("@/lib/agentTasks/assigned");
    await assignTasks(admin, { assigneeUserIds: [AGENT], title: "x", priority: "low", reviewRequired: false });
    expect(created[0].reviewRequired).toBe(false);
  });
});

describe("who may act on a given task", () => {
  it("the giver, even after the agent moved teams; a routed-through super agent only while the agent is on their team", async () => {
    const { canActOnTask } = await import("@/lib/agentTasks/assigned");
    expect(canActOnTask(sa, given(), [])).toBe(true);
    const routed = given({ assignedBy: { userId: oid(ADMIN), role: "admin" }, managedBy: oid(SA) });
    expect(canActOnTask(sa, routed, [oid(AGENT)])).toBe(true);
    expect(canActOnTask(sa, routed, [oid(AGENT2)])).toBe(false);
  });

  it("an admin's direct task to the super agent's agent is view only for them; any admin may act", async () => {
    const { canActOnTask } = await import("@/lib/agentTasks/assigned");
    const direct = given({ assignedBy: { userId: oid(ADMIN), role: "admin" } });
    expect(canActOnTask(sa, direct, [oid(AGENT)])).toBe(false);
    expect(canActOnTask({ userId: "650000000000000000000099", role: "admin" }, direct, [])).toBe(true);
  });

  it("refuses review of an admin's direct task with 403, not 404, when the agent is on the team", async () => {
    team.mockResolvedValue([oid(AGENT)]);
    findById.mockResolvedValue(given({ assignedBy: { userId: oid(ADMIN), role: "admin" }, reviewStatus: "awaiting_review", status: "completed" }));
    const { reviewTask } = await import("@/lib/agentTasks/assigned");
    await expect(reviewTask(sa, TASK, "approve")).rejects.toMatchObject({ status: 403 });
    expect(findOneAndUpdate).not.toHaveBeenCalled();
  });
});

describe("reporting a given task", () => {
  it("review off: done closes it directly and tells the giver it is done", async () => {
    findOne.mockResolvedValue(given({ reviewRequired: false, status: "in_progress" }));
    findOneAndUpdate.mockResolvedValue({ _id: TASK });
    const { submitAssignedTask } = await import("@/lib/agentTasks/assigned");
    await submitAssignedTask(AGENT, TASK, "completed");
    const update = findOneAndUpdate.mock.calls[0][1] as { $set: Record<string, unknown> };
    expect(update.$set).toMatchObject({ status: "completed", reviewStatus: "none" });
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ userId: SA, titleKey: "taskDoneTitle" }));
  });

  it("review off: a failure still waits for the giver", async () => {
    findOne.mockResolvedValue(given({ reviewRequired: false }));
    findOneAndUpdate.mockResolvedValue({ _id: TASK });
    const { submitAssignedTask } = await import("@/lib/agentTasks/assigned");
    await submitAssignedTask(AGENT, TASK, "failed");
    expect((findOneAndUpdate.mock.calls[0][1] as { $set: Record<string, unknown> }).$set.reviewStatus).toBe("awaiting_review");
  });

  it("a withdrawn task can't be reported or changed", async () => {
    findOne.mockResolvedValue(given({ status: "cancelled" }));
    const { submitAssignedTask } = await import("@/lib/agentTasks/assigned");
    await expect(submitAssignedTask(AGENT, TASK, "completed")).rejects.toMatchObject({ status: 409 });
    const { updateOwnTask } = await import("@/lib/agentTasks/ownTask");
    await expect(updateOwnTask(AGENT, TASK, { status: "in_progress" })).rejects.toMatchObject({ status: 409 });
  });
});

describe("giver actions", () => {
  it("withdraw for everyone skips finished copies and copies the caller can't act on", async () => {
    team.mockResolvedValue([oid(AGENT), oid(AGENT2)]);
    findById.mockResolvedValue(given({ groupId: oid(GROUP) }));
    find.mockResolvedValue([
      given({ groupId: oid(GROUP) }),
      given({ _id: oid("650000000000000000000051"), userId: oid(AGENT2), groupId: oid(GROUP), status: "completed" }),
      given({ _id: oid("650000000000000000000052"), groupId: oid(GROUP), assignedBy: { userId: oid(ADMIN), role: "admin" } }),
    ]);
    const { performTaskAction } = await import("@/lib/agentTasks/assignedActions");
    const out = await performTaskAction(sa, TASK, { action: "withdraw", scope: "group", note: "Stand cancelled" });
    expect(out).toEqual({ changed: 1 });
    expect(updateOne).toHaveBeenCalledTimes(1);
    expect((updateOne.mock.calls[0][1] as { $set: Record<string, unknown> }).$set.status).toBe("cancelled");
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ userId: AGENT, titleKey: "taskWithdrawnTitle" }));
  });

  it("give to someone else moves the same task back to To do and records both people", async () => {
    team.mockResolvedValue([oid(AGENT), oid(AGENT2)]);
    findById.mockResolvedValue(given({ status: "in_progress", reviewStatus: "returned" }));
    findOneAndUpdate.mockResolvedValue({ _id: TASK });
    const { performTaskAction } = await import("@/lib/agentTasks/assignedActions");
    await performTaskAction(sa, TASK, { action: "reassign", toUserId: AGENT2 });
    const update = findOneAndUpdate.mock.calls[0][1] as { $set: Record<string, unknown>; $push: { history: { $each: Array<Record<string, unknown>> } } };
    expect(String(update.$set.userId)).toBe(AGENT2);
    expect(update.$set).toMatchObject({ status: "pending", reviewStatus: "none" });
    const line = update.$push.history.$each[0];
    expect(line.action).toBe("reassigned");
    expect(String(line.fromUser)).toBe(AGENT);
    expect(String(line.toUser)).toBe(AGENT2);
  });

  it("won't give a finished task to someone else, or give it outside the team", async () => {
    team.mockResolvedValue([oid(AGENT)]);
    const { performTaskAction } = await import("@/lib/agentTasks/assignedActions");
    findById.mockResolvedValue(given({ status: "completed" }));
    await expect(performTaskAction(sa, TASK, { action: "reassign", toUserId: AGENT2 })).rejects.toMatchObject({ status: 409 });
    findById.mockResolvedValue(given());
    await expect(performTaskAction(sa, TASK, { action: "reassign", toUserId: AGENT2 })).rejects.toMatchObject({ status: 403 });
  });

  it("the review switch locks once work has started, except for an admin", async () => {
    findById.mockResolvedValue(given({ status: "in_progress" }));
    const { performTaskAction } = await import("@/lib/agentTasks/assignedActions");
    await expect(performTaskAction(sa, TASK, { action: "set_review", scope: "one", reviewRequired: false })).rejects.toMatchObject({ status: 409 });
    const out = await performTaskAction(admin, TASK, { action: "set_review", scope: "one", reviewRequired: false });
    expect(out).toEqual({ changed: 1 });
  });

  it("changing the due date clears the reminders already sent", async () => {
    findById.mockResolvedValue(given());
    const { performTaskAction } = await import("@/lib/agentTasks/assignedActions");
    await performTaskAction(sa, TASK, { action: "set_due", scope: "one", dueDate: new Date("2030-01-01") });
    expect(updateOne.mock.calls[0][1]).toMatchObject({ $unset: { remindedAt: "" } });
  });
});
