import type { ApplicationStatus } from "@/models/Application";

/**
 * Offers the candidate can still act on. A countered offer is open too:
 * revising it turns it back into "pending". The partial unique index on
 * `offers` in `src/lib/db/indexes.ts` stops two offers sharing one of these
 * statuses on an application; POST /api/offers refuses any second open offer.
 */
export const OPEN_OFFER_STATUSES = ["pending", "countered"] as const;

/** Applications that can no longer receive or respond to an offer. */
export const CLOSED_APPLICATION_STATUSES: readonly ApplicationStatus[] = ["hired", "rejected", "withdrawn"];
