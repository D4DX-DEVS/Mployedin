/**
 * Who an employer's email sequence may reach. Sequences are marketing (the
 * employer types any address in Campaigns), so PECR reg 22 applies: a step goes
 * only to an active account that turned marketing on and has not unsubscribed
 * from everything — the same rule as admin marketing broadcasts
 * (broadcastAudienceServer.ts). An address with no account has never consented.
 * Checked before every step, so turning marketing off mid-sequence stops it.
 */
import NotificationPreference from "@/models/NotificationPreference";
import User from "@/models/User";

/** Lower-cased address → the opted-in account's user id. Addresses missing from the map must not be sent to. */
export async function sequenceConsentByEmail(emails: readonly string[]): Promise<Map<string, string>> {
  const wanted = [...new Set(emails.map((e) => e.trim().toLowerCase()).filter(Boolean))];
  if (wanted.length === 0) return new Map();

  const users = await User.find({ email: { $in: wanted }, isActive: true })
    .select("_id email")
    .lean<{ _id: unknown; email: string }[]>();
  if (users.length === 0) return new Map();

  const optedIn = await NotificationPreference.distinct("userId", {
    userId: { $in: users.map((u) => u._id) },
    "categories.marketing.enabled": true,
    unsubscribedAll: { $ne: true },
  });
  const optedInIds = new Set(optedIn.map(String));

  const consent = new Map<string, string>();
  for (const user of users) {
    const id = String(user._id);
    if (optedInIds.has(id)) consent.set(user.email.toLowerCase(), id);
  }
  return consent;
}
