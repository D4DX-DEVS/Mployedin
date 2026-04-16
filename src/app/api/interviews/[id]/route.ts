import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import Interview from "@/models/Interview";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { validateBody } from "@/lib/validators";
import { interviewUpdateSchema } from "@/lib/validators/interviews";
import { isValidObjectId } from "@/lib/security/sanitize";
import type { UserRole } from "@/models/User";

interface AuthCtx { userId: string; role: UserRole; locale: string; }

async function getHandler(_req: NextRequest, _ctx: AuthCtx, params?: Record<string, string>) {
  if (!isValidObjectId(params?.id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  await connectDB();
  const interview = await Interview.findById(params?.id)
    .populate({ path: "applicationId", populate: { path: "jobId", select: "title employerId" } })
    .lean();
  if (!interview) return NextResponse.json({ error: "Interview not found" }, { status: 404 });
  return NextResponse.json({ interview });
}

async function patchHandler(req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  if (!isValidObjectId(params?.id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  await connectDB();
  const interview = await Interview.findById(params?.id);
  if (!interview) return NextResponse.json({ error: "Interview not found" }, { status: 404 });

  const body = await validateBody(req, interviewUpdateSchema);
  const update: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) if (v !== undefined) update[k] = v;

  if (body.status === "rescheduled") {
    update.rescheduleCount = (interview.rescheduleCount ?? 0) + 1;
  }

  Object.assign(interview, update);
  await interview.save();

  await logActivity({
    ...actorFromCtx(ctx),
    action: "interview.update",
    resource: "interviews",
    resourceId: params?.id,
    changes: { after: update },
    req,
  });

  return NextResponse.json({ interview });
}

async function deleteHandler(req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  if (!isValidObjectId(params?.id)) return NextResponse.json({ error: "Invalid ID" }, { status: 400 });
  await connectDB();
  const interview = await Interview.findById(params?.id);
  if (!interview) return NextResponse.json({ error: "Interview not found" }, { status: 404 });

  interview.status = "cancelled";
  await interview.save();

  await logActivity({
    ...actorFromCtx(ctx),
    action: "interview.cancel",
    resource: "interviews",
    resourceId: params?.id,
    req,
  });

  return NextResponse.json({ message: "Interview cancelled" });
}

export const GET = withAuth(getHandler, { resource: "interviews", action: "read" });
export const PATCH = withAuth(patchHandler, { resource: "interviews", action: "update" });
export const DELETE = withAuth(deleteHandler, { resource: "interviews", action: "delete" });
