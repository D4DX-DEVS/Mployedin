import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import Conversation from "@/models/Conversation";
import User from "@/models/User";
import JobSeeker from "@/models/JobSeeker";
import Employer from "@/models/Employer";
import mongoose from "mongoose";
import type { UserRole } from "@/models/User";
import { triggerRealtimeEvent } from "@/lib/realtime";

interface AuthCtx { userId: string; role: UserRole; }

/**
 * Role-based messaging permission matrix.
 *
 *   admin       → anyone                 ✅
 *   super_agent → admin, agent, employer  ✅
 *   agent       → super_agent, employer   ✅
 *   employer    → job_seeker, agent, super_agent  ✅
 *   job_seeker  → employer, job_seeker    ✅  (rate-limited: 10 new conversations/day)
 *   same role   → same role               ❌ (except job_seeker ↔ job_seeker)
 */
function canRolesMessage(from: UserRole, to: UserRole): "yes" | "no" {
  if (from === "admin") return "yes";
  if (from === "super_agent") return to !== "super_agent" ? "yes" : "no";

  const allowed: Partial<Record<UserRole, UserRole[]>> = {
    job_seeker: ["employer", "job_seeker"],
    employer: ["job_seeker", "agent", "super_agent"],
    agent: ["employer", "super_agent"],
  };
  return allowed[from]?.includes(to) ? "yes" : "no";
}

/** Max new conversations a job seeker can create per day */
const JOB_SEEKER_DAILY_CONV_LIMIT = 10;

/**
 * GET /api/dm — list all DM conversations for the current user (excludes customer care)
 */
async function getHandler(req: NextRequest, ctx: AuthCtx) {
  await connectDB();

  const conversations = await Conversation.find({
    participants: new mongoose.Types.ObjectId(ctx.userId),
    type: { $ne: "customer_care" },
  })
    .sort({ lastMessageAt: -1, updatedAt: -1 })
    .lean();

  // Backfill missing avatars — older conversations may have been created
  // before the avatar field was correctly populated.
  const missingAvatarIds = new Set<string>();
  for (const conv of conversations) {
    for (const p of conv.participantDetails ?? []) {
      if (!p.avatar) missingAvatarIds.add(p.userId.toString());
    }
  }

  if (missingAvatarIds.size > 0) {
    const users = await User.find({
      _id: { $in: [...missingAvatarIds].map((id) => new mongoose.Types.ObjectId(id)) },
    })
      .select("_id avatar")
      .lean();

    const avatarMap = new Map<string, string>();
    for (const u of users) {
      if (u.avatar) avatarMap.set(u._id.toString(), u.avatar);
    }

    for (const conv of conversations) {
      for (const p of conv.participantDetails ?? []) {
        if (!p.avatar) {
          const a = avatarMap.get(p.userId.toString());
          if (a) p.avatar = a;
        }
      }
    }
  }

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
    // Rate limit: job seekers can only create 10 new conversations per day
    if (ctx.role === "job_seeker") {
      const dayStart = new Date();
      dayStart.setHours(0, 0, 0, 0);
      const todayCount = await Conversation.countDocuments({
        participants: new mongoose.Types.ObjectId(ctx.userId),
        type: "dm",
        createdAt: { $gte: dayStart },
      });
      if (todayCount >= JOB_SEEKER_DAILY_CONV_LIMIT) {
        return NextResponse.json(
          { error: `You can start up to ${JOB_SEEKER_DAILY_CONV_LIMIT} new conversations per day. Please try again tomorrow.` },
          { status: 429 }
        );
      }
    }

    // Load both users to get display names
    const [userA, userB] = await Promise.all([
      User.findById(ctx.userId).select("name email role avatar").lean(),
      User.findById(recipientId).select("name email role avatar").lean(),
    ]);

    if (!userA || !userB) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const roleA = userA.role as UserRole;
    const roleB = userB.role as UserRole;
    const permission = canRolesMessage(roleA, roleB);

    if (permission === "no") {
      return NextResponse.json(
        { error: "Messaging between these roles is not allowed." },
        { status: 403 }
      );
    }

    // Enrich participant details with headline/companyName
    const [jobSeekerA, jobSeekerB, employerA, employerB] = await Promise.all([
      userA.role === "job_seeker" ? JobSeeker.findOne({ userId: userA._id }).select("headline").lean() : null,
      userB.role === "job_seeker" ? JobSeeker.findOne({ userId: userB._id }).select("headline").lean() : null,
      userA.role === "employer" ? Employer.findOne({ userId: userA._id }).select("companyName logo").lean() : null,
      userB.role === "employer" ? Employer.findOne({ userId: userB._id }).select("companyName logo").lean() : null,
    ]);

    conversation = await Conversation.create({
      participants: sortedIds,
      participantDetails: [
        {
          userId: userA._id,
          name: userA.name ?? userA.email ?? "User",
          role: userA.role,
          avatar: userA.avatar ?? employerA?.logo,
          headline: jobSeekerA?.headline,
          companyName: employerA?.companyName,
        },
        {
          userId: userB._id,
          name: userB.name ?? userB.email ?? "User",
          role: userB.role,
          avatar: userB.avatar ?? employerB?.logo,
          headline: jobSeekerB?.headline,
          companyName: employerB?.companyName,
        },
      ],
      unreadCounts: {},
    });
  }

  // Notify recipient in real-time so their conversation list updates immediately
  if (conversation) {
    const conv = conversation as unknown as { _id: { toString(): string }; participants: { toString(): string }[] };
    const recipientObjectId = conv.participants.find((p) => p.toString() !== ctx.userId);
    if (recipientObjectId) {
      await triggerRealtimeEvent(recipientObjectId.toString(), "new-conversation", { conversation }).catch(() => {});
    }
  }

  return NextResponse.json({ conversation });
}

export const GET = withAuth(getHandler);
export const POST = withAuth(postHandler);
