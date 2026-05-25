import { NextRequest, NextResponse } from "next/server";
import { withAuth, AuthContext } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import { escapeRegex } from "@/lib/security/sanitize";
import { validateBody } from "@/lib/validators";
import { agentTaskCreateSchema } from "@/lib/validators/agent-tasks";
import mongoose from "mongoose";

/* Simple in-DB task storage using a generic collection */
const TaskSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  title: { type: String, required: true },
  description: String,
  priority: { type: String, enum: ["high", "medium", "low"], default: "medium" },
  status: { type: String, enum: ["pending", "in_progress", "completed"], default: "pending" },
  dueDate: Date,
  category: { type: String, enum: ["follow_up", "call", "meeting", "document", "other"], default: "follow_up" },
  relatedTo: String,
}, { timestamps: true });

const AgentTask = mongoose.models.AgentTask || mongoose.model("AgentTask", TaskSchema);

/* GET — List agent tasks */
async function getHandler(req: NextRequest, ctx: AuthContext) {
  await connectDB();

  const url = new URL(req.url);
  const status = url.searchParams.get("status") ?? "";
  const search = url.searchParams.get("search") ?? "";

  const filter: Record<string, unknown> = { userId: ctx.userId };
  if (status && status !== "all") filter.status = status;
  if (search) filter.title = { $regex: escapeRegex(search), $options: "i" };

  const items = await AgentTask.find(filter).sort({ createdAt: -1 }).limit(100).lean();

  return NextResponse.json({
    items: items.map((t: Record<string, unknown>) => ({
      _id: String(t._id),
      title: t.title,
      description: t.description,
      priority: t.priority,
      status: t.status,
      dueDate: t.dueDate,
      category: t.category,
      relatedTo: t.relatedTo,
      createdAt: t.createdAt,
    })),
  });
}

/* POST — Create task */
async function postHandler(req: NextRequest, ctx: AuthContext) {
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
