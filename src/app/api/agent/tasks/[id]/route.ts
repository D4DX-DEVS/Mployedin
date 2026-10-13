import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthContext } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import { validateBody } from "@/lib/validators";
import { agentTaskUpdateSchema, agentTaskCompleteSchema } from "@/lib/validators/agent-tasks";
import { isAssignedTask, submitAssignedTask, TaskError } from "@/lib/agentTasks/assigned";
import mongoose from "mongoose";

const AgentTask = mongoose.models.AgentTask;

function requireAgentRole(ctx: AuthContext): NextResponse | null {
  if (ctx.role !== "agent" && ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

const patchSchema = agentTaskUpdateSchema.extend({
  completionNote: agentTaskCompleteSchema.shape.completionNote.optional(),
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

  // A task from a super agent or an admin: the agent works it (pending → in
  // progress) and submits it done with a note, which sends it to review. What
  // the task says, and when it is due, stays the assigner's.
  const existing = await AgentTask.findOne({ _id: id, userId: ctx.userId })
    .select("assignedBy reviewStatus")
    .lean<{ assignedBy?: { userId?: unknown }; reviewStatus?: string }>();
  if (!existing) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }
  if (isAssignedTask(existing)) {
    const editsContent = [body.title, body.description, body.priority, body.category, body.dueDate].some((v) => v !== undefined);
    if (editsContent) {
      return NextResponse.json({ error: "This task was assigned to you, so only the person who assigned it can change it." }, { status: 403 });
    }
    if (body.status === "completed") {
      if (!body.completionNote) {
        return NextResponse.json({ error: "Add a short note on what you did" }, { status: 400 });
      }
      try {
        const task = await submitAssignedTask(ctx.userId, id, body.completionNote);
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
  if (body.category !== undefined) update.category = body.category;
  if (body.dueDate !== undefined) update.dueDate = body.dueDate ? new Date(body.dueDate) : null;

  const task = await AgentTask.findOneAndUpdate(
    { _id: id, userId: ctx.userId },
    { $set: update },
    { returnDocument: "after" },
  );

  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true, task });
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

export const PATCH = withAuth(patchHandler);
export const DELETE = withAuth(deleteHandler);
