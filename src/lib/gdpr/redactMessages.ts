import mongoose from "mongoose";
import DirectMessage from "@/models/DirectMessage";
import Message from "@/models/Message";
import Conversation from "@/models/Conversation";

/** What the other party sees in place of an erased user's message. */
export const REDACTED_MESSAGE = "Message deleted";

/**
 * GDPR erasure for conversations. The other participant keeps the thread (it is
 * their record too), but the erased user's words and identity are removed:
 * message text, their participant card, and a list preview that quotes them.
 */
export async function redactUserMessages(userId: string): Promise<void> {
  const me = new mongoose.Types.ObjectId(userId);

  await DirectMessage.updateMany({ senderId: me }, { $set: { content: REDACTED_MESSAGE } });
  await Message.updateMany({ senderId: me }, { $set: { content: REDACTED_MESSAGE, senderName: "Deleted User" } });

  const conversations = await Conversation.find({ participants: me }).select("_id").lean<{ _id: mongoose.Types.ObjectId }[]>();
  if (conversations.length === 0) return;

  await Conversation.updateMany(
    { participants: me },
    {
      $set: { "participantDetails.$[me].name": "Deleted User" },
      $unset: {
        "participantDetails.$[me].avatar": "",
        "participantDetails.$[me].headline": "",
        "participantDetails.$[me].companyName": "",
      },
    },
    { arrayFilters: [{ "me.userId": me }] },
  );

  // lastMessage is a copy of the newest message's text; clear it where that
  // newest message was the erased user's.
  const lastByUser = await DirectMessage.aggregate<{ _id: mongoose.Types.ObjectId }>([
    { $match: { conversationId: { $in: conversations.map((c) => c._id) } } },
    { $sort: { createdAt: -1 } },
    { $group: { _id: "$conversationId", senderId: { $first: "$senderId" } } },
    { $match: { senderId: me } },
    { $project: { _id: 1 } },
  ]);
  if (lastByUser.length > 0) {
    await Conversation.updateMany(
      { _id: { $in: lastByUser.map((c) => c._id) } },
      { $set: { lastMessage: REDACTED_MESSAGE } },
    );
  }
}
