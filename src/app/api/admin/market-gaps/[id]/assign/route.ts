import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import mongoose from "mongoose";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import { commonSchemas, validateBody } from "@/lib/validators";
import MarketSuggestion from "@/models/MarketSuggestion";
import { assignTask, listAssignableAgents, TaskError } from "@/lib/agentTasks/assigned";
import { gapTaskText } from "@/lib/marketGaps/taskText";

const bodySchema = z.object({
  agentUserId: commonSchemas.objectId,
  note: z.string().trim().max(1000).optional(),
});

/** GET — agents on the team of the super agent who holds this suggestion's area. */
export const GET = withAuth(async (_req: NextRequest, ctx, params) => {
  if (ctx.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = (await params) as { id: string };
  if (!commonSchemas.objectId.safeParse(id).success) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  await connectDB();
  const s = await MarketSuggestion.findById(id).select("saUserId").lean<{ saUserId?: mongoose.Types.ObjectId | null } | null>();
  if (!s) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const agents = await listAssignableAgents({ userId: ctx.userId, role: "admin" }, s.saUserId ? String(s.saUserId) : undefined);
  return NextResponse.json({ agents });
});

/** POST — give the suggestion to an agent as a task; the suggestion becomes "assigned". */
export const POST = withAuth(async (req: NextRequest, ctx, params) => {
  if (ctx.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { id } = (await params) as { id: string };
  if (!commonSchemas.objectId.safeParse(id).success) return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  const body = await validateBody(req, bodySchema);
  await connectDB();
  const s = await MarketSuggestion.findById(id);
  if (!s) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const text = gapTaskText({ kind: s.kind, role: s.role, areaName: s.areaName, seekers: s.seekers, jobs: s.jobs, note: body.note });
  try {
    const task = await assignTask(
      { userId: ctx.userId, role: "admin" },
      {
        agentUserId: body.agentUserId,
        title: text.title,
        description: text.description,
        priority: s.priority,
        superAgentUserId: s.saUserId ? String(s.saUserId) : undefined,
      },
    );
    s.status = "assigned";
    s.assignedTo = new mongoose.Types.ObjectId(body.agentUserId);
    s.taskId = task._id as mongoose.Types.ObjectId;
    s.history.push({ at: new Date(), action: "assigned", by: new mongoose.Types.ObjectId(ctx.userId), note: body.note ?? "" });
    await s.save();
    return NextResponse.json({ ok: true, taskId: String(task._id) });
  } catch (err) {
    if (err instanceof TaskError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
});
