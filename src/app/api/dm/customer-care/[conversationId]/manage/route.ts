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
import logger from "@/lib/logger";

interface AuthCtx {
  userId: string;
  role: UserRole;
}

/**
 * PATCH /api/dm/customer-care/[conversationId]/manage
 *
 * Admin-only: update customer care ticket status, assignment, priority.
 * Job seekers: can only re-open their own resolved/closed tickets.
 * Body: { status?, assignedTo?, priority? }
 */
async function patchHandler(
  req: NextRequest,
  ctx: AuthCtx,
  params?: Record<string, string>
) {
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

  // Job seekers can only re-open their own resolved/closed tickets
  if (ctx.role === "job_seeker") {
    const isParticipant = conversation.participants.some(
      (p) => p.toString() === ctx.userId
    );
    if (!isParticipant) {
      return NextResponse.json({ error: "Not your ticket" }, { status: 403 });
    }
    const currentStatus = conversation.customerCare?.status;
    if (status !== "open" || !["resolved", "closed"].includes(currentStatus ?? "")) {
      return NextResponse.json(
        { error: "You can only re-open resolved or closed tickets" },
        { status: 403 }
      );
    }
    conversation.customerCare!.status = "open";
    conversation.customerCare!.resolvedAt = undefined;
    conversation.customerCare!.closedAt = undefined;
    await conversation.save();

    // Notify admin
    const adminParticipant = conversation.participantDetails.find(
      (p) => p.role === "admin"
    );
    if (adminParticipant) {
      await triggerRealtimeEvent(
        adminParticipant.userId.toString(),
        "customer-care-update",
        { conversationId: conversation._id.toString(), status: "open" }
      ).catch((err) => logger.error({ err, conversationId: conversation._id.toString() }, "Failed to notify admin of customer care reopen"));
    }

    await logActivity({
      ...actorFromCtx(ctx),
      action: "dm.customer_care_reopen",
      resource: "conversations",
      resourceId: conversationId,
      req,
    });

    return NextResponse.json({ conversation: conversation.toObject() });
  }

  if (ctx.role !== "admin") {
    return NextResponse.json({ error: "Admin only" }, { status: 403 });
  }

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
    ).catch((err) => logger.error({ err, conversationId: conversation._id.toString() }, "Failed to notify job seeker of customer care update"));
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
