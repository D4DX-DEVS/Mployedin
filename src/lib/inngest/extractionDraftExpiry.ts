/**
 * Extraction Draft Expiry — Inngest Cron Function
 *
 * Runs daily at 04:00 UTC. Deletes AI extraction drafts whose 7-day `expiresAt`
 * window has elapsed. Why a cron instead of a MongoDB TTL index?
 *   1. We want `status: "expired"` for a beat before hard-delete so the user
 *      sees a graceful "expired" message on resume, not a 410 on a missing doc.
 *      A TTL index goes straight to delete — no chance to surface the reason.
 *   2. Centralised in the existing `scheduledCrons` registration pattern, so
 *      it shows up in the same observability surface as the other 11 crons.
 *
 * Two-step sweep (each pass idempotent):
 *   step 1 — mark expired:    active && expiresAt <= now  →  status="expired"
 *   step 2 — hard-delete:     status="expired" && updatedAt <= now - 24h
 *                              (one-day grace window so an employer who opens
 *                               the resume card the morning after expiry sees
 *                               "expired", not silence)
 */

import { inngest } from "./client";
import { connectDB } from "@/lib/db/mongoose";
import { ExtractionDraft } from "@/models/ExtractionDraft";
import logger from "@/lib/logger";

export const extractionDraftExpiryCron = inngest.createFunction(
  {
    id: "extraction-draft-expiry",
    name: "Extraction Draft Expiry (04:00)",
    retries: 2,
    concurrency: { limit: 1 },
    triggers: [{ cron: "0 4 * * *" }], // 04:00 UTC daily
  },
  async ({ step }: { step: any }) => {
    await connectDB();

    const now = new Date();
    const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Step 1 — flip active+past-expiry drafts to "expired".
    const marked = await step.run("mark-expired", () =>
      ExtractionDraft.updateMany(
        { status: "active", expiresAt: { $lte: now } },
        { $set: { status: "expired" } }
      ).then((r) => r.modifiedCount)
    );

    // Step 2 — hard-delete drafts that have already been "expired" for ≥ 24h.
    const deleted = await step.run("hard-delete-aged", () =>
      ExtractionDraft.deleteMany({
        status: "expired",
        updatedAt: { $lte: oneDayAgo },
      }).then((r) => r.deletedCount)
    );

    logger.info(
      { marked, deleted },
      "[extraction-draft-expiry] sweep complete"
    );

    return { marked, deleted };
  }
);
