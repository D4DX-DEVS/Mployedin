/**
 * @jest-environment node
 */
export {};

const SA_USER = "650000000000000000000010";
const ADMIN_USER = "650000000000000000000020";
const TEAM_AGENT_USER = "650000000000000000000031";
const OTHER_AGENT_USER = "650000000000000000000032";
const TEAM_AGENT_DOC = "650000000000000000000041";
const TASK_ID = "650000000000000000000050";

const scope = jest.fn();
// getSuperAgentTeamAgentUserIds, run against the mocked scope and Agent model.
jest.mock("@/lib/auth/agentRestrictions", () => ({
  getSuperAgentTeamAgentUserIds: async (saUserId: string) => {
    const s = await scope(saUserId);
    if (!s || s.effectiveAgentIds.length === 0) return [];
    const agents = await agentFind({ _id: { $in: s.effectiveAgentIds } }).select("userId").lean();
    return agents.map((a: { userId: unknown }) => a.userId).filter(Boolean);
  },
}));
const notify = jest.fn(async (_p: unknown) => undefined);
jest.mock("@/lib/notifications/trigger", () => ({ notify: (p: unknown) => notify(p) }));

const agentFind = jest.fn();
jest.mock("@/models/Agent", () => ({ __esModule: true, default: { find: (...a: unknown[]) => agentFind(...a) } }));
jest.mock("@/models/SuperAgent", () => ({ __esModule: true, default: { exists: jest.fn(async () => ({ _id: "sa" })) } }));
const userFindOne = jest.fn();
jest.mock("@/models/User", () => ({
  __esModule: true,
  default: {
    findOne: (...a: unknown[]) => userFindOne(...a),
    findById: () => ({ select: () => ({ lean: async () => ({ name: "Sam" }) }) }),
    find: () => ({ select: () => ({ sort: () => ({ limit: () => ({ lean: async () => [] }) }), lean: async () => [] }) }),
  },
}));
const taskCreate = jest.fn(async (doc: Record<string, unknown>) => ({ _id: TASK_ID, ...doc }));
const taskFindById = jest.fn();
const taskFindOne = jest.fn();
const taskUpdate = jest.fn();
jest.mock("@/models/AgentTask", () => ({
  __esModule: true,
  default: {
    create: (d: Record<string, unknown>) => taskCreate(d),
    findById: (...a: unknown[]) => ({ lean: async () => taskFindById(...a) }),
    findOne: (...a: unknown[]) => ({ lean: async () => taskFindOne(...a) }),
    findOneAndUpdate: (...a: unknown[]) => ({ lean: async () => taskUpdate(...a) }),
  },
}));

const mongoose = jest.requireActual("mongoose") as typeof import("mongoose");
const oid = (s: string) => new mongoose.Types.ObjectId(s);
const sa = { userId: SA_USER, role: "super_agent" };
const admin = { userId: ADMIN_USER, role: "admin" };

function teamOf(agentUserIds: string[]) {
  scope.mockResolvedValue({ effectiveAgentIds: [oid(TEAM_AGENT_DOC)] });
  agentFind.mockReturnValue({ select: () => ({ lean: async () => agentUserIds.map((u) => ({ userId: oid(u) })) }) });
}

const awaiting = (assignedBy: string, role = "super_agent") => ({
  _id: TASK_ID,
  title: "Call the employer",
  userId: oid(TEAM_AGENT_USER),
  status: "completed",
  reviewStatus: "awaiting_review",
  assignedBy: { userId: oid(assignedBy), role },
});

beforeEach(() => {
  jest.clearAllMocks();
  userFindOne.mockReturnValue({ select: () => ({ lean: async () => ({ _id: TEAM_AGENT_USER }) }) });
});

describe("assigneeScope", () => {
  it("turns a super agent's team (agent profile ids) into agent user ids", async () => {
    teamOf([TEAM_AGENT_USER]);
    const { assigneeScope } = await import("@/lib/agentTasks/assigned");
    const ids = await assigneeScope(sa);
    expect(ids).not.toBe("all");
    expect((ids as unknown[]).map(String)).toEqual([TEAM_AGENT_USER]);
  });

  it("gives an admin everyone and anyone else nobody", async () => {
    const { assigneeScope } = await import("@/lib/agentTasks/assigned");
    expect(await assigneeScope(admin)).toBe("all");
    expect(await assigneeScope({ userId: "x", role: "agent" })).toEqual([]);
    scope.mockResolvedValue(null);
    expect(await assigneeScope(sa)).toEqual([]);
  });
});

describe("assignTask", () => {
  it("stops a super agent assigning outside their team", async () => {
    teamOf([TEAM_AGENT_USER]);
    const { assignTask } = await import("@/lib/agentTasks/assigned");
    await expect(assignTask(sa, { agentUserId: OTHER_AGENT_USER, title: "x", priority: "low" })).rejects.toMatchObject({ status: 403 });
    expect(taskCreate).not.toHaveBeenCalled();
  });

  it("creates the task on the agent's user id, records the assigner and notifies the agent", async () => {
    teamOf([TEAM_AGENT_USER]);
    const { assignTask } = await import("@/lib/agentTasks/assigned");
    await assignTask(sa, { agentUserId: TEAM_AGENT_USER, title: "Call the employer", priority: "high" });
    const doc = taskCreate.mock.calls[0][0] as { userId: unknown; assignedBy: { userId: unknown; role: string }; reviewStatus: string };
    expect(String(doc.userId)).toBe(TEAM_AGENT_USER);
    expect(String(doc.assignedBy.userId)).toBe(SA_USER);
    expect(doc.assignedBy.role).toBe("super_agent");
    expect(doc.reviewStatus).toBe("none");
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ userId: TEAM_AGENT_USER, titleKey: "taskAssignedTitle" }));
  });

  it("lets an admin assign to any agent", async () => {
    const { assignTask } = await import("@/lib/agentTasks/assigned");
    await assignTask(admin, { agentUserId: OTHER_AGENT_USER, title: "x", priority: "low" });
    expect((taskCreate.mock.calls[0][0] as { assignedBy: { role: string } }).assignedBy.role).toBe("admin");
  });
});

describe("reviewTask", () => {
  it("only lets the super agent who assigned it review — not another super agent on the same team", async () => {
    teamOf([TEAM_AGENT_USER]);
    taskFindById.mockResolvedValue(awaiting("650000000000000000000099"));
    const { reviewTask } = await import("@/lib/agentTasks/assigned");
    await expect(reviewTask(sa, TASK_ID, "approve")).rejects.toMatchObject({ status: 403 });
    expect(taskUpdate).not.toHaveBeenCalled();
  });

  it("lets an admin review a super agent's task", async () => {
    taskFindById.mockResolvedValue(awaiting(SA_USER));
    taskUpdate.mockResolvedValue({ _id: TASK_ID });
    const { reviewTask } = await import("@/lib/agentTasks/assigned");
    await reviewTask(admin, TASK_ID, "approve");
    const [, update] = taskUpdate.mock.calls[0] as [unknown, { $set: Record<string, unknown> }];
    expect(update.$set).toMatchObject({ reviewStatus: "approved", status: "completed" });
  });

  it("sends back only with a comment, reopening the task for the agent", async () => {
    teamOf([TEAM_AGENT_USER]);
    taskFindById.mockResolvedValue(awaiting(SA_USER));
    taskUpdate.mockResolvedValue({ _id: TASK_ID });
    const { reviewTask } = await import("@/lib/agentTasks/assigned");
    await expect(reviewTask(sa, TASK_ID, "return", "  ")).rejects.toMatchObject({ status: 400 });
    await reviewTask(sa, TASK_ID, "return", "Add the contract");
    const [, update] = taskUpdate.mock.calls[0] as [unknown, { $set: Record<string, unknown> }];
    expect(update.$set).toMatchObject({ reviewStatus: "returned", status: "pending", reviewComment: "Add the contract" });
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ userId: TEAM_AGENT_USER, titleKey: "taskReturnedTitle" }));
  });

  it("refuses a task that isn't waiting for review", async () => {
    taskFindById.mockResolvedValue({ ...awaiting(SA_USER), reviewStatus: "none", status: "pending" });
    const { reviewTask } = await import("@/lib/agentTasks/assigned");
    await expect(reviewTask(admin, TASK_ID, "approve")).rejects.toMatchObject({ status: 409 });
  });
});

describe("submitAssignedTask", () => {
  it("sends an assigned task to review and tells the assigner", async () => {
    taskFindOne.mockResolvedValue({ ...awaiting(SA_USER), status: "pending", reviewStatus: "none" });
    taskUpdate.mockResolvedValue({ _id: TASK_ID });
    const { submitAssignedTask } = await import("@/lib/agentTasks/assigned");
    await submitAssignedTask(TEAM_AGENT_USER, TASK_ID, "Called them, contract sent");
    const [, update] = taskUpdate.mock.calls[0] as [unknown, { $set: Record<string, unknown> }];
    expect(update.$set).toMatchObject({ status: "completed", reviewStatus: "awaiting_review", completionNote: "Called them, contract sent" });
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ userId: SA_USER, titleKey: "taskSubmittedTitle" }));
  });

  it("refuses a personal to-do and a task already with the reviewer", async () => {
    const { submitAssignedTask } = await import("@/lib/agentTasks/assigned");
    taskFindOne.mockResolvedValue({ _id: TASK_ID, userId: oid(TEAM_AGENT_USER), status: "pending" });
    await expect(submitAssignedTask(TEAM_AGENT_USER, TASK_ID, "x")).rejects.toMatchObject({ status: 400 });
    taskFindOne.mockResolvedValue(awaiting(SA_USER));
    await expect(submitAssignedTask(TEAM_AGENT_USER, TASK_ID, "x")).rejects.toMatchObject({ status: 409 });
  });
});

describe("listAssignedTasks", () => {
  it("returns nothing when a super agent filters by an agent outside their team", async () => {
    teamOf([TEAM_AGENT_USER]);
    const { listAssignedTasks } = await import("@/lib/agentTasks/assigned");
    const out = await listAssignedTasks(sa, { agentUserId: OTHER_AGENT_USER, page: 1, limit: 20 });
    expect(out.items).toEqual([]);
    expect(out.total).toBe(0);
  });
});
