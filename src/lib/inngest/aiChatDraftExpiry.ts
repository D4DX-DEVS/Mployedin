/**
 * AI Chat Conversation Draft Expiry — Inngest Cron Function
 *
 * Runs daily at 04:30 UTC (offset 30min from the extraction-draft sweep so the
 * two DB-heavy sweeps don't contend). Marks job_creator conversation threads
 * older than 7 days as inactive, then hard-deletes inactive threads older than
 * 24h (the same grace-window pattern as extractionDraftExpiry).
 *
 * Why a cron and not a Mongo TTL index: same rationale as the extraction-draft
 * cron — we want a soft-delete (`isActive=false`) for one day so a returning
 * user sees a clean "expired" message instead of a silent 410.
 */

import { inngest } from "./client";
import { connectDB } from "@/lib/db/mongoose";
import { ConversationThread } from "@/models/ConversationThread";
import logger from "@/lib/logger";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const GRACE_WINDOW_MS = 24 * 60 * 60 * 1000;

export const aiChatDraftExpiryCron = inngest.createFunction(
  {
    id: "ai-chat-draft-expiry",
    name: "AI Chat Draft Expiry (04:30)",
    retries: 2,
    concurrency: { limit: 1 },
    triggers: [{ cron: "30 4 * * *" }], // 04:30 UTC daily
  },
  async ({ step }: { step: any }) => {
    await step.run("connect-db", () => connectDB());

    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - SEVEN_DAYS_MS);
    const oneDayAgo = new Date(now.getTime() - GRACE_WINDOW_MS);

    // Step 1 — mark job_creator threads not touched in 7d as inactive.
    const marked = await step.run("mark-expired", () =>
      ConversationThread.updateMany(
        {
          context: "job_creator",
          isActive: true,
          updatedAt: { $lte: sevenDaysAgo },
        },
        { $set: { isActive: false } }
      ).then((r) => r.modifiedCount)
    );

    // Step 2 — hard-delete threads that have been inactive ≥ 24h. Covers both
    // the just-marked-expired ones (after a day) and explicitly-discarded ones.
    const deleted = await step.run("hard-delete-aged", () =>
      ConversationThread.deleteMany({
        context: "job_creator",
        isActive: false,
        updatedAt: { $lte: oneDayAgo },
      }).then((r) => r.deletedCount)
    );

    logger.info(
      { marked, deleted },
      "[ai-chat-draft-expiry] sweep complete"
    );

    return { marked, deleted };
  }
);
