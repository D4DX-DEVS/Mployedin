import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import Conversation from "@/models/Conversation";
import User from "@/models/User";
import mongoose from "mongoose";
import type { UserRole } from "@/models/User";

interface AuthCtx { userId: string; role: UserRole; }

/**
 * GET /api/dm — list all conversations for the current user, sorted by latest message
 */
async function getHandler(req: NextRequest, ctx: AuthCtx) {
  await connectDB();

  const conversations = await Conversation.find({
    participants: new mongoose.Types.ObjectId(ctx.userId),
  })
    .sort({ lastMessageAt: -1, updatedAt: -1 })
    .lean();

  return NextResponse.json({ conversations });
}

/**
 * POST /api/dm — start or get a conversation with another user
 * Body: { recipientId: string }
 */
async function postHandler(req: NextRequest, ctx: AuthCtx) {
  await connectDB();

  const body = await req.json();
  const recipientId = String(body.recipientId ?? "");

  if (!recipientId || !mongoose.Types.ObjectId.isValid(recipientId)) {
    return NextResponse.json({ error: "recipientId is required" }, { status: 400 });
  }

  if (recipientId === ctx.userId) {
    return NextResponse.json({ error: "Cannot message yourself" }, { status: 400 });
  }

  // Sort participant IDs to guarantee uniqueness (A+B and B+A map to same conversation)
  const sortedIds = [ctx.userId, recipientId]
    .map((id) => new mongoose.Types.ObjectId(id))
    .sort((a, b) => a.toString().localeCompare(b.toString()));

  // Find existing or create new
  let conversation = await Conversation.findOne({ participants: { $all: sortedIds, $size: 2 } }).lean();

  if (!conversation) {
    // Load both users to get display names
    const [userA, userB] = await Promise.all([
      User.findById(ctx.userId).select("name email role image").lean(),
      User.findById(recipientId).select("name email role image").lean(),
    ]);

    if (!userA || !userB) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    conversation = await Conversation.create({
      participants: sortedIds,
      participantDetails: [
        { userId: userA._id, name: userA.name ?? userA.email ?? "User", role: userA.role, avatar: userA.image },
        { userId: userB._id, name: userB.name ?? userB.email ?? "User", role: userB.role, avatar: userB.image },
      ],
      unreadCounts: {},
    });
  }

  return NextResponse.json({ conversation });
}

export const GET = withAuth(getHandler);
export const POST = withAuth(postHandler);
