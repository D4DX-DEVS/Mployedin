import { createHash } from "node:crypto";
import { inngest } from "@/lib/inngest/client";
import logger from "@/lib/logger";
import type { JevFillRequest } from "@/lib/matching/recommend";

export const JEV_FILL_EVENT = "matching/jev.fill";

/** The best-scoring misses only: enough for the first pages a seeker sees. */
export const JEV_FILL_MAX_JOBS = 25;

/**
 * Queue a background fill. Never throws: a page must render even when Inngest
 * is unreachable. The event id is a hash of the request, so a seeker who
 * refreshes before the fill ran queues nothing new (Inngest drops duplicate
 * ids for 24 h).
 */
export async function queueJevFill(request: JevFillRequest): Promise<void> {
  try {
    const id = createHash("sha256").update(JSON.stringify(request)).digest("hex");
    await inngest.send({ id: `jev-fill-${id}`, name: JEV_FILL_EVENT, data: request });
  } catch (err) {
    logger.warn({ err, jobs: request.jobs.length }, "[jev-fill] could not queue background verdicts");
  }
}
