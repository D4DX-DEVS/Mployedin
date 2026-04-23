import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import Conversation from "@/models/Conversation";
import DirectMessage from "@/models/DirectMessage";
import mongoose from "mongoose";
import { validateBody } from "@/lib/validators";
import { dmManageConversationSchema } from "@/lib/validators/dm";

interface AuthCtx { userId: string; }

async function assertParticipant(conversationId: string, userId: string) {
  const conv = await Conversation.findById(conversationId).lean();
  if (!conv) return null;
  const isParticipant = conv.participants.some((p) => p.toString() === userId);
  return isParticipant ? conv : null;
}

/**
 * PATCH /api/dm/[conversationId]/manage
 * Body: { action: "clear" }
 * Clears all messages in the conversation but keeps the conversation itself.
 */
async function patchHandler(req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  await connectDB();
  const conversationId = params?.conversationId ?? "";

  if (!mongoose.Types.ObjectId.isValid(conversationId)) {
    return NextResponse.json({ error: "Invalid conversationId" }, { status: 400 });
  }

  const conv = await assertParticipant(conversationId, ctx.userId);
  if (!conv) return NextResponse.json({ error: "Not found or forbidden" }, { status: 404 });

  const body = await validateBody(req, dmManageConversationSchema);

  // Delete all messages in this conversation
  await DirectMessage.deleteMany({
    conversationId: new mongoose.Types.ObjectId(conversationId),
  });

  // Reset conversation metadata
  await Conversation.findByIdAndUpdate(conversationId, {
    $unset: { lastMessage: 1, lastMessageAt: 1, lastSenderId: 1 },
    unreadCounts: {},
  });

  return NextResponse.json({ success: true });
}

/**
 * DELETE /api/dm/[conversationId]/manage
 * Permanently deletes the conversation and all its messages.
 */
async function deleteHandler(req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  await connectDB();
  const conversationId = params?.conversationId ?? "";

  if (!mongoose.Types.ObjectId.isValid(conversationId)) {
    return NextResponse.json({ error: "Invalid conversationId" }, { status: 400 });
  }

  const conv = await assertParticipant(conversationId, ctx.userId);
  if (!conv) return NextResponse.json({ error: "Not found or forbidden" }, { status: 404 });

  // Delete all messages first, then the conversation
  await DirectMessage.deleteMany({
    conversationId: new mongoose.Types.ObjectId(conversationId),
  });

  await Conversation.findByIdAndDelete(conversationId);

  return NextResponse.json({ success: true });
}

export const PATCH = withAuth(patchHandler);
export const DELETE = withAuth(deleteHandler);
