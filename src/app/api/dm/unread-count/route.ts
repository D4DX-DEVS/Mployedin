import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import Conversation from "@/models/Conversation";
import mongoose from "mongoose";
import type { UserRole } from "@/models/User";

interface AuthCtx { userId: string; role: UserRole; }

/**
 * GET /api/dm/unread-count — total unread direct messages for the current
 * user (customer care excluded).
 *
 * The nav badge used to sum `unreadCounts` over the whole conversation list;
 * the list is paged now, so the total is summed here instead.
 */
async function handler(_req: NextRequest, ctx: AuthCtx) {
  await connectDB();

  const [row] = await Conversation.aggregate<{ total: number }>([
    {
      $match: {
        participants: new mongoose.Types.ObjectId(ctx.userId),
        type: { $ne: "customer_care" },
      },
    },
    {
      $group: {
        _id: null,
        total: { $sum: { $ifNull: [`$unreadCounts.${ctx.userId}`, 0] } },
      },
    },
  ]);

  return NextResponse.json({ total: row?.total ?? 0 });
}

export const GET = withAuth(handler);
