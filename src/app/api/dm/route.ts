import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import Conversation from "@/models/Conversation";
import User from "@/models/User";
import JobSeeker from "@/models/JobSeeker";
import Employer from "@/models/Employer";
import Agent from "@/models/Agent";
import Application from "@/models/Application";
import mongoose from "mongoose";
import type { UserRole } from "@/models/User";
import { triggerRealtimeEvent } from "@/lib/realtime";

interface AuthCtx { userId: string; role: UserRole; }

/**
 * Role-based messaging permission matrix.
 *
 *   admin       → anyone            ✅
 *   super_agent → admin, agent, employer  ✅
 *   agent       → super_agent, employer   ✅
 *   employer    → agent, super_agent      ✅
 *   agent       ↔ job_seeker        ⚠️  (conditional — requires assignment or active application)
 *   job_seeker  → (customer care only — use /api/dm/customer-care)
 *   same role   → same role         ❌ (prevents peer spam)
 */
function canRolesMessage(from: UserRole, to: UserRole): "yes" | "no" | "conditional" {
  if (from === "admin") return "yes";

  // Job seekers use customer care only — no direct DMs
  if (from === "job_seeker") return "no";
  // Nobody can directly DM a job seeker except via customer care (admin can via customer care system)
  if (to === "job_seeker") return "no";

  if (from === "super_agent") return to !== "super_agent" ? "yes" : "no";

  const allowed: Partial<Record<UserRole, UserRole[]>> = {
    employer: ["agent", "super_agent"],
    agent: ["employer", "super_agent"],
  };
  return allowed[from]?.includes(to) ? "yes" : "no";
}

/**
 * Context-based unlock for agent ↔ job_seeker messaging.
 * Allowed if:
 *   1. Agent is directly assigned to the job seeker (Agent.assignedJobSeekerIds or JobSeeker.agentId)
 *   2. An active application exists where this agent is involved with this job seeker
 *   3. A shortlisted/advanced application with aiMatchScore ≥ 70 managed by this agent
 *
 * Returns { allowed, reason } — reason is the user-facing message when blocked.
 */
async function checkAgentJobSeekerContext(
  agentUserId: string,
  jobSeekerUserId: string
): Promise<{ allowed: boolean; reason: string }> {
  const [agentDoc, jobSeekerDoc] = await Promise.all([
    Agent.findOne({ userId: new mongoose.Types.ObjectId(agentUserId) })
      .select("_id assignedJobSeekerIds")
      .lean(),
    JobSeeker.findOne({ userId: new mongoose.Types.ObjectId(jobSeekerUserId) })
      .select("_id agentId")
      .lean(),
  ]);

  if (!agentDoc || !jobSeekerDoc) {
    return { allowed: false, reason: "Profile not found." };
  }

  // Check 1: Direct assignment
  const assignedToAgent =
    jobSeekerDoc.agentId?.toString() === agentDoc._id.toString() ||
    agentDoc.assignedJobSeekerIds.some((id: mongoose.Types.ObjectId) => id.toString() === jobSeekerDoc._id.toString());

  if (assignedToAgent) return { allowed: true, reason: "" };

  // Check 2: Active application where this agent is involved with this job seeker
  const activeApplication = await Application.findOne({
    jobSeekerId: jobSeekerDoc._id,
    agentId: agentDoc._id,
    status: { $nin: ["rejected", "withdrawn"] },
  })
    .select("_id")
    .lean();

  if (activeApplication) return { allowed: true, reason: "" };

  // Check 3: High-match shortlisted application managed by this agent
  const highMatchApplication = await Application.findOne({
    jobSeekerId: jobSeekerDoc._id,
    agentId: agentDoc._id,
    status: { $in: ["shortlisted", "interview_scheduled", "selected", "offer", "hired"] },
    aiMatchScore: { $gte: 70 },
  })
    .select("_id")
    .lean();

  if (highMatchApplication) return { allowed: true, reason: "" };

  return {
    allowed: false,
    reason:
      "Agents can only message job seekers they are assigned to or have an active application with.",
  };
}

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

    const roleA = userA.role as UserRole;
    const roleB = userB.role as UserRole;
    const permission = canRolesMessage(roleA, roleB);

    if (permission === "no") {
      return NextResponse.json(
        { error: "Messaging between these roles is not allowed." },
        { status: 403 }
      );
    }

    if (permission === "conditional") {
      // Determine which is the agent and which is the job seeker
      const agentUserId = roleA === "agent" ? ctx.userId : recipientId;
      const jobSeekerUserId = roleA === "job_seeker" ? ctx.userId : recipientId;

      const { allowed, reason } = await checkAgentJobSeekerContext(agentUserId, jobSeekerUserId);
      if (!allowed) {
        return NextResponse.json({ error: reason }, { status: 403 });
      }
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
          avatar: userA.image,
          headline: jobSeekerA?.headline,
          companyName: employerA?.companyName,
        },
        {
          userId: userB._id,
          name: userB.name ?? userB.email ?? "User",
          role: userB.role,
          avatar: userB.image,
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
