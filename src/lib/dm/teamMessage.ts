import mongoose from "mongoose";
import Conversation from "@/models/Conversation";
import DirectMessage from "@/models/DirectMessage";
import { triggerRealtimeEvent } from "@/lib/realtime";
import logger from "@/lib/logger";

/** A staff user (super agent / agent) as a chat participant. */
export interface ChatPerson {
  _id: mongoose.Types.ObjectId | string;
  name?: string | null;
  email?: string | null;
  role: string;
  avatar?: string | null;
}

interface PairConversation {
  _id: mongoose.Types.ObjectId;
  participants: mongoose.Types.ObjectId[];
}

const detail = (p: ChatPerson) => ({
  userId: new mongoose.Types.ObjectId(String(p._id)),
  name: p.name || p.email || "User",
  role: p.role,
  avatar: p.avatar ?? undefined,
});

/**
 * The one dm thread between two staff users, created on first use — the same
 * thread `POST /api/dm` opens, so a message sent here sits in the chat both
 * people already use, and the agent can reply privately. Staff-only: no
 * job-seeker / employer enrichment or rate limits (see app/api/dm/route.ts).
 */
export async function ensurePairConversation(a: ChatPerson, b: ChatPerson): Promise<{ conversation: PairConversation; created: boolean }> {
  const sortedIds = [String(a._id), String(b._id)]
    .map((id) => new mongoose.Types.ObjectId(id))
    .sort((x, y) => x.toString().localeCompare(y.toString()));
  const existing = await Conversation.findOne({ participants: { $all: sortedIds, $size: 2 } })
    .select("_id participants")
    .lean<PairConversation>();
  if (existing) return { conversation: existing, created: false };
  try {
    const created = await Conversation.create({
      participants: sortedIds,
      participantsKey: sortedIds.map((id) => id.toString()).join(":"),
      participantDetails: [detail(a), detail(b)],
      unreadCounts: {},
    });
    return { conversation: { _id: created._id, participants: created.participants }, created: true };
  } catch (err) {
    // Lost a race with the other side opening the same pair: use theirs.
    if ((err as { code?: number }).code === 11000) {
      const winner = await Conversation.findOne({ participants: { $all: sortedIds, $size: 2 } })
        .select("_id participants")
        .lean<PairConversation>();
      if (winner) return { conversation: winner, created: false };
    }
    throw err;
  }
}

/**
 * Posts one message into a pair thread exactly as `POST /api/dm/[id]/messages`
 * does: stores it, bumps the recipient's unread count and pushes it live.
 */
export async function postPairMessage(
  conversation: PairConversation,
  sender: ChatPerson,
  content: string,
): Promise<string> {
  const senderId = String(sender._id);
  const msg = await DirectMessage.create({
    conversationId: conversation._id,
    senderId: new mongoose.Types.ObjectId(senderId),
    content,
  });
  const recipientId = conversation.participants.map(String).find((id) => id !== senderId);
  await Conversation.findByIdAndUpdate(conversation._id, {
    lastMessage: content.length > 80 ? `${content.slice(0, 80)}…` : content,
    lastMessageAt: new Date(),
    lastSenderId: new mongoose.Types.ObjectId(senderId),
    ...(recipientId && { $inc: { [`unreadCounts.${recipientId}`]: 1 } }),
  });
  if (recipientId) {
    await triggerRealtimeEvent(recipientId, "new-message", {
      _id: msg._id.toString(),
      conversationId: conversation._id.toString(),
      senderId,
      senderName: sender.name || sender.email || "",
      content,
      createdAt: msg.createdAt.toISOString(),
    }).catch((err) => logger.error({ err, conversationId: conversation._id.toString() }, "team message realtime failed"));
  }
  return msg._id.toString();
}
