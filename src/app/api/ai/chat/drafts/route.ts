import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth/config";
import { connectDB } from "@/lib/db/mongoose";
import { ConversationThread } from "@/models/ConversationThread";
import { validateBody } from "@/lib/validators";
import { commonSchemas } from "@/lib/validators";
import type { UserRole } from "@/models/User";
import logger from "@/lib/logger";

/**
 * Conversation drafts endpoints for the AI Job Creator chat.
 *
 * `ConversationThread{ context: "job_creator" }` already exists as a model —
 * these endpoints just expose a resume surface for the dashboard cards and
 * the chat page itself. No new model.
 *
 *   POST   /api/ai/chat/drafts          → upsert (create or append) after each
 *                                          completed assistant response, returns
 *                                          { threadId }
 *   GET    /api/ai/chat/drafts          → list the employer's job_creator
 *                                          threads (summary projection for the
 *                                          dashboard card)
 *   GET    /api/ai/chat/drafts/[id]     → full thread for resume hydration
 *   DELETE /api/ai/chat/drafts/[id]     → discard
 */

// ── POST upsert schema ────────────────────────────────────────────────────
const messageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string().max(8000),
});

const upsertChatDraftSchema = z.object({
  /** Omit on first save (creates a new thread); pass on subsequent saves to
   *  append rather than fork. */
  threadId: commonSchemas.objectId.optional(),
  messages: z.array(messageSchema).min(1).max(50),
  /** Current extracted draft, if the AI has produced one. Stored in `meta`
   *  alongside the messages so resume can rehydrate both. */
  extractedJob: z.record(z.string(), z.unknown()).optional(),
  extractedBulkJobs: z.array(z.record(z.string(), z.unknown())).max(10).optional(),
});

/**
 * GET /api/ai/chat/drafts
 * Returns the employer's job_creator threads (newest first), each with a
 * short summary suitable for the dashboard card. Excludes expired threads
 * (updatedAt older than 7 days — same window as ExtractionDraft).
 */
export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const role = (session.user as unknown as { role: UserRole }).role;
  if (role !== "employer" && role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    await connectDB();

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const threads = await ConversationThread.find({
      userId: session.user.id,
      context: "job_creator",
      isActive: true,
      updatedAt: { $gt: sevenDaysAgo },
    })
      .sort({ updatedAt: -1 })
      .limit(10)
      .select("_id title messages updatedAt createdAt")
      .lean();

    const summaries = threads.map((th) => {
      const msgs = th.messages ?? [];
      const lastAssistant = [...msgs].reverse().find((m) => m.role === "assistant");
      return {
        _id: String(th._id),
        title: th.title || (msgs[0]?.content?.slice(0, 60) ?? "AI job draft"),
        messageCount: msgs.length,
        preview: (lastAssistant?.content ?? "").slice(0, 140),
        hasExtractedJob: Boolean(
          (msgs.some((m) => m.role === "assistant" && /<JOB_DATA>|<BULK_JOB_DATA>/.test(m.content)))
        ),
        updatedAt: th.updatedAt,
        createdAt: th.createdAt,
      };
    });

    return NextResponse.json({ threads: summaries });
  } catch (err) {
    logger.error({ err }, "[ai-chat/drafts] list error");
    return NextResponse.json(
      { error: "Failed to load AI chat drafts" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/ai/chat/drafts
 * Upsert the conversation after each completed assistant response. Creates
 * a new thread on the first call (no threadId), appends to the existing one
 * thereafter. Mirrors ChatGPT's "save after each assistant reply" cadence —
 * NOT per token.
 *
 * NOTE: messages are stored wholesale (full transcript). On each upsert we
 * REPLACE the messages array rather than append, so the caller must always
 * send the complete current message set (the client already keeps this in
 * state). This keeps the persisted transcript authoritative and avoids
 * dedup/ordering bugs.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const role = (session.user as unknown as { role: UserRole }).role;
  if (role !== "employer" && role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await validateBody(req, upsertChatDraftSchema);
    await connectDB();

    // Title: derived from the first user message (max 80 chars) so the
    // dashboard card shows something meaningful.
    const firstUserMsg = body.messages.find((m) => m.role === "user");
    const title = (firstUserMsg?.content ?? "AI job draft").slice(0, 80);

    const meta: Record<string, unknown> = {};
    if (body.extractedJob) meta.extractedJob = body.extractedJob;
    if (body.extractedBulkJobs) meta.extractedBulkJobs = body.extractedBulkJobs;

    const sanitisedMessages = body.messages.map((m) => ({
      role: m.role,
      content: m.content,
      timestamp: new Date(),
    }));

    if (body.threadId) {
      // Append-mode: replace the entire transcript atomically.
      const updated = await ConversationThread.findOneAndUpdate(
        { _id: body.threadId, userId: session.user.id, context: "job_creator" },
        {
          $set: {
            messages: sanitisedMessages,
            title,
            ...(Object.keys(meta).length > 0 ? { meta } : {}),
          },
        },
        { new: true }
      ).lean();
      if (!updated) {
        return NextResponse.json({ error: "Thread not found" }, { status: 404 });
      }
      return NextResponse.json({ threadId: String(updated._id) });
    }

    // Create-mode.
    const created = await ConversationThread.create({
      userId: session.user.id,
      context: "job_creator",
      title,
      messages: sanitisedMessages,
      isActive: true,
      ...(Object.keys(meta).length > 0 ? { meta } : {}),
    });
    return NextResponse.json({ threadId: String(created._id) });
  } catch (err) {
    logger.error({ err }, "[ai-chat/drafts] upsert error");
    return NextResponse.json(
      { error: "Failed to save AI chat draft" },
      { status: 500 }
    );
  }
}
