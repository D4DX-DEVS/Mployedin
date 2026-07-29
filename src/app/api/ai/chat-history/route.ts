import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth/withAuth";
import { connectDB } from "@/lib/db/mongoose";
import ConversationThread from "@/models/ConversationThread";
import type { ConversationContext } from "@/models/ConversationThread";
import { validateBody } from "@/lib/validators";
import { chatHistoryCreateSchema } from "@/lib/validators/misc";
import { logActivity, actorFromCtx } from "@/lib/audit/log";
import logger from "@/lib/logger";

/**
 * GET /api/ai/chat-history
 * Returns recent conversation threads for the current user.
 */
export const GET = withAuth(async (req: NextRequest, ctx) => {
  await connectDB();
  const { searchParams } = new URL(req.url);
  const context = searchParams.get("context");
  const limit = parseInt(searchParams.get("limit") ?? "10");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filter: any = { userId: ctx.userId, isActive: true };
  if (context) filter.context = context;

  const threads = await ConversationThread.find(filter)
    .sort({ updatedAt: -1 })
    .limit(limit)
    .select("_id title context createdAt updatedAt messages")
    .lean();

  return NextResponse.json({ threads });
});

/**
 * POST /api/ai/chat-history
 * Creates a new conversation thread or appends messages to an existing one.
 * Body: { threadId?: string, context: string, messages: [{role, content}], title?: string }
 */
export const POST = withAuth(async (req: NextRequest, ctx) => {
  try {
    await connectDB();
    const { threadId, context, messages, title } = await validateBody(req, chatHistoryCreateSchema) as {
      threadId?: string | null;
      context: ConversationContext;
      messages: { role: "user" | "assistant"; content: string }[];
      title?: string | null;
    };

    logger.info({ threadId, context, userId: ctx.userId, msgCount: messages.length }, "[chat-history] POST");

    if (threadId) {
      // Append to existing thread
      const thread = await ConversationThread.findOneAndUpdate(
        { _id: threadId, userId: ctx.userId },
        {
          $push: { messages: { $each: messages.map((m) => ({ ...m, timestamp: new Date() })) } },
          ...(title && { title }),
        },
        { returnDocument: "after" }
      );
      if (!thread) return NextResponse.json({ error: "Thread not found" }, { status: 404 });
      await logActivity({ ...actorFromCtx(ctx), action: "ai.chat_append", resource: "conversation_threads", resourceId: threadId, req });
      return NextResponse.json({ threadId: thread._id });
    }

    // Create new thread
    const thread = await ConversationThread.create({
      userId: ctx.userId,
      context: context ?? "general_assist",
      title: title ?? "New conversation",
      messages: messages.map((m) => ({ ...m, timestamp: new Date() })),
    });

    logger.info({ threadId: String(thread._id) }, "[chat-history] Created thread");

    await logActivity({ ...actorFromCtx(ctx), action: "ai.chat_create", resource: "conversation_threads", resourceId: String(thread._id), meta: { context }, req });

    return NextResponse.json({ threadId: thread._id }, { status: 201 });
  } catch (err) {
    logger.error({ err }, "[chat-history] POST error");
    return NextResponse.json({ error: "Failed to save chat" }, { status: 500 });
  }
});

/**
 * DELETE /api/ai/chat-history?threadId=xxx
 * Soft-deletes a thread (sets isActive: false).
 */
export const DELETE = withAuth(async (req: NextRequest, ctx) => {
  await connectDB();
  const threadId = new URL(req.url).searchParams.get("threadId");
  if (!threadId) return NextResponse.json({ error: "threadId required" }, { status: 400 });

  await ConversationThread.findOneAndUpdate(
    { _id: threadId, userId: ctx.userId },
    { isActive: false }
  );

  await logActivity({ ...actorFromCtx(ctx), action: "ai.chat_delete", resource: "conversation_threads", resourceId: threadId, req });

  return NextResponse.json({ success: true });
});
