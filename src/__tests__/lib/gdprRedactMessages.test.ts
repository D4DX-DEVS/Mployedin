/**
 * @jest-environment node
 *
 * GDPR erasure used to keep everything the user had written in direct messages
 * and team chat, plus their name and photo on the other party's conversation
 * list. The counterparty keeps the thread; the erased user's words and
 * identity go.
 */
import mongoose from "mongoose";

const dmUpdateMany = jest.fn().mockResolvedValue({ modifiedCount: 3 });
const dmAggregate = jest.fn();
const msgUpdateMany = jest.fn().mockResolvedValue({ modifiedCount: 1 });
const convFind = jest.fn();
const convUpdateMany = jest.fn().mockResolvedValue({ modifiedCount: 1 });

jest.mock("@/models/DirectMessage", () => ({
  __esModule: true,
  default: { updateMany: (...a: unknown[]) => dmUpdateMany(...a), aggregate: (...a: unknown[]) => dmAggregate(...a) },
}));
jest.mock("@/models/Message", () => ({ __esModule: true, default: { updateMany: (...a: unknown[]) => msgUpdateMany(...a) } }));
jest.mock("@/models/Conversation", () => ({
  __esModule: true,
  default: { find: (...a: unknown[]) => convFind(...a), updateMany: (...a: unknown[]) => convUpdateMany(...a) },
}));

import { redactUserMessages, REDACTED_MESSAGE } from "@/lib/gdpr/redactMessages";

const USER = new mongoose.Types.ObjectId().toString();
const C1 = new mongoose.Types.ObjectId();
const C2 = new mongoose.Types.ObjectId();

beforeEach(() => {
  jest.clearAllMocks();
  convFind.mockReturnValue({ select: () => ({ lean: () => Promise.resolve([{ _id: C1 }, { _id: C2 }]) }) });
  // C1's latest message is the erased user's, C2's is the other person's.
  dmAggregate.mockResolvedValue([{ _id: C1 }]);
});

describe("redactUserMessages", () => {
  it("replaces the text of every direct message and team-chat message the user sent", async () => {
    await redactUserMessages(USER);
    expect(dmUpdateMany).toHaveBeenCalledWith(
      { senderId: new mongoose.Types.ObjectId(USER) },
      { $set: { content: REDACTED_MESSAGE } },
    );
    expect(msgUpdateMany).toHaveBeenCalledWith(
      { senderId: new mongoose.Types.ObjectId(USER) },
      { $set: { content: REDACTED_MESSAGE, senderName: "Deleted User" } },
    );
  });

  it("anonymises the user's card in every conversation they were part of", async () => {
    await redactUserMessages(USER);
    expect(convUpdateMany).toHaveBeenCalledWith(
      { participants: new mongoose.Types.ObjectId(USER) },
      {
        $set: { "participantDetails.$[me].name": "Deleted User" },
        $unset: {
          "participantDetails.$[me].avatar": "",
          "participantDetails.$[me].headline": "",
          "participantDetails.$[me].companyName": "",
        },
      },
      { arrayFilters: [{ "me.userId": new mongoose.Types.ObjectId(USER) }] },
    );
  });

  it("clears the preview only where the user wrote the last message", async () => {
    await redactUserMessages(USER);
    expect(convUpdateMany).toHaveBeenCalledWith({ _id: { $in: [C1] } }, { $set: { lastMessage: REDACTED_MESSAGE } });
  });

  it("does nothing more for a user with no conversations", async () => {
    convFind.mockReturnValue({ select: () => ({ lean: () => Promise.resolve([]) }) });
    await redactUserMessages(USER);
    expect(dmAggregate).not.toHaveBeenCalled();
  });
});
