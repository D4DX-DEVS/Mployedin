import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthContext } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import mongoose from "mongoose";

const AgentTask = mongoose.models.AgentTask;

/* PATCH — Update task */
async function patchHandler(req: NextRequest, ctx: AuthContext, params?: Record<string, string>) {
  await connectDB();
  const id = params?.id;

  const body = await req.json();
  const task = await AgentTask.findOneAndUpdate(
    { _id: id, userId: ctx.userId },
    { $set: body },
    { new: true },
  );

  if (!task) {
    return NextResponse.json({ error: "Task not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true, task });
}

/* DELETE — Delete task */
async function deleteHandler(req: NextRequest, ctx: AuthContext, params?: Record<string, string>) {
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
