import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthContext } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import { validateBody } from "@/lib/validators";
import { agentTaskUpdateSchema } from "@/lib/validators/agent-tasks";
import mongoose from "mongoose";

const AgentTask = mongoose.models.AgentTask;

function requireAgentRole(ctx: AuthContext): NextResponse | null {
  if (ctx.role !== "agent" && ctx.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

/* PATCH — Update task */
async function patchHandler(req: NextRequest, ctx: AuthContext, params?: Record<string, string>) {
  const roleErr = requireAgentRole(ctx);
  if (roleErr) return roleErr;
  await connectDB();
  const id = params?.id;
  if (!id || !mongoose.isValidObjectId(id)) {
    return NextResponse.json({ error: "Invalid task ID" }, { status: 400 });
  }

  const body = await validateBody(req, agentTaskUpdateSchema);

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
    { new: true },
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

  const result = await AgentTask.deleteOne({ _id: id, userId: ctx.userId });
  if (result.deletedCount === 0) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}

export const PATCH = withAuth(patchHandler);
export const DELETE = withAuth(deleteHandler);
