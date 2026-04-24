import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import Conversation from "@/models/Conversation";
import mongoose from "mongoose";
import type { UserRole } from "@/models/User";
import { triggerRealtimeEvent } from "@/lib/realtime";
import { validateBody } from "@/lib/validators";
import { customerCareManageSchema } from "@/lib/validators/dm";
import { logActivity, actorFromCtx } from "@/lib/audit/log";

interface AuthCtx {
  userId: string;
  role: UserRole;
}

/**
 * PATCH /api/dm/customer-care/[conversationId]/manage
 *
 * Admin-only: update customer care ticket status, assignment, priority.
 * Body: { status?, assignedTo?, priority? }
 */
async function patchHandler(
  req: NextRequest,
  ctx: AuthCtx,
  params?: Record<string, string>
) {
  if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

  await connectDB();

  const conversationId = params?.conversationId;
  if (!conversationId || !mongoose.Types.ObjectId.isValid(conversationId)) {
    return NextResponse.json({ error: "Invalid conversation ID" }, { status: 400 });
  }

  const conversation = await Conversation.findOne({
    _id: conversationId,
    type: "customer_care",
  });

  if (!conversation) {
    return NextResponse.json({ error: "Customer care conversation not found" }, { status: 404 });
  }

  const body = await validateBody(req, customerCareManageSchema);
  const { status, assignedTo, priority } = body;

  if (!conversation.customerCare) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (conversation as any).customerCare = { status: "open", priority: "medium" };
  }

  if (status && ["open", "assigned", "resolved", "closed"].includes(status)) {
    conversation.customerCare!.status = status;
    if (status === "resolved") {
      conversation.customerCare!.resolvedAt = new Date();
    }
    if (status === "closed") {
      conversation.customerCare!.closedAt = new Date();
    }
  }

  if (assignedTo && mongoose.Types.ObjectId.isValid(assignedTo)) {
    conversation.customerCare!.assignedTo = new mongoose.Types.ObjectId(assignedTo);
    if (!status) {
      conversation.customerCare!.status = "assigned";
    }
  }

  if (priority && ["low", "medium", "high", "urgent"].includes(priority)) {
    conversation.customerCare!.priority = priority;
  }

  await conversation.save();

  // Notify the job seeker about status change
  const jobSeekerParticipant = conversation.participantDetails.find(
    (p) => p.role === "job_seeker"
  );
  if (jobSeekerParticipant) {
    await triggerRealtimeEvent(
      jobSeekerParticipant.userId.toString(),
      "customer-care-update",
      {
        conversationId: conversation._id.toString(),
        status: conversation.customerCare!.status,
      }
    ).catch(() => {});
  }

  await logActivity({
    ...actorFromCtx(ctx),
    action: "dm.customer_care_manage",
    resource: "conversations",
    resourceId: conversationId,
    changes: { after: { status, assignedTo, priority } },
    req,
  });

  return NextResponse.json({ conversation: conversation.toObject() });
}

export const PATCH = withAuth(patchHandler);
