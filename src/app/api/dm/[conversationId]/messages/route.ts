import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import Conversation from "@/models/Conversation";
import DirectMessage from "@/models/DirectMessage";
import { triggerRealtimeEvent } from "@/lib/realtime";
import { checkRateLimitDual } from "@/lib/security/rateLimit";
import mongoose from "mongoose";

async function assertParticipant(conversationId: string, userId: string) {
  const conv = await Conversation.findById(conversationId).lean();
  if (!conv) return null;
  const isParticipant = conv.participants.some((p) => p.toString() === userId);
  return isParticipant ? conv : null;
}

/**
 * GET /api/dm/[conversationId]/messages
 * Returns paginated message history (latest 50, cursor-based for older).
 */
async function getHandler(req: NextRequest, ctx: { userId: string }, params?: Record<string, string>) {
  await connectDB();
  const conversationId = params?.conversationId ?? "";

  if (!mongoose.Types.ObjectId.isValid(conversationId)) {
    return NextResponse.json({ error: "Invalid conversationId" }, { status: 400 });
  }

  const conv = await assertParticipant(conversationId, ctx.userId);
  if (!conv) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { searchParams } = new URL(req.url);
  const limit = Math.min(50, parseInt(searchParams.get("limit") ?? "50"));
  const before = searchParams.get("before");

  const query: Record<string, unknown> = { conversationId: new mongoose.Types.ObjectId(conversationId) };
  if (before && mongoose.Types.ObjectId.isValid(before)) {
    query._id = { $lt: new mongoose.Types.ObjectId(before) };
  }

  const messages = await DirectMessage.find(query)
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();

  return NextResponse.json({ messages: messages.reverse() });
}

/**
 * POST /api/dm/[conversationId]/messages
 * Sends a message. Persists to DB + triggers real-time event to recipient.
 */
async function postHandler(req: NextRequest, ctx: { userId: string }, params?: Record<string, string>) {
  await connectDB();
  const conversationId = params?.conversationId ?? "";

  if (!mongoose.Types.ObjectId.isValid(conversationId)) {
    return NextResponse.json({ error: "Invalid conversationId" }, { status: 400 });
  }

  const conv = await assertParticipant(conversationId, ctx.userId);
  if (!conv) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const rl = checkRateLimitDual(req, ctx.userId, { limit: 60, windowSec: 60, prefix: "dm-send" });
  if (!rl.allowed) return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });

  const body = await req.json();
  const content = String(body.content ?? "").trim().slice(0, 2000);
  if (!content) return NextResponse.json({ error: "content is required" }, { status: 400 });

  const msg = await DirectMessage.create({
    conversationId: new mongoose.Types.ObjectId(conversationId),
    senderId: new mongoose.Types.ObjectId(ctx.userId),
    content,
  });

  // Determine recipient and increment their unread count
  const recipientId = conv.participants.find((p) => p.toString() !== ctx.userId)?.toString();
  const unreadKey = `unreadCounts.${recipientId}`;

  await Conversation.findByIdAndUpdate(conversationId, {
    lastMessage: content.length > 80 ? content.slice(0, 80) + "…" : content,
    lastMessageAt: new Date(),
    lastSenderId: new mongoose.Types.ObjectId(ctx.userId),
    $inc: { [unreadKey]: 1 },
  });

  const senderDetail = conv.participantDetails?.find((d) => d.userId.toString() === ctx.userId);

  if (recipientId) {
    await triggerRealtimeEvent(recipientId, "new-message", {
      _id: msg._id.toString(),
      conversationId,
      senderId: ctx.userId,
      senderName: senderDetail?.name ?? "Unknown",
      content,
      createdAt: msg.createdAt.toISOString(),
    });
  }

  return NextResponse.json({ message: msg }, { status: 201 });
}

export const GET = withAuth(getHandler);
export const POST = withAuth(postHandler);
