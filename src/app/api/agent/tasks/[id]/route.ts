import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthContext } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import { validateBody } from "@/lib/validators";
import { agentTaskUpdateSchema, agentTaskCompleteSchema } from "@/lib/validators/agent-tasks";
import { isAssignedTask, submitAssignedTask, TaskError } from "@/lib/agentTasks/assigned";
import { pushHistory, readTaskHistory } from "@/lib/agentTasks/history";
import AgentTask, { type AgentTaskStatus } from "@/models/AgentTask";
import mongoose from "mongoose";


function requireAgentRole(ctx: AuthContext): NextResponse | null {
  if (ctx.role !== "agent" && ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

const patchSchema = agentTaskUpdateSchema.extend({
  completionNote: agentTaskCompleteSchema.shape.completionNote,
  // Optional note on any status change; recorded in the task's history.
  note: agentTaskCompleteSchema.shape.completionNote,
});

/* PATCH — Update task */
async function patchHandler(req: NextRequest, ctx: AuthContext, params?: Record<string, string>) {
  const roleErr = requireAgentRole(ctx);
  if (roleErr) return roleErr;
  await connectDB();
  const id = params?.id;
  if (!id || !mongoose.isValidObjectId(id)) {
    return NextResponse.json({ error: "Invalid task ID" }, { status: 400 });
  }

  const body = await validateBody(req, patchSchema);
  const note = body.note || body.completionNote || undefined;

  // A task from a super agent or an admin: the agent works it (pending → in
  // progress) and submits it done with a note, which sends it to review. What
  // the task says, and when it is due, stays the assigner's.
  const existing = await AgentTask.findOne({ _id: id, userId: ctx.userId })
    .select("assignedBy reviewStatus status")
    .lean<{ assignedBy?: { userId?: unknown }; reviewStatus?: string; status: AgentTaskStatus }>();
  if (!existing) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }
  if (isAssignedTask(existing)) {
    const editsContent = [body.title, body.description, body.priority, body.category, body.dueDate].some((v) => v !== undefined);
    if (editsContent) {
      return NextResponse.json({ error: "This task was assigned to you, so only the person who assigned it can change it." }, { status: 403 });
    }
    // Completed or Failed on an assigned task is a report to the reviewer, not
    // a final status: it goes to review (note optional).
    if (body.status === "completed" || body.status === "failed") {
      try {
        const task = await submitAssignedTask(ctx.userId, id, body.status, note);
        return NextResponse.json({ success: true, task });
      } catch (err) {
        if (err instanceof TaskError) return NextResponse.json({ error: err.message }, { status: err.status });
        throw err;
      }
    }
    if (existing.reviewStatus === "awaiting_review" || existing.reviewStatus === "approved") {
      return NextResponse.json({ error: "This task is with your reviewer." }, { status: 409 });
    }
  }

  const update: Record<string, unknown> = {};
  if (body.title !== undefined) update.title = body.title;
  if (body.description !== undefined) update.description = body.description;
  if (body.priority !== undefined) update.priority = body.priority;
  if (body.status !== undefined) update.status = body.status;
  // Closing a personal to-do keeps its optional note; reopening clears it.
  if (body.status === "completed" || body.status === "failed") update.completionNote = note;
  else if (body.status !== undefined) update.completionNote = undefined;
  if (body.category !== undefined) update.category = body.category;
  if (body.dueDate !== undefined) update.dueDate = body.dueDate ? new Date(body.dueDate) : null;

  const task = await AgentTask.findOneAndUpdate(
    { _id: id, userId: ctx.userId },
    {
      $set: update,
      ...(body.status !== undefined && body.status !== existing.status
        ? pushHistory({ action: "status", by: ctx.userId, from: existing.status, to: body.status, note })
        : {}),
    },
    { returnDocument: "after" },
  );

  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true, task });
}

/* GET — The task's activity history (its owner only) */
async function getHandler(req: NextRequest, ctx: AuthContext, params?: Record<string, string>) {
  const roleErr = requireAgentRole(ctx);
  if (roleErr) return roleErr;
  await connectDB();
  const id = params?.id;
  if (!id || !mongoose.isValidObjectId(id)) {
    return NextResponse.json({ error: "Invalid task ID" }, { status: 400 });
  }
  const task = await AgentTask.findOne({ _id: id, userId: ctx.userId })
    .select("userId createdAt assignedBy history")
    .lean<Parameters<typeof readTaskHistory>[0]>();
  if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });
  return NextResponse.json({ history: await readTaskHistory(task) });
}

/* DELETE — Delete task */
async function deleteHandler(req: NextRequest, ctx: AuthContext, params?: Record<string, string>) {
  const roleErr = requireAgentRole(ctx);
  if (roleErr) return roleErr;
  await connectDB();
  const id = params?.id;
  // Same check PATCH does — without it a malformed id reached Mongoose and threw
  // CastError, surfacing as a 500 instead of a 400.
  if (!id || !mongoose.isValidObjectId(id)) {
    return NextResponse.json({ error: "Invalid task ID" }, { status: 400 });
  }

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

export const GET = withAuth(getHandler);
export const PATCH = withAuth(patchHandler);
export const DELETE = withAuth(deleteHandler);
