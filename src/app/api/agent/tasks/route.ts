import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthContext } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import { escapeRegex } from "@/lib/security/sanitize";
import { validateBody } from "@/lib/validators";
import { agentTaskCreateSchema } from "@/lib/validators/agent-tasks";
import mongoose from "mongoose";
import AgentTask from "@/models/AgentTask";
import User from "@/models/User";



function requireAgentRole(ctx: AuthContext): NextResponse | null {
  if (ctx.role !== "agent" && ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

/* GET — List agent tasks */
async function getHandler(req: NextRequest, ctx: AuthContext) {
  const roleErr = requireAgentRole(ctx);
  if (roleErr) return roleErr;
  await connectDB();

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
  // assigned = given by a super agent / admin; personal = the agent's own to-dos.
  const kind = url.searchParams.get("kind") ?? "";

  const filter: Record<string, unknown> = { userId: ctx.userId };
  if (status && status !== "all") filter.status = status;
  if (priority && priority !== "all") filter.priority = priority;
  if (search) filter.title = { $regex: escapeRegex(search), $options: "i" };
  if (kind === "assigned") filter["assignedBy.userId"] = { $exists: true };
  else if (kind === "personal") filter["assignedBy.userId"] = { $exists: false };
  if (due === "overdue") {
    filter.dueDate = { $ne: null, $lt: new Date() };
    if (!filter.status) filter.status = { $ne: "completed" };
  } else if (due === "today") {
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);
    filter.dueDate = { $ne: null, $lte: endOfToday };
    if (!filter.status) filter.status = { $ne: "completed" };
  } else if (dueFrom || dueTo) {
    const range: Record<string, Date> = {};
    if (dueFrom) range.$gte = new Date(dueFrom);
    if (dueTo) range.$lte = new Date(dueTo);
    filter.dueDate = range;
  }

  const [items, total, statusRows, overdue] = await Promise.all([
    AgentTask.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    AgentTask.countDocuments(filter),
    AgentTask.aggregate<{ _id: string; count: number }>([
      { $match: { userId: new mongoose.Types.ObjectId(ctx.userId) } },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
    AgentTask.countDocuments({
      userId: ctx.userId,
      dueDate: { $lt: new Date() },
      status: { $ne: "completed" },
    }),
  ]);
  const statusCounts = Object.fromEntries(statusRows.map((row) => [row._id, row.count]));

  const assignerIds = [...new Set(items.map((t) => String(t.assignedBy?.userId ?? "")).filter(Boolean))];
  const assigners = assignerIds.length
    ? await User.find({ _id: { $in: assignerIds } }).select("_id name").lean<Array<{ _id: unknown; name?: string }>>()
    : [];
  const assignerNames = new Map(assigners.map((u) => [String(u._id), u.name ?? ""]));

  return NextResponse.json({
    total,
    page,
    totalPages: Math.max(Math.ceil(total / limit), 1),
    stats: {
      pending: statusCounts.pending ?? 0,
      inProgress: statusCounts.in_progress ?? 0,
      completed: statusCounts.completed ?? 0,
      overdue,
    },
    // The row type comes from the model now, so the old Record<string, unknown>
    // annotation would be a widening cast rather than a description.
    items: items.map((t) => ({
      _id: String(t._id),
      title: t.title,
      description: t.description,
      priority: t.priority,
      status: t.status,
      dueDate: t.dueDate,
      category: t.category,
      relatedTo: t.relatedTo,
      createdAt: t.createdAt,
      ...(t.assignedBy?.userId
        ? {
            assignedBy: { name: assignerNames.get(String(t.assignedBy.userId)) ?? "", role: t.assignedBy.role },
            reviewStatus: t.reviewStatus ?? "none",
            completionNote: t.completionNote,
            reviewComment: t.reviewComment,
          }
        : {}),
    })),
  });
}

/* POST — Create task */
async function postHandler(req: NextRequest, ctx: AuthContext) {
  const roleErr = requireAgentRole(ctx);
  if (roleErr) return roleErr;
  await connectDB();

  const body = await validateBody(req, agentTaskCreateSchema);

  const task = await AgentTask.create({
    userId: ctx.userId,
    title: body.title,
    description: body.description,
    priority: body.priority,
    category: body.category,
    dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
  });

  return NextResponse.json({ success: true, task });
}

export const GET = withAuth(getHandler);
export const POST = withAuth(postHandler);
