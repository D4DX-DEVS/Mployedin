import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth/config";
import { connectDB } from "@/lib/db/mongoose";
import { ConversationThread } from "@/models/ConversationThread";
import { isValidObjectId } from "@/lib/security/sanitize";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import type { UserRole } from "@/models/User";
import logger from "@/lib/logger";

interface AuthCtx {
  userId: string;
  role: UserRole;
}

/** Authorisation guard: caller must own the thread (matched on userId). */
async function assertOwnsThread(ctx: AuthCtx, threadId: string) {
  if (!isValidObjectId(threadId)) {
    return { ok: false as const, response: NextResponse.json({ error: "Invalid ID" }, { status: 400 }) };
  }
  const thread = await ConversationThread.findById(threadId).lean();
  if (!thread) {
    return { ok: false as const, response: NextResponse.json({ error: "Thread not found" }, { status: 404 }) };
  }
  // Admin can read any thread; everyone else must own it.
  if (ctx.role !== "admin" && String(thread.userId) !== String(ctx.userId)) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return { ok: true as const, thread };
}

/**
 * GET /api/ai/chat/drafts/[id]
 * Full thread for resume hydration on the chat page. Refuses expired threads
 * (older than 7d) with a 410 so the UI can show a clean "expired" message.
 */
export async function GET(
  _req: NextRequest,
  context: { params: Promise<Record<string, string>> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const role = (session.user as unknown as { role: UserRole }).role;
  const ctx: AuthCtx = { userId: session.user.id!, role };

  const { id } = await context.params;
  await connectDB();
  const owned = await assertOwnsThread(ctx, id);
  if (!owned.ok) return owned.response;

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  if (new Date(owned.thread.updatedAt) <= sevenDaysAgo || !owned.thread.isActive) {
    return NextResponse.json(
      { error: "This AI conversation draft has expired" },
      { status: 410 }
    );
  }

  return NextResponse.json({ thread: owned.thread });
}

/**
 * DELETE /api/ai/chat/drafts/[id]
 * Discards the thread by marking it inactive (soft-delete). The 7-day cron
 * will hard-delete inactive threads older than 24h, mirroring the
 * ExtractionDraft sweep pattern.
 */
export async function DELETE(
  _req: NextRequest,
  context: { params: Promise<Record<string, string>> }
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const role = (session.user as unknown as { role: UserRole }).role;
  const ctx: AuthCtx = { userId: session.user.id!, role };

  const { id } = await context.params;
  await connectDB();
  const owned = await assertOwnsThread(ctx, id);
  if (!owned.ok) return owned.response;

  await ConversationThread.findByIdAndUpdate(owned.thread._id, {
    $set: { isActive: false },
  });

  try {
    await logActivity({
      ...actorFromCtx(ctx),
      action: "ai_chat_draft.discarded",
      resource: "ai_chat_draft",
      resourceId: String(owned.thread._id),
    });
  } catch {
    /* audit log non-blocking */
  }

  return NextResponse.json({ success: true });
}

export const dynamic = "force-dynamic";
