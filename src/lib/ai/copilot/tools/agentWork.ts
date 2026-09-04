import { connectDB } from "@/lib/db/mongoose";
import AgentTask, {
  type AgentTaskCategory,
  type AgentTaskPriority,
  type AgentTaskStatus,
} from "@/models/AgentTask";
import Interview from "@/models/Interview";
import Application from "@/models/Application";
import { isValidObjectId } from "@/lib/security/sanitize";
import { sanitizeAIInput } from "@/lib/ai/sanitize";
import { resolveAgentScope, getAgentActionCounts } from "@/lib/agents/workQueue";
import type { CopilotTool } from "../types";

/**
 * The rest of an agent's job, for the Copilot.
 *
 * The agent tool registry held four entries, all of them about leads, so the
 * assistant that floats on every page could act on roughly a fifth of the role:
 * it could create a lead but not a task, and could not tell the agent what was
 * overdue, record an interview outcome, or move a candidate along. These cover
 * the remaining daily verbs, and read their counts through the same module the
 * dashboard queue and the nav badges use.
 */

export const myWorkQueueTool: CopilotTool<Record<string, never>> = {
  name: "my_work_queue",
  description:
    "What is waiting on this agent right now: overdue tasks, leads whose follow-up date has passed, interviews with no outcome recorded, offers awaiting a candidate reply, and untriaged applications. Call this first for any 'what should I do', 'what's overdue' or 'what's urgent' question.",
  resource: "tasks",
  action: "read",
  roles: ["agent"],
  mutates: false,
  parameters: {},
  summarize: () => "Check my work queue",
  execute: async (_args, ctx) => {
    await connectDB();
    const scope = await resolveAgentScope(ctx.userId);
    if (!scope) return { ok: false, message: "No agent profile found for this account." };

    const counts = await getAgentActionCounts(scope);
    const total =
      counts.overdueTasks +
      counts.dueFollowUps +
      counts.interviewsAwaitingOutcome +
      counts.offersAwaitingResponse +
      counts.newCandidates;

    return {
      ok: true,
      message:
        total === 0
          ? "Nothing is overdue — the queue is clear."
          : `${total} item(s) need attention.`,
      data: counts,
    };
  },
};

export const myTasksTool: CopilotTool<{ status?: AgentTaskStatus; due?: "overdue" | "today"; limit?: number }> = {
  name: "my_tasks",
  description:
    "List the agent's own tasks, optionally only the overdue ones or those due today. Use this to get a real taskId before complete_task.",
  resource: "tasks",
  action: "read",
  roles: ["agent"],
  mutates: false,
  parameters: {
    status: {
      type: "string",
      description: "Filter by task status",
      optional: true,
      enum: ["pending", "in_progress", "completed"],
    },
    due: {
      type: "string",
      description: "Narrow to overdue tasks or tasks due today",
      optional: true,
      enum: ["overdue", "today"],
    },
    limit: { type: "number", description: "Max results (default 10)", optional: true, min: 1, max: 25 },
  },
  summarize: () => "List my tasks",
  execute: async (args, ctx) => {
    await connectDB();
    const filter: Record<string, unknown> = { userId: ctx.userId };
    if (args.status) filter.status = args.status;
    if (args.due === "overdue") {
      filter.dueDate = { $ne: null, $lt: new Date() };
      if (!args.status) filter.status = { $ne: "completed" };
    } else if (args.due === "today") {
      const endOfToday = new Date();
      endOfToday.setHours(23, 59, 59, 999);
      filter.dueDate = { $ne: null, $lte: endOfToday };
      if (!args.status) filter.status = { $ne: "completed" };
    }

    const tasks = await AgentTask.find(filter)
      .select("title priority status dueDate category")
      .sort({ dueDate: 1, createdAt: -1 })
      .limit(Math.min(args.limit ?? 10, 25))
      .lean();

    const rows = tasks.map((task) => ({
      taskId: String(task._id),
      title: task.title,
      priority: task.priority,
      status: task.status,
      dueDate: task.dueDate,
      category: task.category,
      overdue: Boolean(task.dueDate && new Date(task.dueDate) < new Date() && task.status !== "completed"),
    }));
    return { ok: true, message: `Found ${rows.length} task(s).`, data: rows };
  },
};

export const createTaskTool: CopilotTool<{
  title: string;
  description?: string;
  priority?: AgentTaskPriority;
  category?: AgentTaskCategory;
  dueInDays?: number;
}> = {
  name: "create_task",
  description:
    "Add a task to the agent's own to-do list — a follow-up, a call, a meeting or a document chase.",
  resource: "tasks",
  action: "create",
  roles: ["agent"],
  mutates: true,
  parameters: {
    title: { type: "string", description: "What needs doing", maxLength: 200 },
    description: { type: "string", description: "Extra detail", optional: true, maxLength: 2000 },
    priority: {
      type: "string",
      description: "Task priority (default medium)",
      optional: true,
      enum: ["high", "medium", "low"],
    },
    category: {
      type: "string",
      description: "Task category (default follow_up)",
      optional: true,
      enum: ["follow_up", "call", "meeting", "document", "other"],
    },
    dueInDays: {
      type: "number",
      description: "Due this many days from now",
      optional: true,
      min: 0,
      max: 365,
    },
  },
  summarize: (args) => `Create task "${args.title}"`,
  execute: async (args, ctx) => {
    await connectDB();
    let dueDate: Date | undefined;
    if (typeof args.dueInDays === "number") {
      dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + args.dueInDays);
      dueDate.setHours(23, 59, 59, 999);
    }

    const task = await AgentTask.create({
      userId: ctx.userId,
      title: sanitizeAIInput(args.title, 200),
      description: args.description ? sanitizeAIInput(args.description, 2000) : undefined,
      priority: args.priority ?? "medium",
      category: args.category ?? "follow_up",
      dueDate,
    });

    return { ok: true, message: `Task "${task.title}" created.`, data: { taskId: String(task._id) } };
  },
};

export const completeTaskTool: CopilotTool<{ taskId: string }> = {
  name: "complete_task",
  description: "Mark one of the agent's tasks as completed. Requires a real taskId from my_tasks.",
  resource: "tasks",
  action: "update",
  roles: ["agent"],
  mutates: true,
  parameters: {
    taskId: { type: "string", description: "The task's MongoDB _id", maxLength: 32 },
  },
  summarize: () => "Mark task completed",
  execute: async (args, ctx) => {
    if (!isValidObjectId(args.taskId)) return { ok: false, message: "That task id is not valid." };
    await connectDB();
    // Scoped by userId as well as id: a task belongs to one agent, and an id
    // guessed or hallucinated by the model must not reach anyone else's list.
    const task = await AgentTask.findOne({ _id: args.taskId, userId: ctx.userId });
    if (!task) return { ok: false, message: "No task with that id on your list." };
    if (task.status === "completed") {
      return { ok: true, message: `"${task.title}" was already completed.` };
    }
    task.status = "completed";
    await task.save();
    return { ok: true, message: `"${task.title}" marked completed.` };
  },
};

export const interviewsAwaitingOutcomeTool: CopilotTool<{ limit?: number }> = {
  name: "interviews_awaiting_outcome",
  description:
    "List interviews in the agent's portfolio that have already happened and still have no outcome recorded. Use this to get a real interviewId before record_interview_outcome.",
  resource: "interviews",
  action: "read",
  roles: ["agent"],
  mutates: false,
  parameters: {
    limit: { type: "number", description: "Max results (default 10)", optional: true, min: 1, max: 25 },
  },
  summarize: () => "List interviews awaiting an outcome",
  execute: async (args, ctx) => {
    await connectDB();
    const scope = await resolveAgentScope(ctx.userId);
    if (!scope) return { ok: false, message: "No agent profile found for this account." };
    if (!scope.portfolioJobIds.length) {
      return { ok: true, message: "No jobs in your portfolio yet.", data: [] };
    }

    const interviews = await Interview.find({
      jobId: { $in: scope.portfolioJobIds },
      scheduledAt: { $lt: new Date() },
      outcome: { $in: [null, ""] },
      status: { $nin: ["cancelled", "rescheduled"] },
    })
      .select("scheduledAt status jobId jobSeekerId")
      .populate("jobSeekerId", "fullName")
      .populate("jobId", "title")
      .sort({ scheduledAt: 1 })
      .limit(Math.min(args.limit ?? 10, 25))
      .lean();

    const rows = interviews.map((iv) => {
      const row = iv as Record<string, unknown>;
      return {
        interviewId: String(row._id),
        candidate: (row.jobSeekerId as { fullName?: string } | undefined)?.fullName ?? "",
        job: (row.jobId as { title?: string } | undefined)?.title ?? "",
        scheduledAt: row.scheduledAt,
      };
    });
    return { ok: true, message: `Found ${rows.length} interview(s) with no outcome.`, data: rows };
  },
};

export const recordInterviewOutcomeTool: CopilotTool<{
  interviewId: string;
  outcome: string;
  notes?: string;
}> = {
  name: "record_interview_outcome",
  description:
    "Record how an interview went. Requires a real interviewId from interviews_awaiting_outcome.",
  resource: "interviews",
  action: "update",
  roles: ["agent"],
  mutates: true,
  parameters: {
    interviewId: { type: "string", description: "The interview's MongoDB _id", maxLength: 32 },
    outcome: {
      type: "string",
      description: "How the interview went",
      enum: ["passed", "failed", "hold", "no_show"],
    },
    notes: { type: "string", description: "Interview notes", optional: true, maxLength: 2000 },
  },
  summarize: (args) => `Record interview outcome "${args.outcome}"`,
  execute: async (args, ctx) => {
    if (!isValidObjectId(args.interviewId)) {
      return { ok: false, message: "That interview id is not valid." };
    }
    await connectDB();
    const scope = await resolveAgentScope(ctx.userId);
    if (!scope) return { ok: false, message: "No agent profile found for this account." };

    // Portfolio-scoped, not id-only: an agent may only write outcomes for
    // interviews on jobs they actually hold.
    const interview = await Interview.findOne({
      _id: args.interviewId,
      jobId: { $in: scope.portfolioJobIds },
    });
    if (!interview) {
      return { ok: false, message: "No interview with that id in your portfolio." };
    }

    interview.outcome = args.outcome as typeof interview.outcome;
    if (args.notes) interview.notes = sanitizeAIInput(args.notes, 2000);
    if (interview.status !== "completed") interview.status = "completed";
    await interview.save();

    return { ok: true, message: `Interview outcome recorded as "${args.outcome}".` };
  },
};

export const newCandidatesTool: CopilotTool<{ limit?: number }> = {
  name: "new_candidates",
  description:
    "List applications on the agent's jobs that nobody has triaged yet (status 'applied'), newest first, with AI match scores so they can be ranked.",
  resource: "applications",
  action: "read",
  roles: ["agent"],
  mutates: false,
  parameters: {
    limit: { type: "number", description: "Max results (default 10)", optional: true, min: 1, max: 25 },
  },
  summarize: () => "List untriaged candidates",
  execute: async (args, ctx) => {
    await connectDB();
    const scope = await resolveAgentScope(ctx.userId);
    if (!scope) return { ok: false, message: "No agent profile found for this account." };
    if (!scope.portfolioJobIds.length) {
      return { ok: true, message: "No jobs in your portfolio yet.", data: [] };
    }

    const applications = await Application.find({
      jobId: { $in: scope.portfolioJobIds },
      status: "applied",
    })
      .select("aiMatchScore createdAt jobId jobSeekerId")
      .populate("jobId", "title")
      .populate({ path: "jobSeekerId", select: "userId", populate: { path: "userId", select: "name" } })
      .sort({ aiMatchScore: -1, createdAt: -1 })
      .limit(Math.min(args.limit ?? 10, 25))
      .lean();

    const rows = applications.map((app) => {
      const row = app as Record<string, unknown>;
      const seeker = row.jobSeekerId as { userId?: { name?: string } } | undefined;
      return {
        applicationId: String(row._id),
        candidate: seeker?.userId?.name ?? "",
        job: (row.jobId as { title?: string } | undefined)?.title ?? "",
        matchScore: row.aiMatchScore ?? null,
        appliedAt: row.createdAt,
      };
    });
    return { ok: true, message: `Found ${rows.length} untriaged application(s).`, data: rows };
  },
};

export const agentWorkTools = [
  myWorkQueueTool,
  myTasksTool,
  createTaskTool,
  completeTaskTool,
  interviewsAwaitingOutcomeTool,
  recordInterviewOutcomeTool,
  newCandidatesTool,
];
