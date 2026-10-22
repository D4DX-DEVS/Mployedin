import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthContext } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import { validateBody } from "@/lib/validators";
import { agentTaskUpdateSchema, agentTaskCompleteSchema } from "@/lib/validators/agent-tasks";
import { TaskError } from "@/lib/agentTasks/assigned";
import { readTaskHistory } from "@/lib/agentTasks/history";
import { updateOwnTask } from "@/lib/agentTasks/ownTask";
import AgentTask from "@/models/AgentTask";
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
  try {
    const { task } = await updateOwnTask(ctx.userId, id, { ...body, note: body.note || body.completionNote || undefined });
    return NextResponse.json({ success: true, task });
  } catch (err) {
    if (err instanceof TaskError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
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
