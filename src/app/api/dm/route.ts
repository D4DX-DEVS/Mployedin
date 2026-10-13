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
import { validateBody } from "@/lib/validators";
import { dmStartConversationSchema } from "@/lib/validators/dm";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import logger from "@/lib/logger";
import { canEmployerStartConversation } from "@/lib/dm/employerContacts";
import { applyLiveAvatars } from "@/lib/dm/liveAvatars";
import { escapeRegex } from "@/lib/security/sanitize";
import { getSuperAgentTeamAgentUserIds } from "@/lib/auth/agentRestrictions";

interface AuthCtx { userId: string; role: UserRole; }

/**
 * Role-based messaging permission matrix.
 *
 *   admin       → anyone                 ✅
 *   super_agent → admin, agent, employer  ✅
 *   agent       → super_agent, employer   ✅
 *   employer    → its applicants, its agent, admin (support)  ✅
 *   job_seeker  → employer, job_seeker    ✅  (rate-limited: 10 new conversations/day)
 *   same role   → same role               ❌ (except job_seeker ↔ job_seeker)
 */
function canRolesMessage(from: UserRole, to: UserRole): "yes" | "no" {
  if (from === "admin") return "yes";
  if (from === "super_agent") return to !== "super_agent" ? "yes" : "no";

  const allowed: Partial<Record<UserRole, UserRole[]>> = {
    job_seeker: ["employer", "job_seeker"],
    employer: ["job_seeker", "agent", "admin"],
    agent: ["employer", "super_agent"],
  };
  return allowed[from]?.includes(to) ? "yes" : "no";
}

/** Max new conversations a job seeker can create per day */
const JOB_SEEKER_DAILY_CONV_LIMIT = 10;

/** Conversations per page in the Messages list. */
const DM_PAGE_DEFAULT = 30;
const DM_PAGE_MAX = 50;

interface DmCursor { at: Date | null; id: mongoose.Types.ObjectId }

/** Cursor = `<lastMessageAt ms | "none">_<conversation id>` of the last row sent. */
function parseCursor(raw: string | null): DmCursor | null {
  if (!raw) return null;
  const [at, id] = raw.split("_");
  if (!id || !mongoose.Types.ObjectId.isValid(id)) return null;
  if (at === "none") return { at: null, id: new mongoose.Types.ObjectId(id) };
  const ms = Number(at);
  if (!Number.isFinite(ms)) return null;
  return { at: new Date(ms), id: new mongoose.Types.ObjectId(id) };
}

/**
 * GET /api/dm — the current user's DM conversations (customer care excluded),
 * newest message first, one page at a time.
 *
 * Query: `limit` (max 50, default 30), `cursor` (the previous page's
 * `nextCursor`), `search` (the other participant's name, headline or company).
 * Keyset paging rather than skip: a new message moves a conversation to the
 * top, and an offset would then repeat or drop rows on the next page.
 * Conversations with no message yet sort last, newest first.
 */
async function getHandler(req: NextRequest, ctx: AuthCtx) {
  await connectDB();

  const params = new URL(req.url).searchParams;
  const limitRaw = parseInt(params.get("limit") ?? "", 10);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, DM_PAGE_MAX) : DM_PAGE_DEFAULT;
  const cursor = parseCursor(params.get("cursor"));
  const search = (params.get("search") ?? "").trim().slice(0, 100);
  const me = new mongoose.Types.ObjectId(ctx.userId);

  const and: Record<string, unknown>[] = [
    { participants: me },
    { type: { $ne: "customer_care" } },
  ];
  if (search) {
    const rx = new RegExp(escapeRegex(search), "i");
    and.push({
      participantDetails: {
        $elemMatch: {
          userId: { $ne: me },
          $or: [{ name: rx }, { headline: rx }, { companyName: rx }],
        },
      },
    });
  }
  if (cursor) {
    and.push(
      cursor.at
        ? {
            $or: [
              { lastMessageAt: { $lt: cursor.at } },
              { lastMessageAt: cursor.at, _id: { $lt: cursor.id } },
              { lastMessageAt: null },
            ],
          }
        : { lastMessageAt: null, _id: { $lt: cursor.id } }
    );
  }

  const rows = await Conversation.find({ $and: and })
    .sort({ lastMessageAt: -1, _id: -1 })
    .limit(limit + 1)
    .lean();

  const hasMore = rows.length > limit;
  const conversations = hasMore ? rows.slice(0, limit) : rows;
  const last = conversations[conversations.length - 1] as { _id: unknown; lastMessageAt?: Date | null } | undefined;
  const nextCursor = hasMore && last
    ? `${last.lastMessageAt ? new Date(last.lastMessageAt).getTime() : "none"}_${String(last._id)}`
    : null;

  await applyLiveAvatars(conversations);

  return NextResponse.json({ conversations, nextCursor });
}

/**
 * POST /api/dm — start or get a conversation with another user
 * Body: { recipientId: string }
 */
async function postHandler(req: NextRequest, ctx: AuthCtx) {
  await connectDB();

  const body = await validateBody(req, dmStartConversationSchema);
  const recipientId = body.recipientId;

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

    // Owner decision 2026-10-13: a super agent starts chats only with agents
    // in their own team. Existing chats are untouched.
    if (roleA === "super_agent" && roleB === "agent") {
      const teamIds = await getSuperAgentTeamAgentUserIds(ctx.userId);
      if (!teamIds.some((id) => String(id) === String(userB._id))) {
        return NextResponse.json(
          { error: "You can message agents in your own team.", code: "not_in_team" },
          { status: 403 }
        );
      }
    }

    // Owner decision 2026-10-06 (QA EMP-001): an employer opens conversations
    // only with its own applicants, its agent and support — not the directory.
    if (roleA === "employer" && !(await canEmployerStartConversation(ctx.userId, userB))) {
      return NextResponse.json(
        {
          error: "You can message people who applied to your jobs, your agent and the support team.",
          code: "not_connected",
        },
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
      participantsKey: sortedIds.map((id) => id.toString()).join(":"),
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
      await triggerRealtimeEvent(recipientObjectId.toString(), "new-conversation", { conversation }).catch((err) => logger.error({ err, conversationId: conv._id.toString() }, "Failed to notify recipient of new conversation"));
    }
  }

  await logActivity({
    ...actorFromCtx(ctx),
    action: "dm.conversation_create",
    resource: "conversations",
    resourceId: (conversation as unknown as { _id: { toString(): string } })._id.toString(),
    meta: { recipientId },
    req,
  });

  return NextResponse.json({ conversation });
}

export const GET = withAuth(getHandler);
export const POST = withAuth(postHandler);
