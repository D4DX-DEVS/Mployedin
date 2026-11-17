/**
 * @jest-environment node
 */
import type { CopilotToolContext } from "@/lib/ai/copilot/types";
import { canAccess } from "@/lib/permissions/matrix";

/**
 * Tasks in the Copilot chat for admins and super agents (and delete for
 * everyone). The tools only resolve names and show the card; every write goes
 * through the Tasks page's own functions, so these tests check that the chat
 * hands them the right people and refuses what the page refuses.
 */

const ADMIN = "64b0000000000000000000a0";
const SA = "64b0000000000000000000b0";
const TASK = "64b0000000000000000000c1";
const SARA = { userId: "64b0000000000000000000d1", name: "Sara", email: "sara@x.com" };
const SARAH = { userId: "64b0000000000000000000d2", name: "Sarah Khan", email: "sarah@x.com" };
const OMAR = { userId: "64b0000000000000000000d3", name: "Omar Ali", email: "omar@x.com" };
const SA_ONE = { userId: "64b0000000000000000000e1", name: "Nadia", email: "nadia@x.com" };
const SA_TWO = { userId: "64b0000000000000000000e2", name: "Yusuf", email: "yusuf@x.com" };

const ctxOf = (userId: string, role: string) =>
  ({ userId, role, locale: "en", permissionMode: "role_default", currentPage: "/en/x" }) as unknown as CopilotToolContext;
const saCtx = ctxOf(SA, "super_agent");
const adminCtx = ctxOf(ADMIN, "admin");

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/ai/copilot/tools/agentWork", () => ({
  ownTasksPath: (role: string) => (role === "admin" ? "/admin/tasks" : role === "super_agent" ? "/super-agent/tasks" : "/agent/tasks"),
}));

class TaskError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
const assignTasks = jest.fn();
const loadActionableTask = jest.fn();
const reviewTask = jest.fn();
const listAssignableAgents = jest.fn();
const listAssignableSuperAgents = jest.fn();
jest.mock("@/lib/agentTasks/assigned", () => ({
  TaskError,
  assignTasks: (...a: unknown[]) => assignTasks(...a),
  loadActionableTask: (...a: unknown[]) => loadActionableTask(...a),
  reviewTask: (...a: unknown[]) => reviewTask(...a),
  listAssignableAgents: (...a: unknown[]) => listAssignableAgents(...a),
  listAssignableSuperAgents: (...a: unknown[]) => listAssignableSuperAgents(...a),
  assigneeRoleOf: (t: { assigneeRole?: string }) => (t.assigneeRole === "super_agent" ? "super_agent" : "agent"),
}));
const listAssignedTasks = jest.fn();
jest.mock("@/lib/agentTasks/assignedList", () => ({ listAssignedTasks: (...a: unknown[]) => listAssignedTasks(...a) }));
const performTaskAction = jest.fn();
jest.mock("@/lib/agentTasks/assignedActions", () => ({ performTaskAction: (...a: unknown[]) => performTaskAction(...a) }));
jest.mock("@/lib/agentTasks/taskNotify", () => ({ nameOf: async () => "Sara" }));

const taskFindOne = jest.fn();
const deleteOne = jest.fn();
jest.mock("@/models/AgentTask", () => ({
  __esModule: true,
  default: {
    findOne: (...a: unknown[]) => ({ select: () => ({ lean: async () => taskFindOne(...a) }) }),
    deleteOne: (...a: unknown[]) => deleteOne(...a),
  },
  CLOSED_TASK_STATUSES: ["completed", "failed", "cancelled"],
}));

const tools = () => import("@/lib/ai/copilot/tools/taskWork");

beforeEach(() => {
  jest.clearAllMocks();
  listAssignableAgents.mockResolvedValue([SARA, SARAH, OMAR]);
  listAssignableSuperAgents.mockResolvedValue([SA_ONE, SA_TWO]);
});

describe("who sees the tools", () => {
  it("gives the giving tools to admins and super agents only, and delete to everyone with a task list", async () => {
    const t = await tools();
    for (const tool of [t.giveTaskTool, t.tasksIGaveTool, t.changeGivenTaskTool, t.reviewTaskReportTool]) {
      expect(tool.roles).toEqual(["admin", "super_agent"]);
    }
    expect(t.deleteTaskTool.roles).toEqual(["agent", "super_agent", "admin"]);
    for (const role of ["admin", "super_agent", "agent"] as const) {
      for (const action of ["create", "read", "update", "delete"] as const) expect(canAccess(role, "tasks", action)).toBe(true);
    }
    expect(canAccess("employer", "tasks", "create")).toBe(false);
  });
});

describe("give_task", () => {
  it("resolves names to the super agent's team and hands assignTasks those ids", async () => {
    const { giveTaskTool } = await tools();
    const preview = await giveTaskTool.preview!({ title: "Stock count", people: ["sara", "omar@x.com"] }, saCtx);
    expect(preview.blocker).toBeUndefined();
    // "sara" is Sara exactly, not Sarah Khan.
    expect(preview.resolvedArgs).toMatchObject({ assigneeUserIds: [SARA.userId, OMAR.userId], assigneeKind: "agent", peopleLabel: "Sara and Omar Ali" });
    expect(listAssignableAgents).toHaveBeenCalledWith(saCtx, undefined);

    assignTasks.mockResolvedValue([{ _id: "t1" }, { _id: "t2" }]);
    const result = await giveTaskTool.execute({ title: "Stock count", dueInDays: 2, ...preview.resolvedArgs } as never, saCtx);
    expect(result.ok).toBe(true);
    expect(result.message).toContain("2 people");
    expect(assignTasks).toHaveBeenCalledWith(saCtx, expect.objectContaining({
      assigneeRole: "agent",
      assigneeUserIds: [SARA.userId, OMAR.userId],
      reviewRequired: true,
      priority: "medium",
      dueDate: expect.any(Date),
    }));
  });

  it("asks which person when a name fits more than one", async () => {
    const { giveTaskTool } = await tools();
    const preview = await giveTaskTool.preview!({ title: "x", people: ["sar"] }, saCtx);
    expect(preview.blocker).toMatch(/more than one person/);
  });

  it("refuses a name outside the caller's reach and a super agent giving to super agents", async () => {
    const { giveTaskTool } = await tools();
    expect((await giveTaskTool.preview!({ title: "x", people: ["Zed"] }, saCtx)).blocker).toMatch(/Nobody called "Zed"/);
    expect((await giveTaskTool.preview!({ title: "x", people: ["Nadia"], assigneeKind: "super_agent" }, saCtx)).blocker).toMatch(/agents only/);
  });

  it("lets an admin give a task to every super agent", async () => {
    const { giveTaskTool } = await tools();
    const preview = await giveTaskTool.preview!({ title: "Monthly report", everyone: true, assigneeKind: "super_agent", reviewRequired: false }, adminCtx);
    expect(preview.resolvedArgs).toMatchObject({ assigneeUserIds: [SA_ONE.userId, SA_TWO.userId], assigneeKind: "super_agent" });
    expect(preview.summary).toMatch(/Review is off/);
  });

  it("picks agents from the named super agent's team when an admin gives through them", async () => {
    const { giveTaskTool } = await tools();
    const preview = await giveTaskTool.preview!({ title: "x", people: ["Omar"], throughSuperAgent: "Nadia" }, adminCtx);
    expect(listAssignableAgents).toHaveBeenCalledWith(adminCtx, SA_ONE.userId);
    expect(preview.resolvedArgs).toMatchObject({ superAgentUserId: SA_ONE.userId, assigneeUserIds: [OMAR.userId] });
  });

  it("passes the page's refusal back as the result", async () => {
    const { giveTaskTool } = await tools();
    assignTasks.mockRejectedValue(new TaskError(403, "Omar Ali is not on your team"));
    const result = await giveTaskTool.execute({ title: "x", assigneeUserIds: [OMAR.userId] }, saCtx);
    expect(result).toEqual({ ok: false, message: "Omar Ali is not on your team" });
  });
});

describe("delete_task", () => {
  it("won't delete a task someone gave the user", async () => {
    const { deleteTaskTool } = await tools();
    taskFindOne.mockResolvedValue({ title: "Call HR", assignedBy: { userId: ADMIN } });
    expect((await deleteTaskTool.preview!({ taskId: TASK }, saCtx)).blocker).toMatch(/given to you/);
  });

  it("deletes only the caller's own personal to-do", async () => {
    const { deleteTaskTool } = await tools();
    taskFindOne.mockResolvedValue({ title: "Call HR" });
    const preview = await deleteTaskTool.preview!({ taskId: TASK }, adminCtx);
    expect(preview.summary).toMatch(/can't be undone/);
    deleteOne.mockResolvedValue({ deletedCount: 1 });
    const result = await deleteTaskTool.execute({ taskId: TASK, ...preview.resolvedArgs }, adminCtx);
    expect(result.ok).toBe(true);
    expect(deleteOne).toHaveBeenCalledWith({ _id: TASK, userId: ADMIN, "assignedBy.userId": { $exists: false } });
  });
});

describe("change_given_task", () => {
  const given = { _id: TASK, title: "Stock count", status: "pending", userId: SARA.userId, assigneeRole: "agent" };

  it("shows no card when the caller may not act on the task (view only)", async () => {
    const { changeGivenTaskTool } = await tools();
    loadActionableTask.mockRejectedValue(new TaskError(403, "Only the person who gave this task or an admin can change it"));
    const preview = await changeGivenTaskTool.preview!({ taskId: TASK, action: "withdraw" }, saCtx);
    expect(preview.blocker).toMatch(/Only the person who gave/);
  });

  it("withdraws through the page's action", async () => {
    const { changeGivenTaskTool } = await tools();
    loadActionableTask.mockResolvedValue({ task: given, team: [] });
    const preview = await changeGivenTaskTool.preview!({ taskId: TASK, action: "withdraw", note: "Not needed" }, saCtx);
    expect(preview.summary).toMatch(/withdrawn from Sara/);
    performTaskAction.mockResolvedValue({ changed: 1 });
    const result = await changeGivenTaskTool.execute({ taskId: TASK, action: "withdraw", note: "Not needed", ...preview.resolvedArgs }, saCtx);
    expect(result.ok).toBe(true);
    expect(performTaskAction).toHaveBeenCalledWith(saCtx, TASK, { action: "withdraw", scope: "one", note: "Not needed" });
  });

  it("re-dates a whole group and gives a task to someone else", async () => {
    const { changeGivenTaskTool } = await tools();
    loadActionableTask.mockResolvedValue({ task: { ...given, groupId: "g1" }, team: [] });
    performTaskAction.mockResolvedValue({ changed: 3 });
    await changeGivenTaskTool.execute({ taskId: TASK, action: "set_due", wholeGroup: true, dueInDays: 3 }, saCtx);
    expect(performTaskAction).toHaveBeenLastCalledWith(saCtx, TASK, { action: "set_due", scope: "group", dueDate: expect.any(Date) });

    const preview = await changeGivenTaskTool.preview!({ taskId: TASK, action: "reassign", toPerson: "Omar" }, saCtx);
    expect(preview.resolvedArgs).toMatchObject({ toUserId: OMAR.userId, toName: "Omar Ali" });
    await changeGivenTaskTool.execute({ taskId: TASK, action: "reassign", toPerson: "Omar", ...preview.resolvedArgs }, saCtx);
    expect(performTaskAction).toHaveBeenLastCalledWith(saCtx, TASK, { action: "reassign", toUserId: OMAR.userId });
  });

  it("refuses a closed task and handing it to the same person", async () => {
    const { changeGivenTaskTool } = await tools();
    loadActionableTask.mockResolvedValue({ task: { ...given, status: "completed" }, team: [] });
    expect((await changeGivenTaskTool.preview!({ taskId: TASK, action: "withdraw" }, saCtx)).blocker).toMatch(/already closed/);
    loadActionableTask.mockResolvedValue({ task: given, team: [] });
    expect((await changeGivenTaskTool.preview!({ taskId: TASK, action: "reassign", toPerson: "sara@x.com" }, saCtx)).blocker).toMatch(/already has/);
  });
});

describe("review_task_report", () => {
  const reported = { _id: TASK, title: "Stock count", status: "failed", reviewStatus: "awaiting_review", userId: SARA.userId, completionNote: "Shop closed" };

  it("needs a waiting report and a comment to send back", async () => {
    const { reviewTaskReportTool } = await tools();
    loadActionableTask.mockResolvedValue({ task: { ...reported, reviewStatus: "approved" }, team: [] });
    expect((await reviewTaskReportTool.preview!({ taskId: TASK, decision: "approve" }, adminCtx)).blocker).toMatch(/no report waiting/);
    loadActionableTask.mockResolvedValue({ task: reported, team: [] });
    expect((await reviewTaskReportTool.preview!({ taskId: TASK, decision: "return" }, adminCtx)).blocker).toMatch(/what needs to change/);
  });

  it("says approving a failure accepts it, then reviews through the page's function", async () => {
    const { reviewTaskReportTool } = await tools();
    loadActionableTask.mockResolvedValue({ task: reported, team: [] });
    const preview = await reviewTaskReportTool.preview!({ taskId: TASK, decision: "approve" }, adminCtx);
    expect(preview.summary).toMatch(/could not be done.*Shop closed.*accepts the failure/);
    reviewTask.mockResolvedValue({});
    const result = await reviewTaskReportTool.execute({ taskId: TASK, decision: "approve", ...preview.resolvedArgs }, adminCtx);
    expect(result.ok).toBe(true);
    expect(reviewTask).toHaveBeenCalledWith(adminCtx, TASK, "approve", undefined);
  });
});

describe("tasks_i_gave", () => {
  it("lists group rows with their members and what waits on the user", async () => {
    const { tasksIGaveTool } = await tools();
    const member = { _id: "m1", agentName: "Sara", status: "completed", reviewStatus: "awaiting_review", canAct: true, canReview: true };
    listAssignedTasks.mockResolvedValue({
      total: 1,
      stats: { open: 1, overdue: 0, needsYou: 1 },
      items: [{ ...member, title: "Stock count", reviewRequired: true, group: { size: 2, done: 0, withdrawn: 0, needsYou: 1, members: [member] } }],
    });
    const result = await tasksIGaveTool.execute({ waitingForMe: true }, saCtx);
    expect(listAssignedTasks).toHaveBeenCalledWith(saCtx, expect.objectContaining({ reviewStatus: "awaiting_review", page: 1, limit: 10 }));
    const rows = result.data as Array<Record<string, unknown>>;
    expect(rows[0]).toMatchObject({ title: "Stock count", group: { people: 2, waitingForYou: 1 }, members: [{ taskId: "m1", waitingForYou: true }] });
    expect(result.message).toContain("/en/super-agent/tasks?tab=gave");
  });
});
