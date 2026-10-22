/**
 * @jest-environment node
 */
import type { CopilotToolContext } from "@/lib/ai/copilot/types";

/**
 * The agent Copilot's task tools follow the Tasks page's rules:
 *  - update_task_status goes through updateOwnTask, so an assigned task closed
 *    from the chat is sent for review (it used to be marked completed
 *    directly, skipping the reviewer and the history)
 *  - create_task writes the "created" history line and the links the preview
 *    resolved, re-checked against the agent's reach at write time
 */

const AGENT = "64b0000000000000000000a1";
const TASK = "64b0000000000000000000c1";
const JOB = "64b0000000000000000000d1";
const EMP = "64b0000000000000000000e1";
const SEEKER = "64b0000000000000000000f1";

const ctx = { userId: AGENT, role: "agent", locale: "en", permissionMode: "role_default", currentPage: "/ar/agent/tasks" } as unknown as CopilotToolContext;

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));

const submitAssignedTask = jest.fn(async () => ({ _id: TASK }));
jest.mock("@/lib/agentTasks/assigned", () => ({
  ...jest.requireActual("@/lib/agentTasks/assigned"),
  submitAssignedTask: (...a: unknown[]) => submitAssignedTask(...(a as [])),
}));

const resolveTaskLinkNames = jest.fn();
const validateTaskLinks = jest.fn();
const resolveTaskLinks = jest.fn(async () => new Map());
jest.mock("@/lib/agentTasks/links", () => ({
  resolveTaskLinkNames: (...a: unknown[]) => resolveTaskLinkNames(...a),
  validateTaskLinks: (...a: unknown[]) => validateTaskLinks(...a),
  resolveTaskLinks: (...a: unknown[]) => resolveTaskLinks(...(a as [])),
}));

const taskFindOne = jest.fn();
const taskUpdate = jest.fn(async () => ({ _id: TASK }));
const taskCreate = jest.fn(async (d: Record<string, unknown>) => ({ _id: TASK, ...d }));
const taskFind = jest.fn();
jest.mock("@/models/AgentTask", () => ({
  __esModule: true,
  default: {
    findOne: (...a: unknown[]) => ({ select: () => ({ lean: async () => taskFindOne(...a) }) }),
    findOneAndUpdate: (...a: unknown[]) => taskUpdate(...(a as [])),
    create: (d: Record<string, unknown>) => taskCreate(d),
    find: (...a: unknown[]) => taskFind(...a),
  },
  CLOSED_TASK_STATUSES: ["completed", "failed"],
}));
jest.mock("@/models/Interview", () => ({ __esModule: true, default: {} }));
jest.mock("@/models/Application", () => ({ __esModule: true, default: {} }));
jest.mock("@/lib/agents/workQueue", () => ({ resolveAgentScope: jest.fn(), getAgentActionCounts: jest.fn() }));

async function tools() {
  return import("@/lib/ai/copilot/tools/agentWork");
}

const assigned = { title: "Call the employer", status: "in_progress", assignedBy: { userId: "sa" }, reviewStatus: "none" };
const personal = { title: "Chase Sara's documents", status: "pending" };

beforeEach(() => jest.clearAllMocks());

describe("update_task_status", () => {
  it("sends an assigned task for review instead of closing it", async () => {
    const { updateTaskStatusTool } = await tools();
    taskFindOne.mockResolvedValue(assigned);
    const preview = await updateTaskStatusTool.preview!({ taskId: TASK, status: "completed" }, ctx);
    expect(preview.blocker).toBeUndefined();
    expect(preview.summary).toContain("review");
    expect(preview.resolvedArgs).toEqual({ taskTitle: "Call the employer", forReview: true });

    const result = await updateTaskStatusTool.execute({ taskId: TASK, status: "completed", note: "Spoke to HR", ...preview.resolvedArgs }, ctx);
    expect(result.ok).toBe(true);
    expect(result.message).toContain("sent for review");
    expect(submitAssignedTask).toHaveBeenCalledWith(AGENT, TASK, "completed", "Spoke to HR");
    expect(taskUpdate).not.toHaveBeenCalled();
  });

  it("closes a personal task with a history line and the note", async () => {
    const { updateTaskStatusTool } = await tools();
    taskFindOne.mockResolvedValue(personal);
    const result = await updateTaskStatusTool.execute({ taskId: TASK, status: "failed", note: "Number disconnected" }, ctx);
    expect(result.ok).toBe(true);
    const update = (taskUpdate.mock.calls[0] as unknown[])[1] as { $set: Record<string, unknown>; $push: { history: { $each: Array<Record<string, unknown>> } } };
    expect(update.$set).toMatchObject({ status: "failed", completionNote: "Number disconnected" });
    expect(update.$push.history.$each[0]).toMatchObject({ action: "status", from: "pending", to: "failed", note: "Number disconnected" });
  });

  it("won't show a card for a task that is with the reviewer", async () => {
    const { updateTaskStatusTool } = await tools();
    taskFindOne.mockResolvedValue({ ...assigned, reviewStatus: "awaiting_review" });
    const preview = await updateTaskStatusTool.preview!({ taskId: TASK, status: "in_progress" }, ctx);
    expect(preview.blocker).toMatch(/reviewer/);
  });

  it("won't show a card for a status the task already has", async () => {
    const { updateTaskStatusTool } = await tools();
    taskFindOne.mockResolvedValue(personal);
    const preview = await updateTaskStatusTool.preview!({ taskId: TASK, status: "pending" }, ctx);
    expect(preview.blocker).toMatch(/already pending/);
  });

  it("refuses someone else's task", async () => {
    const { updateTaskStatusTool } = await tools();
    taskFindOne.mockResolvedValue(null);
    expect((await updateTaskStatusTool.preview!({ taskId: TASK, status: "completed" }, ctx)).blocker).toMatch(/No task/);
    expect(taskFindOne).toHaveBeenCalledWith({ _id: TASK, userId: AGENT });
  });
});

describe("create_task", () => {
  it("pins the records the preview resolved and stores them with a created line", async () => {
    const { createTaskTool } = await tools();
    resolveTaskLinkNames.mockResolvedValue({ ok: true, candidateId: SEEKER, jobId: JOB, employerId: EMP, summary: "candidate Sara, job Driver" });
    const preview = await createTaskTool.preview!({ title: "Follow up", candidate: "Sara", job: "Driver" }, ctx);
    expect(preview.resolvedArgs).toEqual({ candidateId: SEEKER, jobId: JOB, employerId: EMP, linkSummary: "candidate Sara, job Driver" });

    validateTaskLinks.mockResolvedValue({ candidateId: SEEKER, jobId: JOB, employerId: EMP });
    const result = await createTaskTool.execute({ title: "Follow up", candidate: "Sara", job: "Driver", ...preview.resolvedArgs }, ctx);
    expect(result.ok).toBe(true);
    // The card's ids, not a fresh name lookup.
    expect(resolveTaskLinkNames).toHaveBeenCalledTimes(1);
    expect(validateTaskLinks).toHaveBeenCalledWith(ctx, { candidateId: SEEKER, jobId: JOB, employerId: EMP });
    const doc = taskCreate.mock.calls[0][0];
    expect(doc.links).toEqual({ candidateId: SEEKER, jobId: JOB, employerId: EMP });
    expect((doc.history as Array<Record<string, unknown>>)[0]).toMatchObject({ action: "created", to: "pending", by: AGENT });
    expect(result.data).toMatchObject({ url: "/ar/agent/tasks" });
  });

  it("hands an ambiguous name back to the model instead of showing a card", async () => {
    const { createTaskTool } = await tools();
    resolveTaskLinkNames.mockResolvedValue({ ok: false, blocker: 'Several jobs match "QA tester"' });
    const preview = await createTaskTool.preview!({ title: "Follow up", job: "QA tester" }, ctx);
    expect(preview.blocker).toMatch(/Several jobs/);
  });

  it("doesn't write a task whose links the agent can no longer reach", async () => {
    const { createTaskTool } = await tools();
    const { TaskError } = jest.requireActual("@/lib/agentTasks/assigned");
    validateTaskLinks.mockRejectedValue(new TaskError(403, "You can't link that job."));
    const result = await createTaskTool.execute({ title: "Follow up", jobId: JOB }, ctx);
    expect(result).toEqual({ ok: false, message: "You can't link that job." });
    expect(taskCreate).not.toHaveBeenCalled();
  });

  it("creates an unlinked task without looking anything up", async () => {
    const { createTaskTool } = await tools();
    validateTaskLinks.mockResolvedValue(undefined);
    const result = await createTaskTool.execute({ title: "Call back" }, ctx);
    expect(result.ok).toBe(true);
    expect(resolveTaskLinkNames).not.toHaveBeenCalled();
    expect(taskCreate.mock.calls[0][0]).not.toHaveProperty("links");
  });
});

describe("pickLinkOption", () => {
  const { pickLinkOption } = jest.requireActual("@/lib/agentTasks/links") as typeof import("@/lib/agentTasks/links");
  const opt = (label: string, sublabel?: string) => ({ value: label, label, sublabel });

  it("takes the one exact name among looser matches", () => {
    const r = pickLinkOption("job", "QA tester", [opt("QA tester"), opt("Senior QA tester")]);
    expect(r).toEqual({ option: opt("QA tester") });
  });

  it("matches a candidate by email", () => {
    const r = pickLinkOption("candidate", "sara@x.com", [opt("Sara Ali", "sara@x.com"), opt("Sara Khan", "khan@x.com")]);
    expect(r).toEqual({ option: opt("Sara Ali", "sara@x.com") });
  });

  it("matches a same-named company on its name, then asks which one", () => {
    const r = pickLinkOption("employer", "Beta", [opt("Beta · a@x.com"), opt("Beta · b@x.com")]);
    expect("blocker" in r && r.blocker).toMatch(/Several employers match "Beta": Beta · a@x.com; Beta · b@x.com/);
  });

  it("says when nothing matches", () => {
    const r = pickLinkOption("job", "Pilot", []);
    expect("blocker" in r && r.blocker).toMatch(/No job matching "Pilot"/);
  });
});
