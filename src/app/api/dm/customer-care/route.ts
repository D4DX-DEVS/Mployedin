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

  // Find the first admin user to pair as the support agent
  const adminUser = await User.findOne({ role: "admin" })
    .select("_id name email role image")
    .lean();

  if (!adminUser) {
    return NextResponse.json(
      { error: "No support agent available. Please try again later." },
      { status: 503 }
    );
  }

  const jobSeekerUser = await User.findById(ctx.userId)
    .select("_id name email role image")
    .lean();

  if (!jobSeekerUser) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // Check for existing open customer care conversation
  const existing = await Conversation.findOne({
    type: "customer_care",
    participants: { $all: [jobSeekerUser._id, adminUser._id] },
    "customerCare.status": { $in: ["open", "assigned"] },
  }).lean();

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
  }).catch(() => {});

  return NextResponse.json({ conversation: conversation.toObject() }, { status: 201 });
}

export const GET = withAuth(getHandler);
export const POST = withAuth(postHandler);
