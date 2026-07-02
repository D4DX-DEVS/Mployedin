import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import Conversation from "@/models/Conversation";
import User from "@/models/User";
import mongoose from "mongoose";
import type { UserRole } from "@/models/User";
import { triggerRealtimeEvent } from "@/lib/realtime";
import { validateBody } from "@/lib/validators";
import { customerCareTicketSchema } from "@/lib/validators/dm";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import logger from "@/lib/logger";

interface AuthCtx {
  userId: string;
  role: UserRole;
}

// Support ticket categories
const VALID_CATEGORIES = ["account", "job_search", "technical", "billing", "other"] as const;

/**
 * GET /api/dm/customer-care — list customer care conversations
 *
 * - admin: sees ALL customer care conversations
 * - job_seeker: sees only their own customer care conversations
 */
async function getHandler(req: NextRequest, ctx: AuthCtx) {
  await connectDB();

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status"); // open, assigned, resolved, closed
  const category = searchParams.get("category");
  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get("limit") ?? "20", 10)));

  // Build query
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const query: Record<string, any> = { type: "customer_care" };

  if (ctx.role === "job_seeker") {
    // Job seekers only see their own conversations
    query.participants = new mongoose.Types.ObjectId(ctx.userId);
  } else if (ctx.role !== "admin") {
    return NextResponse.json(
      { error: "Only admins and job seekers can access customer care" },
      { status: 403 }
    );
  }

  if (status && ["open", "assigned", "resolved", "closed"].includes(status)) {
    query["customerCare.status"] = status;
  }
  if (category && VALID_CATEGORIES.includes(category as typeof VALID_CATEGORIES[number])) {
    query["customerCare.category"] = category;
  }

  const [conversations, total] = await Promise.all([
    Conversation.find(query)
      .sort({ "customerCare.priority": -1, lastMessageAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Conversation.countDocuments(query),
  ]);

  return NextResponse.json({
    conversations,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
}

/**
 * POST /api/dm/customer-care — create a customer care conversation
 *
 * Only job_seeker role can create. Creates a conversation between the job seeker
 * and a system admin account. The admin will see it in their customer care inbox.
 *
 * Body: { category?: string, message: string }
 */
async function postHandler(req: NextRequest, ctx: AuthCtx) {
  await connectDB();

  if (ctx.role !== "job_seeker") {
    return NextResponse.json(
      { error: "Only job seekers can create support tickets" },
      { status: 403 }
    );
  }

  const body = await validateBody(req, customerCareTicketSchema);
  const message = body.message;
  const category = body.category;

  const jobSeekerUser = await User.findById(ctx.userId)
    .select("_id name email role image")
    .lean();

  if (!jobSeekerUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Check for existing open customer care conversation for this job seeker
  const existing = await Conversation.findOne({
    type: "customer_care",
    participants: new mongoose.Types.ObjectId(ctx.userId),
    "customerCare.status": { $in: ["open", "assigned"] },
  }).lean();

  // Find admin with fewest open support tickets (round-robin assignment)
  const adminUsers = await User.find({ role: "admin" })
    .select("_id name email role image")
    .lean();

  if (!adminUsers.length) {
    return NextResponse.json(
      { error: "No support agent available. Please try again later." },
      { status: 503 }
    );
  }

  let adminUser = adminUsers[0];
  if (adminUsers.length > 1) {
    const adminIds = adminUsers.map((a) => a._id);
    const openCounts = await Conversation.aggregate([
      {
        $match: {
          type: "customer_care",
          "customerCare.status": { $in: ["open", "assigned"] },
          participants: { $in: adminIds },
        },
      },
      { $unwind: "$participants" },
      { $match: { participants: { $in: adminIds } } },
      { $group: { _id: "$participants", count: { $sum: 1 } } },
    ]);
    const countMap = new Map(openCounts.map((r) => [r._id.toString(), r.count as number]));
    adminUser = adminUsers.reduce((best, cur) =>
      (countMap.get(cur._id.toString()) ?? 0) < (countMap.get(best._id.toString()) ?? 0)
        ? cur
        : best
    );
  }

  if (existing) {
    // Return existing conversation — don't create duplicate
    return NextResponse.json({ conversation: existing, existing: true });
  }

  // Sort participant IDs for consistency
  const sortedIds = [jobSeekerUser._id, adminUser._id].sort((a, b) =>
    a.toString().localeCompare(b.toString())
  );

  const conversation = await Conversation.create({
    type: "customer_care",
    participants: sortedIds,
    participantDetails: [
      {
        userId: jobSeekerUser._id,
        name: jobSeekerUser.name ?? jobSeekerUser.email ?? "Job Seeker",
        role: jobSeekerUser.role,
        avatar: jobSeekerUser.image,
      },
      {
        userId: adminUser._id,
        name: "MployedIn Support",
        role: adminUser.role,
        avatar: adminUser.image,
      },
    ],
    customerCare: {
      status: "open",
      priority: "medium",
      category,
    },
    lastMessage: message,
    lastMessageAt: new Date(),
    lastSenderId: jobSeekerUser._id,
    unreadCounts: { [adminUser._id.toString()]: 1 },
  });

  // Create the first message
  const { default: DirectMessage } = await import("@/models/DirectMessage");
  await DirectMessage.create({
    conversationId: conversation._id,
    senderId: jobSeekerUser._id,
    content: message,
  });

  // Notify admin in real-time
  await triggerRealtimeEvent(adminUser._id.toString(), "new-conversation", {
    conversation: conversation.toObject(),
    type: "customer_care",
  }).catch((err) => logger.error({ err, conversationId: conversation._id.toString() }, "Failed to notify admin of new customer care conversation"));

  await logActivity({
    ...actorFromCtx(ctx),
    action: "dm.customer_care_create",
    resource: "conversations",
    resourceId: conversation._id.toString(),
    meta: { category },
    req,
  });

  return NextResponse.json({ conversation: conversation.toObject() }, { status: 201 });
}

export const GET = withAuth(getHandler);
export const POST = withAuth(postHandler);
