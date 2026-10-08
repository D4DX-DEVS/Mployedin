import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import Conversation from "@/models/Conversation";
import mongoose from "mongoose";
import { validateBody } from "@/lib/validators";
import { dmManageConversationSchema } from "@/lib/validators/dm";
import { logActivity } from "@/lib/audit/log";
import { assertParticipant } from "@/lib/dm/access";

interface AuthCtx { userId: string; tenantView?: unknown; }

/**
 * MS-2 / SEC-E8: clearing or deleting a thread is a PER-USER view change. Both
 * used to hard-delete every message for BOTH participants — one side could
 * destroy the other's record (and evidence). Now:
 *   - clear  → clearedAt[userId] = now: older messages are hidden from that
 *              participant only;
 *   - delete → userId joins hiddenFor (and history is cleared for them): the
 *              thread leaves their list until a new message arrives.
 * Support tickets (customer_care) are a record the platform keeps, and an
 * admin in tenant view must not rewrite someone else's inbox.
 */
async function loadManageable(ctx: AuthCtx, params?: Record<string, string>) {
  const conversationId = params?.conversationId ?? "";
  if (!mongoose.Types.ObjectId.isValid(conversationId)) {
    return { error: NextResponse.json({ error: "Invalid conversationId" }, { status: 400 }) };
  }
  if (ctx.tenantView) {
    return { error: NextResponse.json({ error: "Not available while viewing as another account" }, { status: 403 }) };
  }
  const conv = await assertParticipant(conversationId, ctx.userId);
  if (!conv) return { error: NextResponse.json({ error: "Not found or forbidden" }, { status: 404 }) };
  if (conv.type === "customer_care") {
    return { error: NextResponse.json({ error: "Support conversations cannot be cleared or deleted" }, { status: 409 }) };
  }
  return { conversationId };
}

/**
 * PATCH /api/dm/[conversationId]/manage
 * Body: { action: "clear" }
 * Hides the conversation's current messages from the caller only.
 */
async function patchHandler(req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  await connectDB();
  const { conversationId, error } = await loadManageable(ctx, params);
  if (error) return error;

  await validateBody(req, dmManageConversationSchema);

  await Conversation.updateOne(
    { _id: conversationId },
    { $set: { [`clearedAt.${ctx.userId}`]: new Date(), [`unreadCounts.${ctx.userId}`]: 0 } },
  );

  await logActivity({
    actorId: ctx.userId,
    action: "dm.conversation_clear",
    resource: "conversations",
    resourceId: conversationId,
    req,
  });

  return NextResponse.json({ success: true });
}

/**
 * DELETE /api/dm/[conversationId]/manage
 * Removes the conversation from the caller's list (and clears their history).
 * The other participant keeps the thread untouched.
 */
async function deleteHandler(req: NextRequest, ctx: AuthCtx, params?: Record<string, string>) {
  await connectDB();
  const { conversationId, error } = await loadManageable(ctx, params);
  if (error) return error;

  await Conversation.updateOne(
    { _id: conversationId },
    {
      $addToSet: { hiddenFor: new mongoose.Types.ObjectId(ctx.userId) },
      $set: { [`clearedAt.${ctx.userId}`]: new Date(), [`unreadCounts.${ctx.userId}`]: 0 },
    },
  );

  await logActivity({
    actorId: ctx.userId,
    action: "dm.conversation_delete",
    resource: "conversations",
    resourceId: conversationId,
    req,
  });

  return NextResponse.json({ success: true });
}

export const PATCH = withAuth(patchHandler);
export const DELETE = withAuth(deleteHandler);
