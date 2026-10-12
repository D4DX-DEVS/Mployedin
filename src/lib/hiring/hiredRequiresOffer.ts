import type mongoose from "mongoose";
import Offer from "@/models/Offer";

/**
 * Hired needs an accepted offer (owner decision 2026-10-12, audit FUNC-006).
 * Accepting an offer moves the application to "hired" by itself
 * (`/api/offers/[id]`); a manual move to Hired — any stage whose phase is
 * hired — is refused unless the candidate has accepted one. Without this a
 * candidate could go Shortlisted → Hired in one click with nothing behind it.
 */
export const OFFER_REQUIRED = "OFFER_REQUIRED";

export const OFFER_REQUIRED_MESSAGE =
  "Send the candidate an offer first. They become Hired when they accept it.";

/** The ids (as strings) among `applicationIds` that hold an accepted offer. */
export async function withAcceptedOffer(
  applicationIds: ReadonlyArray<string | mongoose.Types.ObjectId>,
): Promise<Set<string>> {
  if (!applicationIds.length) return new Set();
  const rows = (await Offer.find({ applicationId: { $in: applicationIds }, status: "accepted" })
    .select("applicationId")
    .lean()) as Array<{ applicationId?: unknown }>;
  return new Set(rows.map((r) => String(r.applicationId)));
}
