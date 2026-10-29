/**
 * The server half of broadcastAudience.ts: a broadcast is a service notice
 * (terms changed, downtime: every active user of the chosen roles) or
 * marketing. Marketing goes only to users who turned marketing on and have not
 * unsubscribed from everything (PECR reg 22: no promotional email without
 * consent). The admin picks one when sending.
 */
import NotificationPreference from "@/models/NotificationPreference";
import { broadcastRecipientQuery, type BroadcastPurpose } from "./broadcastAudience";

/**
 * Users who may receive marketing: the category is on and they have not
 * unsubscribed from everything. No preference document = never opted in.
 */
export async function marketingOptInUserIds(): Promise<unknown[]> {
  // ponytail: one distinct over every opted-in user; fine while opt-ins number in the thousands.
  return NotificationPreference.distinct("userId", {
    "categories.marketing.enabled": true,
    unsubscribedAll: { $ne: true },
  });
}

/** broadcastRecipientQuery narrowed by purpose: marketing adds the opt-in list. */
export async function broadcastAudienceQuery(
  targetAll: boolean,
  targetRoles: readonly string[] | null | undefined,
  purpose: BroadcastPurpose,
): Promise<Record<string, unknown>> {
  const query = broadcastRecipientQuery(targetAll, targetRoles);
  if (purpose === "marketing") query._id = { $in: await marketingOptInUserIds() };
  return query;
}
