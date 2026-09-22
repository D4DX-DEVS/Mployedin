import Conversation from "@/models/Conversation";

/**
 * Returns the conversation only if `userId` is one of its participants,
 * otherwise `null`. Callers treat `null` as "not found or not yours" so a
 * non-participant cannot distinguish a missing conversation from someone
 * else's.
 */
export async function assertParticipant(conversationId: string, userId: string) {
  const conv = await Conversation.findById(conversationId).lean();
  if (!conv) return null;
  const isParticipant = conv.participants.some((p) => p.toString() === userId);
  return isParticipant ? conv : null;
}
