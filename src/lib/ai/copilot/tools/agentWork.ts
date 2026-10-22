import { connectDB } from "@/lib/db/mongoose";
import AgentTask, {
  CLOSED_TASK_STATUSES,
  type AgentTaskCategory,
  type AgentTaskPriority,
  type AgentTaskStatus,
} from "@/models/AgentTask";
import Interview from "@/models/Interview";
import Application from "@/models/Application";
import { isValidObjectId } from "@/lib/security/sanitize";
import { sanitizeAIInput } from "@/lib/ai/sanitize";
import { resolveAgentScope, getAgentActionCounts } from "@/lib/agents/workQueue";
import { resolveTaskLinkNames, resolveTaskLinks, validateTaskLinks, type ResolvedLinkNames } from "@/lib/agentTasks/links";
import { taskLinkHrefs } from "@/lib/agentTasks/linkHrefs";
import { updateOwnTask } from "@/lib/agentTasks/ownTask";
import { TaskError } from "@/lib/agentTasks/assigned";
import { routing } from "@/i18n/routing";
import type { CopilotTool, CopilotToolContext } from "../types";

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
      counts.newCandidates +
      counts.exhibitionRevisions;

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

/** The page's locale when the chat runs on one, so links keep the agent's language. */
function pageLocale(ctx: CopilotToolContext): string {
  const fromPage = ctx.currentPage?.split("/")[1];
  return routing.locales.find((l) => l === fromPage) ?? ctx.locale;
}

const STATUS_WORD: Record<AgentTaskStatus, string> = {
  pending: "pending",
  in_progress: "in progress",
  completed: "completed",
  failed: "failed",
};

export const myTasksTool: CopilotTool<{ status?: AgentTaskStatus; due?: "overdue" | "today"; limit?: number }> = {
  name: "my_tasks",
  description:
    "List the agent's own tasks, optionally only the overdue ones or those due today. Each row carries the candidate / job / employer it is linked to, with a url to open each. Use this to get a real taskId before update_task_status.",
  resource: "tasks",
  action: "read",
  roles: ["agent"],
  mutates: false,
  parameters: {
    status: {
      type: "string",
      description: "Filter by task status",
      optional: true,
      enum: ["pending", "in_progress", "completed", "failed"],
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
      if (!args.status) filter.status = { $nin: CLOSED_TASK_STATUSES };
    } else if (args.due === "today") {
      const endOfToday = new Date();
      endOfToday.setHours(23, 59, 59, 999);
      filter.dueDate = { $ne: null, $lte: endOfToday };
      if (!args.status) filter.status = { $nin: CLOSED_TASK_STATUSES };
    }

    const tasks = await AgentTask.find(filter)
      .select("title priority status dueDate category links assignedBy reviewStatus")
      .sort({ dueDate: 1, createdAt: -1 })
      .limit(Math.min(args.limit ?? 10, 25))
      .lean();
    const links = await resolveTaskLinks(ctx, tasks);
    const locale = pageLocale(ctx);

    const rows = tasks.map((task) => {
      const linked = links.get(String(task._id));
      const hrefs = taskLinkHrefs(locale, linked);
      return {
        taskId: String(task._id),
        title: task.title,
        priority: task.priority,
        status: task.status,
        dueDate: task.dueDate,
        category: task.category,
        overdue: Boolean(task.dueDate && new Date(task.dueDate) < new Date() && !CLOSED_TASK_STATUSES.includes(task.status)),
        // Given by a super agent / admin: closing it sends it to them for review.
        ...(task.assignedBy?.userId ? { assignedBy: task.assignedBy.role, reviewStatus: task.reviewStatus ?? "none" } : {}),
        ...(linked?.candidate ? { candidate: { name: linked.candidate.name, url: hrefs.candidate } } : {}),
        ...(linked?.job ? { job: { title: linked.job.title, url: hrefs.job } } : {}),
        ...(linked?.employer ? { employer: { name: linked.employer.name, url: hrefs.employer } } : {}),
      };
    });
    return { ok: true, message: `Found ${rows.length} task(s).`, data: rows };
  },
};

type CreateTaskArgs = {
  title: string;
  description?: string;
  priority?: AgentTaskPriority;
  category?: AgentTaskCategory;
  dueInDays?: number;
  candidate?: string;
  job?: string;
  employer?: string;
  /* Pinned by the preview (resolvedArgs), never sent by the model. */
  candidateId?: string;
  jobId?: string;
  employerId?: string;
  linkSummary?: string;
};

async function resolveLinks(args: CreateTaskArgs, ctx: CopilotToolContext): Promise<ResolvedLinkNames> {
  if (!args.candidate?.trim() && !args.job?.trim() && !args.employer?.trim()) return { ok: true, summary: "" };
  return resolveTaskLinkNames(ctx, { candidate: args.candidate, job: args.job, employer: args.employer });
}

export const createTaskTool: CopilotTool<CreateTaskArgs> = {
  name: "create_task",
  description:
    "Add a task to the agent's own to-do list — use for any task, to-do, follow-up, reminder, call, meeting or document chase the agent asks for (never create_lead). It can be linked to the candidate, job and/or employer it is about (by name, title or email as the agent said it); the task then opens them directly.",
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
    candidate: { type: "string", description: "Candidate the task is about: their name or email", optional: true, maxLength: 120 },
    job: { type: "string", description: "Job the task is about: its title", optional: true, maxLength: 200 },
    employer: { type: "string", description: "Employer the task is about: the company name", optional: true, maxLength: 120 },
  },
  summarize: (args) => `Create task "${args.title}"${args.linkSummary ? ` — linked to ${args.linkSummary}` : ""}`,
  preview: async (args, ctx) => {
    await connectDB();
    const linked = await resolveLinks(args, ctx);
    if (!linked.ok) return { summary: "", blocker: linked.blocker };
    return {
      summary: linked.summary ? `The task will link to ${linked.summary}.` : "A task with no linked records.",
      resolvedArgs: {
        ...(linked.candidateId ? { candidateId: linked.candidateId } : {}),
        ...(linked.jobId ? { jobId: linked.jobId } : {}),
        ...(linked.employerId ? { employerId: linked.employerId } : {}),
        ...(linked.summary ? { linkSummary: linked.summary } : {}),
      },
    };
  },
  execute: async (args, ctx) => {
    await connectDB();
    // The ids the card showed; resolved again only if the preview never ran.
    const linked: ResolvedLinkNames = args.candidateId || args.jobId || args.employerId
      ? { ok: true, candidateId: args.candidateId, jobId: args.jobId, employerId: args.employerId, summary: args.linkSummary ?? "" }
      : await resolveLinks(args, ctx);
    if (!linked.ok) return { ok: false, message: linked.blocker };
    let links;
    try {
      // Checked again at write time: the agent's reach may have changed since the card.
      links = await validateTaskLinks(ctx, { candidateId: linked.candidateId, jobId: linked.jobId, employerId: linked.employerId });
    } catch (err) {
      if (err instanceof TaskError) return { ok: false, message: err.message };
      throw err;
    }

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
      ...(links ? { links } : {}),
      // Same first history line as a task made on the Tasks page.
      history: [{ action: "created", to: "pending", by: ctx.userId, at: new Date() }],
    });

    return {
      ok: true,
      message: `Task "${task.title}" created${linked.summary ? `, linked to ${linked.summary}` : ""}.`,
      data: { taskId: String(task._id), url: `/${pageLocale(ctx)}/agent/tasks` },
    };
  },
};

type UpdateStatusArgs = { taskId: string; status: AgentTaskStatus; note?: string; taskTitle?: string; forReview?: boolean };

export const updateTaskStatusTool: CopilotTool<UpdateStatusArgs> = {
  name: "update_task_status",
  description:
    "Change the status of one of the agent's tasks — pending, in_progress, completed or failed — with an optional note. Requires a real taskId from my_tasks. A task given by a super agent or admin goes to them for review when completed or failed.",
  resource: "tasks",
  action: "update",
  roles: ["agent"],
  mutates: true,
  parameters: {
    taskId: { type: "string", description: "The task's MongoDB _id", maxLength: 32 },
    status: { type: "string", description: "The new status", enum: ["pending", "in_progress", "completed", "failed"] },
    note: { type: "string", description: "Optional note kept in the task's history", optional: true, maxLength: 2000 },
  },
  summarize: (args) =>
    `Mark ${args.taskTitle ? `"${args.taskTitle}"` : "task"} ${STATUS_WORD[args.status] ?? args.status}${args.forReview ? " (sent for review)" : ""}`,
  preview: async (args, ctx) => {
    if (!isValidObjectId(args.taskId)) return { summary: "", blocker: "That task id is not valid. Call my_tasks for a real one." };
    await connectDB();
    const task = await AgentTask.findOne({ _id: args.taskId, userId: ctx.userId })
      .select("title status assignedBy reviewStatus")
      .lean<{ title: string; status: AgentTaskStatus; assignedBy?: { userId?: unknown }; reviewStatus?: string } | null>();
    if (!task) return { summary: "", blocker: "No task with that id on the agent's list." };
    const assigned = Boolean(task.assignedBy?.userId);
    const closing = args.status === "completed" || args.status === "failed";
    const withReviewer = task.reviewStatus === "awaiting_review" || task.reviewStatus === "approved";
    if (assigned && withReviewer) {
      return { summary: "", blocker: `"${task.title}" is with the agent's reviewer, so its status can't be changed now.` };
    }
    if (task.status === args.status && !(assigned && closing)) {
      return { summary: "", blocker: `"${task.title}" is already ${STATUS_WORD[args.status]}.` };
    }
    const forReview = assigned && closing;
    return {
      summary: `"${task.title}": ${STATUS_WORD[task.status]} → ${STATUS_WORD[args.status]}${forReview ? ". It was assigned to the agent, so this goes to the assigner for review." : "."}`,
      resolvedArgs: { taskTitle: task.title, forReview },
    };
  },
  execute: async (args, ctx) => {
    if (!isValidObjectId(args.taskId)) return { ok: false, message: "That task id is not valid." };
    await connectDB();
    try {
      // The Tasks page's own path: review for assigned tasks, a history line, the note.
      const { outcome } = await updateOwnTask(ctx.userId, args.taskId, {
        status: args.status,
        note: args.note ? sanitizeAIInput(args.note, 2000) : undefined,
      });
      const name = args.taskTitle ? `"${args.taskTitle}"` : "The task";
      return {
        ok: true,
        message: outcome === "submitted"
          ? `${name} was reported ${STATUS_WORD[args.status]} and sent for review.`
          : `${name} marked ${STATUS_WORD[args.status]}.`,
      };
    } catch (err) {
      if (err instanceof TaskError) return { ok: false, message: err.message };
      throw err;
    }
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
  updateTaskStatusTool,
  interviewsAwaitingOutcomeTool,
  recordInterviewOutcomeTool,
  newCandidatesTool,
];
