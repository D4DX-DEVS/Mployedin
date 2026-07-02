import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import Conversation from "@/models/Conversation";
import DirectMessage from "@/models/DirectMessage";
import { triggerRealtimeEvent } from "@/lib/realtime";
import mongoose from "mongoose";
import { logActivity } from "@/lib/audit/log";
import logger from "@/lib/logger";

/**
 * PATCH /api/dm/[conversationId]/read
 * Marks all messages in the conversation as read for the current user.
 */
async function patchHandler(req: NextRequest, ctx: { userId: string }, params?: Record<string, string>) {
  await connectDB();
  const conversationId = params?.conversationId ?? "";

  if (!mongoose.Types.ObjectId.isValid(conversationId)) {
    return NextResponse.json({ error: "Invalid conversationId" }, { status: 400 });
  }

  const conv = await Conversation.findById(conversationId).lean();
  if (!conv) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isParticipant = conv.participants.some((p) => p.toString() === ctx.userId);
  if (!isParticipant) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Reset unread count for current user
  await Conversation.findByIdAndUpdate(conversationId, {
    [`unreadCounts.${ctx.userId}`]: 0,
  });

  // Mark unread messages sent by the other person as read
  await DirectMessage.updateMany(
    {
      conversationId: new mongoose.Types.ObjectId(conversationId),
      senderId: { $ne: new mongoose.Types.ObjectId(ctx.userId) },
      readAt: { $exists: false },
    },
    { readAt: new Date() }
  );

  // Notify sender that their messages were read (enables "seen" checkmarks)
  const senderId = conv.participants.find((p) => p.toString() !== ctx.userId)?.toString();
  if (senderId) {
    await triggerRealtimeEvent(senderId, "messages-read", { conversationId }).catch((err) => logger.error({ err, conversationId }, "Failed to notify sender of message read"));
  }

  await logActivity({
    actorId: ctx.userId,
    action: "dm.conversation_read",
    resource: "conversations",
    resourceId: conversationId,
    req,
  });

  return NextResponse.json({ ok: true });
}

export const PATCH = withAuth(patchHandler);
