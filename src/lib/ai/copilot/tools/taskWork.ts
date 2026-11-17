import { connectDB } from "@/lib/db/mongoose";
import AgentTask, { CLOSED_TASK_STATUSES } from "@/models/AgentTask";
import { isValidObjectId } from "@/lib/security/sanitize";
import { sanitizeAIInput } from "@/lib/ai/sanitize";
import { assignTasks, assigneeRoleOf, loadActionableTask, reviewTask, TaskError } from "@/lib/agentTasks/assigned";
import { listAssignedTasks } from "@/lib/agentTasks/assignedList";
import { performTaskAction } from "@/lib/agentTasks/assignedActions";
import { nameOf } from "@/lib/agentTasks/taskNotify";
import { taskActionSchema } from "@/lib/validators/agent-tasks";
import { routing } from "@/i18n/routing";
import { ownTasksPath } from "./agentWork";
import { assignablePool, dueInDays, matchPeople, matchPerson, peopleSummary } from "./taskPeople";
import type { CopilotTool, CopilotToolContext, CopilotToolPreview } from "../types";

/**
 * Tasks in the Copilot chat beyond the caller's own status changes: delete a
 * to-do, and for admins and super agents give tasks, see what they gave,
 * withdraw / re-date / hand to someone else, and approve or send back a
 * report. Every write goes through the same functions the Tasks page calls
 * (assignTasks, performTaskAction, reviewTask), so the chat gets exactly the
 * page's permission checks — the tool's role list only decides what the model
 * sees.
 */

const GIVER_ROLES: CopilotToolContext["role"][] = ["admin", "super_agent"];

function pageLocale(ctx: CopilotToolContext): string {
  const fromPage = ctx.currentPage?.split("/")[1];
  return routing.locales.find((l) => l === fromPage) ?? ctx.locale;
}

const gaveUrl = (ctx: CopilotToolContext): string => `/${pageLocale(ctx)}${ownTasksPath(ctx.role)}?tab=gave`;

/** A TaskError becomes the message the user sees; anything else is a real failure. */
function taskFailure(err: unknown): { ok: false; message: string } {
  if (err instanceof TaskError) return { ok: false, message: err.message };
  throw err;
}

function blockedBy(err: unknown): CopilotToolPreview {
  if (err instanceof TaskError) return { summary: "", blocker: err.message };
  throw err;
}

/* ─── delete_task ─────────────────────────────────────────────────────── */

export const deleteTaskTool: CopilotTool<{ taskId: string; taskTitle?: string }> = {
  name: "delete_task",
  description:
    "Delete one of the user's own to-dos for good. Only tasks they made for themselves — a task someone gave them can't be deleted (the giver withdraws it). Requires a real taskId from my_tasks.",
  resource: "tasks",
  action: "delete",
  roles: ["agent", "super_agent", "admin"],
  mutates: true,
  parameters: { taskId: { type: "string", description: "The task's MongoDB _id", maxLength: 32 } },
  summarize: (args) => `Delete ${args.taskTitle ? `"${args.taskTitle}"` : "task"}`,
  preview: async (args, ctx) => {
    if (!isValidObjectId(args.taskId)) return { summary: "", blocker: "That task id is not valid. Call my_tasks for a real one." };
    await connectDB();
    const task = await AgentTask.findOne({ _id: args.taskId, userId: ctx.userId })
      .select("title assignedBy")
      .lean<{ title: string; assignedBy?: { userId?: unknown } } | null>();
    if (!task) return { summary: "", blocker: "No task with that id on your list." };
    if (task.assignedBy?.userId) {
      return { summary: "", blocker: `"${task.title}" was given to you, so it can't be deleted. Whoever gave it can withdraw it.` };
    }
    return { summary: `"${task.title}" will be deleted. This can't be undone.`, resolvedArgs: { taskTitle: task.title } };
  },
  execute: async (args, ctx) => {
    if (!isValidObjectId(args.taskId)) return { ok: false, message: "That task id is not valid." };
    await connectDB();
    // The Tasks page's own rule: only personal to-dos, only the owner's.
    const result = await AgentTask.deleteOne({ _id: args.taskId, userId: ctx.userId, "assignedBy.userId": { $exists: false } });
    if (result.deletedCount === 0) return { ok: false, message: "That task is not one of your own to-dos, so it was not deleted." };
    return { ok: true, message: `${args.taskTitle ? `"${args.taskTitle}"` : "The task"} was deleted.` };
  },
};

/* ─── tasks_i_gave ────────────────────────────────────────────────────── */

type GaveArgs = { status?: string; waitingForMe?: boolean; search?: string; limit?: number };

export const tasksIGaveTool: CopilotTool<GaveArgs> = {
  name: "tasks_i_gave",
  description:
    "List tasks the user gave other people (Tasks I gave), with who has each one, its status and whether it waits on the user. A task given to several people is one row with progress and a member list (each member has its own taskId). Use this to get a real taskId before change_given_task or review_task_report.",
  resource: "tasks",
  action: "read",
  roles: GIVER_ROLES,
  mutates: false,
  parameters: {
    status: {
      type: "string",
      description: "Narrow by state",
      optional: true,
      enum: ["open", "overdue", "completed", "failed", "cancelled"],
    },
    waitingForMe: { type: "boolean", description: "Only reports waiting for the user's review", optional: true },
    search: { type: "string", description: "Words in the task title", optional: true, maxLength: 100 },
    limit: { type: "number", description: "Max rows (default 10)", optional: true, min: 1, max: 25 },
  },
  summarize: () => "List tasks I gave",
  execute: async (args, ctx) => {
    await connectDB();
    const list = await listAssignedTasks(ctx, {
      status: args.status,
      reviewStatus: args.waitingForMe ? "awaiting_review" : undefined,
      search: args.search?.trim() || undefined,
      page: 1,
      limit: Math.min(args.limit ?? 10, 25),
    });
    const person = (m: { _id: string; agentName: string; status: string; reviewStatus: string; canAct: boolean; canReview: boolean }) => ({
      taskId: m._id,
      person: m.agentName,
      status: m.status,
      reviewStatus: m.reviewStatus,
      canAct: m.canAct,
      waitingForYou: m.canReview && m.reviewStatus === "awaiting_review",
    });
    const rows = list.items.map((row) => ({
      ...person(row),
      title: row.title,
      dueDate: row.dueDate,
      reviewRequired: row.reviewRequired,
      ...(row.completionNote ? { report: row.completionNote } : {}),
      ...(row.group
        ? {
            group: { people: row.group.size, done: row.group.done, withdrawn: row.group.withdrawn, waitingForYou: row.group.needsYou },
            members: row.group.members.map(person),
          }
        : {}),
    }));
    const s = list.stats;
    return {
      ok: true,
      message: `Found ${list.total} row(s). Open ${s.open}, overdue ${s.overdue}, waiting for you ${s.needsYou}. Page: ${gaveUrl(ctx)}`,
      data: rows,
    };
  },
};

/* ─── give_task ───────────────────────────────────────────────────────── */

type GiveKind = "agent" | "super_agent";

type GiveArgs = {
  title: string;
  description?: string;
  people?: string[];
  everyone?: boolean;
  assigneeKind?: GiveKind;
  throughSuperAgent?: string;
  priority?: "high" | "medium" | "low";
  dueInDays?: number;
  reviewRequired?: boolean;
  /* Pinned by the preview, never sent by the model. */
  assigneeUserIds?: string[];
  superAgentUserId?: string;
  peopleLabel?: string;
};

type Resolved = { ok: true; kind: GiveKind; ids: string[]; via?: string; label: string } | { ok: false; blocker: string };

async function resolveAssignees(args: GiveArgs, ctx: CopilotToolContext): Promise<Resolved> {
  if (ctx.role !== "admin" && ctx.role !== "super_agent") return { ok: false, blocker: "Only admins and super agents can give tasks." };
  let kind: GiveKind = args.assigneeKind === "super_agent" ? "super_agent" : "agent";
  // An admin naming people without saying which kind: names that are not
  // agents are looked up among super agents (the model often drops the kind).
  if (ctx.role === "admin" && !args.assigneeKind && !args.everyone && !args.throughSuperAgent?.trim() && args.people?.length) {
    const asAgents = matchPeople(await assignablePool(ctx, "agent"), args.people);
    if (!asAgents.ok && matchPeople(await assignablePool(ctx, "super_agent"), args.people).ok) kind = "super_agent";
  }
  if (kind === "super_agent" && ctx.role !== "admin") return { ok: false, blocker: "Super agents give tasks to their agents only." };

  let via: string | undefined;
  if (ctx.role === "admin" && kind === "agent" && args.throughSuperAgent?.trim()) {
    const sa = matchPerson(await assignablePool(ctx, "super_agent"), args.throughSuperAgent);
    if (!sa.ok) return sa;
    via = sa.people[0].userId;
  }
  const pool = await assignablePool(ctx, kind, via);
  if (pool.length === 0) return { ok: false, blocker: via ? "That super agent has no active agents on their team." : "There is nobody this user can give tasks to." };

  const wanted = (args.people ?? []).map((p) => p.trim()).filter(Boolean);
  let people = pool;
  if (!args.everyone) {
    if (wanted.length === 0) return { ok: false, blocker: "Say who the task is for, by name or email (or everyone)." };
    const m = matchPeople(pool, wanted);
    if (!m.ok) return m;
    people = m.people;
  }
  if (people.length > 100) return { ok: false, blocker: `That is ${people.length} people; a task can go to 100 at most. Narrow it down.` };
  return { ok: true, kind, ids: people.map((p) => p.userId), via, label: peopleSummary(people) };
}

export const giveTaskTool: CopilotTool<GiveArgs> = {
  name: "give_task",
  description:
    "Give a task to other people: a super agent to agents on their team; an admin to agents (directly, or through a super agent who then reviews it) or to super agents. One person or many — each gets their own copy. Use when the user says to give, assign or send a task to someone. For a task for the user themselves use create_task.",
  resource: "tasks",
  action: "create",
  roles: GIVER_ROLES,
  mutates: true,
  parameters: {
    title: { type: "string", description: "What needs doing", maxLength: 200 },
    description: { type: "string", description: "Extra detail", optional: true, maxLength: 2000 },
    people: { type: "array", items: { type: "string" }, description: "Each person's name or email, as the user said it", optional: true, maxItems: 100 },
    everyone: { type: "boolean", description: "True when the user means everyone they can give to (e.g. 'my whole team', 'all super agents')", optional: true },
    assigneeKind: {
      type: "string",
      description: "Admin only: who receives it (default agent)",
      optional: true,
      enum: ["agent", "super_agent"],
    },
    throughSuperAgent: { type: "string", description: "Admin giving agents only: the super agent it goes through, by name or email", optional: true, maxLength: 120 },
    priority: { type: "string", description: "Priority (default medium)", optional: true, enum: ["high", "medium", "low"] },
    dueInDays: { type: "number", description: "Due this many days from now", optional: true, min: 0, max: 365 },
    reviewRequired: { type: "boolean", description: "Review before it closes (default true). False: a done report closes it", optional: true },
  },
  summarize: (args) => `Give "${args.title}" to ${args.peopleLabel ?? "the people named"}`,
  preview: async (args, ctx) => {
    await connectDB();
    const r = await resolveAssignees(args, ctx);
    if (!r.ok) return { summary: "", blocker: r.blocker };
    const due = dueInDays(args.dueInDays);
    const review = args.reviewRequired === false ? "Review is off: a done report closes it." : "They report it, then you approve it or send it back.";
    return {
      summary: `${r.ids.length === 1 ? r.label : `${r.ids.length} people (${r.label}), each with their own copy`}. ${due ? `Due ${due.toDateString()}. ` : ""}${review}`,
      resolvedArgs: { assigneeUserIds: r.ids, assigneeKind: r.kind, ...(r.via ? { superAgentUserId: r.via } : {}), peopleLabel: r.label },
    };
  },
  execute: async (args, ctx) => {
    await connectDB();
    let ids = args.assigneeUserIds;
    let via = args.superAgentUserId;
    let kind: GiveKind = args.assigneeKind === "super_agent" ? "super_agent" : "agent";
    if (!ids?.length) {
      const r = await resolveAssignees(args, ctx);
      if (!r.ok) return { ok: false, message: r.blocker };
      ids = r.ids;
      via = r.via;
      kind = r.kind;
    }
    try {
      // assignTasks re-checks every person is still in the caller's reach.
      const tasks = await assignTasks(ctx, {
        assigneeRole: kind,
        assigneeUserIds: ids,
        superAgentUserId: via,
        title: sanitizeAIInput(args.title, 200),
        description: args.description ? sanitizeAIInput(args.description, 2000) : undefined,
        priority: args.priority ?? "medium",
        dueDate: dueInDays(args.dueInDays),
        reviewRequired: args.reviewRequired ?? true,
      });
      return {
        ok: true,
        message: `"${args.title}" given to ${tasks.length === 1 ? args.peopleLabel ?? "1 person" : `${tasks.length} people`}.`,
        data: { taskId: String(tasks[0]._id), count: tasks.length, url: gaveUrl(ctx) },
      };
    } catch (err) {
      return taskFailure(err);
    }
  },
};

/* ─── change_given_task ───────────────────────────────────────────────── */

type ChangeArgs = {
  taskId: string;
  action: "withdraw" | "set_due" | "reassign";
  wholeGroup?: boolean;
  dueInDays?: number;
  clearDueDate?: boolean;
  toPerson?: string;
  note?: string;
  /* Pinned by the preview. */
  taskTitle?: string;
  toUserId?: string;
  toName?: string;
};

const CHANGE_WORD = { withdraw: "Withdraw", set_due: "Change due date of", reassign: "Give to someone else:" } as const;

export const changeGivenTaskTool: CopilotTool<ChangeArgs> = {
  name: "change_given_task",
  description:
    "Change a task the user gave: withdraw it (one copy or the whole group), change its due date, or give it to someone else instead (same task, history kept, starts again). Requires a real taskId from tasks_i_gave.",
  resource: "tasks",
  action: "update",
  roles: GIVER_ROLES,
  mutates: true,
  parameters: {
    taskId: { type: "string", description: "The task's MongoDB _id (a member's own id for one person in a group)", maxLength: 32 },
    action: { type: "string", description: "What to do", enum: ["withdraw", "set_due", "reassign"] },
    wholeGroup: { type: "boolean", description: "withdraw / set_due: every open copy of a task given to several people", optional: true },
    dueInDays: { type: "number", description: "set_due: due this many days from now", optional: true, min: 0, max: 365 },
    clearDueDate: { type: "boolean", description: "set_due: remove the due date", optional: true },
    toPerson: { type: "string", description: "reassign: the new person's name or email", optional: true, maxLength: 120 },
    note: { type: "string", description: "Optional note kept in the history (withdraw / reassign)", optional: true, maxLength: 2000 },
  },
  summarize: (args) =>
    `${CHANGE_WORD[args.action]} ${args.taskTitle ? `"${args.taskTitle}"` : "task"}${args.toName ? ` → ${args.toName}` : ""}`,
  preview: async (args, ctx) => {
    await connectDB();
    let task;
    try {
      ({ task } = await loadActionableTask(ctx, args.taskId));
    } catch (err) {
      return blockedBy(err);
    }
    const group = Boolean(args.wholeGroup && task.groupId);
    const holder = await nameOf(String(task.userId));
    if (!group && CLOSED_TASK_STATUSES.includes(task.status)) {
      return { summary: "", blocker: `"${task.title}" (${holder}) is already closed, so it can't be changed.` };
    }
    const pinned = { taskTitle: task.title };
    if (args.action === "withdraw") {
      return {
        summary: group ? `Every open copy of "${task.title}" is withdrawn; done copies stay.` : `"${task.title}" is withdrawn from ${holder}. They can't work on it after this.`,
        resolvedArgs: pinned,
      };
    }
    if (args.action === "set_due") {
      if (!args.clearDueDate && typeof args.dueInDays !== "number") return { summary: "", blocker: "Say the new due date (days from now) or that it should have none." };
      const due = args.clearDueDate ? null : dueInDays(args.dueInDays);
      return { summary: `${group ? "Every open copy of " : ""}"${task.title}" will be ${due ? `due ${due.toDateString()}` : "without a due date"}.`, resolvedArgs: pinned };
    }
    if (!args.toPerson?.trim()) return { summary: "", blocker: "Say who should get the task instead." };
    const m = matchPerson(await assignablePool(ctx, assigneeRoleOf(task)), args.toPerson);
    if (!m.ok) return { summary: "", blocker: m.blocker };
    const to = m.people[0];
    if (to.userId === String(task.userId)) return { summary: "", blocker: `${holder} already has "${task.title}".` };
    return {
      summary: `"${task.title}" moves from ${holder} to ${to.name || to.email}. It starts again as not started; its history stays.`,
      resolvedArgs: { ...pinned, toUserId: to.userId, toName: to.name || to.email },
    };
  },
  execute: async (args, ctx) => {
    await connectDB();
    const scope = args.wholeGroup ? "group" : "one";
    const raw = args.action === "withdraw"
      ? { action: "withdraw", scope, note: args.note ? sanitizeAIInput(args.note, 2000) : undefined }
      : args.action === "set_due"
        ? { action: "set_due", scope, dueDate: args.clearDueDate ? null : dueInDays(args.dueInDays)?.toISOString() }
        : { action: "reassign", toUserId: args.toUserId, note: args.note ? sanitizeAIInput(args.note, 2000) : undefined };
    // The action route's own schema: same past-date and id checks as the page.
    const parsed = taskActionSchema.safeParse(raw);
    if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "That change is not valid." };
    try {
      await performTaskAction(ctx, args.taskId, parsed.data);
    } catch (err) {
      return taskFailure(err);
    }
    const name = args.taskTitle ? `"${args.taskTitle}"` : "The task";
    const done = args.action === "withdraw" ? "withdrawn" : args.action === "set_due" ? "re-dated" : `given to ${args.toName ?? "the new person"}`;
    return { ok: true, message: `${name} ${done}.`, data: { url: gaveUrl(ctx) } };
  },
};

/* ─── review_task_report ──────────────────────────────────────────────── */

type ReviewArgs = { taskId: string; decision: "approve" | "return"; comment?: string; taskTitle?: string; holder?: string };

export const reviewTaskReportTool: CopilotTool<ReviewArgs> = {
  name: "review_task_report",
  description:
    "Approve a report on a task the user gave (it closes), or send it back with a comment saying what needs to change (the person works on it again). For a failure report, approve means accepting the failure. Requires a taskId from tasks_i_gave with waitingForYou true.",
  resource: "tasks",
  action: "update",
  roles: GIVER_ROLES,
  mutates: true,
  parameters: {
    taskId: { type: "string", description: "The task's MongoDB _id", maxLength: 32 },
    decision: { type: "string", description: "approve, or return to send it back", enum: ["approve", "return"] },
    comment: { type: "string", description: "What needs to change (required to send back)", optional: true, maxLength: 2000 },
  },
  summarize: (args) =>
    `${args.decision === "approve" ? "Approve" : "Send back"} ${args.taskTitle ? `"${args.taskTitle}"` : "task"}${args.holder ? ` (${args.holder})` : ""}`,
  preview: async (args, ctx) => {
    await connectDB();
    let task;
    try {
      ({ task } = await loadActionableTask(ctx, args.taskId));
    } catch (err) {
      return blockedBy(err);
    }
    if (task.reviewStatus !== "awaiting_review") return { summary: "", blocker: `"${task.title}" has no report waiting for review.` };
    if (args.decision === "return" && !args.comment?.trim()) return { summary: "", blocker: "Say what needs to change before sending it back." };
    const holder = await nameOf(String(task.userId));
    const reported = task.status === "failed" ? "could not be done" : "done";
    const note = task.completionNote ? ` Their note: "${task.completionNote}".` : "";
    const effect = args.decision === "approve"
      ? (task.status === "failed" ? "Approving accepts the failure and closes it." : "Approving closes it.")
      : `It goes back to them to work on again, with your comment: "${args.comment?.trim()}".`;
    return { summary: `${holder} reported "${task.title}" ${reported}.${note} ${effect}`, resolvedArgs: { taskTitle: task.title, holder } };
  },
  execute: async (args, ctx) => {
    await connectDB();
    try {
      await reviewTask(ctx, args.taskId, args.decision, args.comment ? sanitizeAIInput(args.comment, 2000) : undefined);
    } catch (err) {
      return taskFailure(err);
    }
    const name = args.taskTitle ? `"${args.taskTitle}"` : "The task";
    return { ok: true, message: args.decision === "approve" ? `${name} approved and closed.` : `${name} sent back.`, data: { url: gaveUrl(ctx) } };
  },
};

export const taskWorkTools = [deleteTaskTool, tasksIGaveTool, giveTaskTool, changeGivenTaskTool, reviewTaskReportTool];
