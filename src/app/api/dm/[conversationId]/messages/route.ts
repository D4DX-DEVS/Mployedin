import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import Conversation from "@/models/Conversation";
import DirectMessage from "@/models/DirectMessage";
import { triggerRealtimeEvent } from "@/lib/realtime";
import { checkRateLimitDual } from "@/lib/security/rateLimit";
import mongoose from "mongoose";
import { validateBody } from "@/lib/validators";
import { dmSendMessageSchema } from "@/lib/validators/dm";
import { logActivity } from "@/lib/audit/log";
import { assertParticipant } from "@/lib/dm/access";
import { notifyDirectMessageReceived } from "@/lib/notifications/trigger";
import logger from "@/lib/logger";

/** A lean Map field arrives as a plain object; a hydrated one as a Map. */
function mapValue<T>(m: unknown, key: string): T | undefined {
  if (!m) return undefined;
  if (m instanceof Map) return m.get(key) as T | undefined;
  return (m as Record<string, T>)[key];
}

function clearedAtFor(conv: { clearedAt?: unknown }, userId: string): Date | null {
  const v = mapValue<Date | string>(conv.clearedAt, userId);
  return v ? new Date(v) : null;
}

function unreadOf(counts: unknown, userId: string): number {
  return Number(mapValue<number>(counts, userId) ?? 0);
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
  // MS-2: history this participant cleared stays hidden from them only.
  const clearedAt = clearedAtFor(conv, ctx.userId);
  if (clearedAt) query.createdAt = { $gt: clearedAt };

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

  const rl = await checkRateLimitDual(req, ctx.userId, { limit: 60, windowSec: 60, prefix: "dm-send" });
  if (!rl.allowed) return NextResponse.json({ error: "Too many requests. Please try again later." }, { status: 429 });

  const body = await validateBody(req, dmSendMessageSchema);
  const content = body.content;

  const msg = await DirectMessage.create({
    conversationId: new mongoose.Types.ObjectId(conversationId),
    senderId: new mongoose.Types.ObjectId(ctx.userId),
    content,
  });

  // Determine recipient and increment their unread count
  const recipientId = conv.participants.find((p) => p.toString() !== ctx.userId)?.toString();
  const unreadKey = `unreadCounts.${recipientId}`;

  const preview = content.length > 80 ? content.slice(0, 80) + "…" : content;
  // Returns the PRE-update document: its unread count tells us whether this is
  // the first unread message. A new message also brings the thread back for a
  // participant who had deleted it from their list (MS-2).
  const before = await Conversation.findByIdAndUpdate(conversationId, {
    lastMessage: preview,
    lastMessageAt: new Date(),
    lastSenderId: new mongoose.Types.ObjectId(ctx.userId),
    $inc: { [unreadKey]: 1 },
    $pull: { hiddenFor: { $in: conv.participants } },
  }).lean();

  const senderDetail = conv.participantDetails?.find((d) => d.userId.toString() === ctx.userId);

  // MS-1: tell the recipient outside the open chat window. Only on the first
  // unread message, so a burst of messages is one notification, not twenty.
  const previousUnread = recipientId ? unreadOf(before?.unreadCounts, recipientId) : 0;
  if (recipientId && previousUnread === 0) {
    const recipientDetail = conv.participantDetails?.find((d) => d.userId.toString() === recipientId);
    notifyDirectMessageReceived(
      recipientId,
      recipientDetail?.role ?? "job_seeker",
      senderDetail?.name ?? "Someone",
      conversationId,
      preview,
    ).catch((err) => logger.error({ err, conversationId }, "Failed to notify DM recipient"));
  }

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

  await logActivity({
    actorId: ctx.userId,
    action: "dm.message_send",
    resource: "direct_messages",
    resourceId: msg._id.toString(),
    meta: { conversationId },
    req,
  });

  return NextResponse.json({ message: msg }, { status: 201 });
}

export const GET = withAuth(getHandler);
export const POST = withAuth(postHandler);
