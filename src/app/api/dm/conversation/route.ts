import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import Conversation from "@/models/Conversation";
import { applyLiveAvatars } from "@/lib/dm/liveAvatars";
import mongoose from "mongoose";
import type { UserRole } from "@/models/User";

interface AuthCtx { userId: string; role: UserRole; }

/**
 * GET /api/dm/conversation?id=<conversationId>
 * Fetch a single conversation by ID (must be a participant).
 * Used when navigating to a newly-created conversation that has no messages yet.
 */
async function handler(req: NextRequest, ctx: AuthCtx) {
  await connectDB();

  const url = new URL(req.url);
  const id = url.searchParams.get("id") ?? "";

  if (!id || !mongoose.Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const conversation = await Conversation.findOne({
    _id: new mongoose.Types.ObjectId(id),
    participants: new mongoose.Types.ObjectId(ctx.userId),
  }).lean();

  if (!conversation) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await applyLiveAvatars([conversation]);

  return NextResponse.json({ conversation });
}

export const GET = withAuth(handler);
