/**
 * Application Retention — Inngest Cron Function
 *
 * Runs daily at 03:30 UTC. Anonymises applications whose job closed more than
 * 24 months ago (lib/gdpr/applicationRetention.ts). Each run handles one batch
 * and is idempotent: an anonymised application carries
 * `retentionAnonymisedAt` and is never picked again.
 */

import { inngest } from "./client";
import { connectDB } from "@/lib/db/mongoose";
import { anonymiseExpiredApplications } from "@/lib/gdpr/applicationRetention";
import logger from "@/lib/logger";

export const applicationRetentionCron = inngest.createFunction(
  {
    id: "application-retention",
    name: "Application Retention (03:30)",
    retries: 2,
    concurrency: { limit: 1 },
    triggers: [{ cron: "30 3 * * *" }], // 03:30 UTC daily
  },
  async ({ step }: { step: { run: <T>(id: string, fn: () => Promise<T>) => Promise<T> } }) => {
    await connectDB();
    const result = await step.run("anonymise-expired-applications", () => anonymiseExpiredApplications());
    logger.info(result, "[application-retention] sweep complete");
    return result;
  },
);
