import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import { withAuth } from "@/lib/auth/withAuth";
import TargetProfile from "@/models/TargetProfile";
import User from "@/models/User";
import { validateBody } from "@/lib/validators";
import { targetProfileReassignSchema } from "@/lib/validators/targetProfiles";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import { notifyTargetAssigned } from "@/lib/notifications/trigger";

interface AuthCtx { userId: string; role: string; locale: string; }

async function patchHandler(req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  await connectDB();

  const id = params?.id;
  if (!id) return NextResponse.json({ error: "Missing ID" }, { status: 400 });

  const body = await validateBody(req, targetProfileReassignSchema);
  const profile = await TargetProfile.findById(id).lean();

  if (!profile) return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  if (profile.status !== "active") {
    return NextResponse.json({ error: "Only active target profiles can be reassigned" }, { status: 400 });
  }

  const newAssignee = await User.findOne({
    _id: body.newAssigneeId,
    role: profile.assigneeRole,
    isActive: { $ne: false },
  }).select("_id name email role").lean();

  if (!newAssignee) {
    return NextResponse.json(
      { error: "New assignee must be an active user with the same role" },
      { status: 404 }
    );
  }

  const duplicate = await TargetProfile.findOne({
    _id: { $ne: id },
    assigneeId: body.newAssigneeId,
    assigneeRole: profile.assigneeRole,
    year: profile.year,
    status: "active",
  }).lean();

  if (duplicate) {
    return NextResponse.json(
      { error: "The new assignee already has an active target profile for this year" },
      { status: 409 }
    );
  }

  const updated = await TargetProfile.findByIdAndUpdate(
    id,
    { $set: { assigneeId: body.newAssigneeId } },
    { new: true }
  ).lean();

  if (!updated) return NextResponse.json({ error: "Profile not found" }, { status: 404 });

  await logActivity({
    ...actorFromCtx(ctx),
    action: "target_profile.reassign",
    resource: "targets",
    resourceId: id,
    changes: {
      before: { assigneeId: String(profile.assigneeId) },
      after: { assigneeId: body.newAssigneeId },
    },
    meta: {
      year: profile.year,
      assigneeRole: profile.assigneeRole,
      reason: body.reason,
    },
    req,
  });

  void notifyTargetAssigned(
    body.newAssigneeId,
    profile.assigneeRole,
    id,
    profile.year,
    ctx.locale
  );

  return NextResponse.json({ profile: updated });
}

export const PATCH = withAuth(patchHandler, { resource: "targets", action: "update" });