import { NextRequest, NextResponse } from "next/server";
import mongoose from "mongoose";
import { withAuth, AuthContext } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import { escapeRegex } from "@/lib/security/sanitize";
import { validateBody } from "@/lib/validators";
import { agentTaskCompleteSchema, agentTaskCreateSchema, agentTaskUpdateSchema } from "@/lib/validators/agent-tasks";
import AgentTask, { CLOSED_TASK_STATUSES } from "@/models/AgentTask";
import User from "@/models/User";
import { readTaskHistory } from "./history";
import { resolveTaskLinks, validateTaskLinks } from "./links";
import { updateOwnTask } from "./ownTask";
import { TaskError } from "./taskError";

/**
 * The caller's own task list — the same handlers behind
 *   /api/agent/tasks          (agent)
 *   /api/super-agent/my-tasks (super agent)
 *   /api/admin/my-tasks       (admin)
 *
 * Every query is pinned to `userId: ctx.userId`, so a task is only ever seen
 * or changed by the person it belongs to. Nobody, of any role, reads someone
 * else's list through these routes (another person's id answers 404). Each
 * route admits exactly one role: an admin calling /api/agent/tasks is refused
 * rather than getting an admin-owned task no page shows.
 */
export type PersonalTaskRole = "agent" | "super_agent" | "admin";

type Params = Record<string, string> | undefined;

function gate(ctx: AuthContext, role: PersonalTaskRole): NextResponse | null {
  return ctx.role === role ? null : NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

function taskErrorResponse(err: unknown): NextResponse {
  if (err instanceof TaskError) return NextResponse.json({ error: err.message }, { status: err.status });
  throw err;
}

function validId(params: Params): string | null {
  const id = params?.id;
  return id && mongoose.isValidObjectId(id) ? id : null;
}

const patchSchema = agentTaskUpdateSchema.extend({
  completionNote: agentTaskCompleteSchema.shape.completionNote,
  // Optional note on any status change; recorded in the task's history.
  note: agentTaskCompleteSchema.shape.completionNote,
});

async function listTasks(req: NextRequest, ctx: AuthContext): Promise<NextResponse> {
  const url = new URL(req.url);
  const status = url.searchParams.get("status") ?? "";
  const search = url.searchParams.get("search")?.trim() ?? "";
  const page = Math.max(parseInt(url.searchParams.get("page") ?? "1", 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") ?? "100", 10) || 100, 1), 100);

  // The dashboard queue and the nav badge both link ?due=overdue / ?due=today,
  // so these have to narrow the query server-side — the client only ever holds
  // one page of rows and could not filter the rest.
  const due = url.searchParams.get("due") ?? "";
  const priority = url.searchParams.get("priority") ?? "";
  // The calendar asks for one month of due dates at a time.
  const dueFrom = url.searchParams.get("dueFrom") ?? "";
  const dueTo = url.searchParams.get("dueTo") ?? "";
  // assigned = given by a super agent / admin; personal = the caller's own to-dos.
  const kind = url.searchParams.get("kind") ?? "";

  // Tabs: personal = own to-dos ("My tasks"), assigned = given to me ("Given to me").
  const kindMatch: Record<string, unknown> = kind === "assigned"
    ? { "assignedBy.userId": { $exists: true } }
    : kind === "personal" ? { "assignedBy.userId": { $exists: false } } : {};
  const filter: Record<string, unknown> = { userId: ctx.userId, ...kindMatch };
  // "open" = everything not closed (pending + in progress), the Open card's filter.
  if (status === "open") filter.status = { $nin: CLOSED_TASK_STATUSES };
  else if (status && status !== "all") filter.status = status;
  if (priority && priority !== "all") filter.priority = priority;
  if (search) filter.title = { $regex: escapeRegex(search), $options: "i" };
  if (due === "overdue") {
    filter.dueDate = { $ne: null, $lt: new Date() };
    if (!filter.status) filter.status = { $nin: CLOSED_TASK_STATUSES };
  } else if (due === "today") {
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);
    filter.dueDate = { $ne: null, $lte: endOfToday };
    if (!filter.status) filter.status = { $nin: CLOSED_TASK_STATUSES };
  } else if (dueFrom || dueTo) {
    const range: Record<string, Date> = {};
    if (dueFrom) range.$gte = new Date(dueFrom);
    if (dueTo) range.$lte = new Date(dueTo);
    filter.dueDate = range;
  }

  const now = new Date();
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const mine = { userId: ctx.userId, ...kindMatch };
  const [items, total, statusRows, overdue, dueToday, doneThisWeek] = await Promise.all([
    AgentTask.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    AgentTask.countDocuments(filter),
    AgentTask.aggregate<{ _id: string; count: number }>([
      { $match: { userId: new mongoose.Types.ObjectId(ctx.userId), ...kindMatch } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
    AgentTask.countDocuments({ ...mine, dueDate: { $lt: now }, status: { $nin: CLOSED_TASK_STATUSES } }),
    AgentTask.countDocuments({ ...mine, dueDate: { $gte: new Date(new Date(now).setHours(0, 0, 0, 0)), $lte: endOfToday }, status: { $nin: CLOSED_TASK_STATUSES } }),
    AgentTask.countDocuments({ ...mine, status: "completed", updatedAt: { $gte: weekAgo } }),
  ]);
  const statusCounts = Object.fromEntries(statusRows.map((row) => [row._id, row.count]));

  const assignerIds = [...new Set(items.map((t) => String(t.assignedBy?.userId ?? "")).filter(Boolean))];
  const assigners = assignerIds.length
    ? await User.find({ _id: { $in: assignerIds } }).select("_id name").lean<Array<{ _id: unknown; name?: string }>>()
    : [];
  const assignerNames = new Map(assigners.map((u) => [String(u._id), u.name ?? ""]));
  const links = await resolveTaskLinks(ctx, items);

  return NextResponse.json({
    total,
    page,
    totalPages: Math.max(Math.ceil(total / limit), 1),
    stats: {
      open: (statusCounts.pending ?? 0) + (statusCounts.in_progress ?? 0),
      pending: statusCounts.pending ?? 0,
      inProgress: statusCounts.in_progress ?? 0,
      completed: statusCounts.completed ?? 0,
      failed: statusCounts.failed ?? 0,
      overdue,
      dueToday,
      doneThisWeek,
    },
    items: items.map((t) => ({
      _id: String(t._id),
      title: t.title,
      description: t.description,
      priority: t.priority,
      status: t.status,
      dueDate: t.dueDate,
      category: t.category,
      relatedTo: t.relatedTo,
      links: links.get(String(t._id)),
      createdAt: t.createdAt,
      completionNote: t.completionNote,
      ...(t.assignedBy?.userId
        ? {
            assignedBy: { name: assignerNames.get(String(t.assignedBy.userId)) ?? "", role: t.assignedBy.role },
            reviewStatus: t.reviewStatus ?? "none",
            reviewComment: t.reviewComment,
            reviewRequired: t.reviewRequired !== false,
          }
        : {}),
    })),
  });
}

async function createTask(req: NextRequest, ctx: AuthContext): Promise<NextResponse> {
  const body = await validateBody(req, agentTaskCreateSchema);
  let links;
  try {
    links = await validateTaskLinks(ctx, { candidateId: body.candidateId, jobId: body.jobId, employerId: body.employerId });
  } catch (err) {
    return taskErrorResponse(err);
  }
  const task = await AgentTask.create({
    userId: ctx.userId,
    title: body.title,
    description: body.description,
    priority: body.priority,
    category: body.category,
    dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
    ...(links ? { links } : {}),
    history: [{ action: "created", to: "pending", by: ctx.userId, at: new Date() }],
  });
  return NextResponse.json({ success: true, task });
}

async function updateTask(req: NextRequest, ctx: AuthContext, params: Params): Promise<NextResponse> {
  const id = validId(params);
  if (!id) return NextResponse.json({ error: "Invalid task ID" }, { status: 400 });
  const body = await validateBody(req, patchSchema);
  try {
    const { task } = await updateOwnTask(ctx.userId, id, { ...body, note: body.note || body.completionNote || undefined });
    return NextResponse.json({ success: true, task });
  } catch (err) {
    return taskErrorResponse(err);
  }
}

async function taskHistory(ctx: AuthContext, params: Params): Promise<NextResponse> {
  const id = validId(params);
  if (!id) return NextResponse.json({ error: "Invalid task ID" }, { status: 400 });
  const task = await AgentTask.findOne({ _id: id, userId: ctx.userId })
    .select("userId createdAt assignedBy history")
    .lean<Parameters<typeof readTaskHistory>[0]>();
  if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });
  return NextResponse.json({ history: await readTaskHistory(task) });
}

async function deleteTask(ctx: AuthContext, params: Params): Promise<NextResponse> {
  // Same check PATCH does — without it a malformed id reached Mongoose and threw
  // CastError, surfacing as a 500 instead of a 400.
  const id = validId(params);
  if (!id) return NextResponse.json({ error: "Invalid task ID" }, { status: 400 });
  // Only personal to-dos can be deleted; an assigned task belongs to whoever gave it.
  const result = await AgentTask.deleteOne({ _id: id, userId: ctx.userId, "assignedBy.userId": { $exists: false } });
  if (result.deletedCount === 0) {
    const assigned = await AgentTask.exists({ _id: id, userId: ctx.userId });
    return assigned
      ? NextResponse.json({ error: "This task was assigned to you, so it can't be deleted." }, { status: 403 })
      : NextResponse.json({ error: "Task not found" }, { status: 404 });
  }
  return NextResponse.json({ success: true });
}

type Handler = (req: NextRequest, ctx: AuthContext, params: Params) => Promise<NextResponse>;

function guarded(role: PersonalTaskRole, handler: Handler) {
  return withAuth(async (req: NextRequest, ctx: AuthContext, params?: Record<string, string>) => {
    const denied = gate(ctx, role);
    if (denied) return denied;
    await connectDB();
    return handler(req, ctx, params);
  });
}

/** GET (list) + POST (create) for `/…/tasks`, and GET (history) + PATCH + DELETE for `/…/tasks/[id]`. */
export function personalTaskRoutes(role: PersonalTaskRole) {
  return {
    list: guarded(role, (req, ctx) => listTasks(req, ctx)),
    create: guarded(role, (req, ctx) => createTask(req, ctx)),
    history: guarded(role, (_req, ctx, params) => taskHistory(ctx, params)),
    update: guarded(role, (req, ctx, params) => updateTask(req, ctx, params)),
    remove: guarded(role, (_req, ctx, params) => deleteTask(ctx, params)),
  };
}
