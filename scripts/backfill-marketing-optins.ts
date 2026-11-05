/**
 * Copy marketing opt-ins given before 2026-10-28 onto the switch senders read.
 *
 * Since the UK GDPR work every marketing sender (admin marketing broadcasts,
 * re-engagement, profile reminders, employer email sequences) reads
 * NotificationPreference `categories.marketing.enabled`. Job seekers who ticked
 * "yes to marketing" earlier have only `JobSeeker.marketingConsent = true`, so
 * they now get nothing.
 *
 * Only safe cases are copied:
 *  - no preference document → created with marketing on;
 *  - a document that never stored a marketing category → marketing on;
 *  - marketing stored off (the default every document is created with) on a
 *    document not changed since the seeker's latest logged "yes" → marketing on.
 * Skipped and listed: marketing off on a document changed after that "yes", or
 * with no logged "yes" (could be an unsubscribe link or a settings change),
 * `unsubscribedAll`, inactive accounts.
 * No ConsentLog row is written: the consent was given and logged then.
 *
 * Usage:
 *   npx tsx --env-file=.env --tsconfig tsconfig.json scripts/backfill-marketing-optins.ts          # dry run
 *   ... --apply                                                                                     # write
 *
 * Idempotent: a second run finds nothing left to copy.
 */

import mongoose from "mongoose";
import JobSeeker from "@/models/JobSeeker";
import User from "@/models/User";
import NotificationPreference, { getOrCreatePreferences } from "@/models/NotificationPreference";
import ConsentLog from "@/models/ConsentLog";

const APPLY = process.argv.slice(2).includes("--apply");

type Outcome = "copy_new" | "copy_missing_category" | "copy_default_off" | "already_on" | "skip_marketing_off" | "skip_unsubscribed_all" | "skip_inactive";

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set");
  await mongoose.connect(uri);
  console.log(`Database: ${mongoose.connection.name} — ${APPLY ? "APPLY" : "dry run"}`);

  const seekers = await JobSeeker.find({ marketingConsent: true }).select("userId").lean<{ userId: unknown }[]>();
  const userIds = seekers.map((s) => s.userId).filter(Boolean);
  const activeIds = new Set(
    (await User.find({ _id: { $in: userIds }, isActive: true }).select("_id").lean<{ _id: unknown }[]>()).map((u) => String(u._id)),
  );
  // Read the stored documents through the driver: Mongoose fills in category defaults in memory.
  const stored = await NotificationPreference.collection
    .find({ userId: { $in: userIds } }, { projection: { userId: 1, unsubscribedAll: 1, updatedAt: 1, "categories.marketing": 1 } })
    .toArray();
  const prefByUser = new Map(stored.map((p) => [String(p.userId), p]));
  // Each seeker's latest marketing answer; only a "yes" counts as evidence.
  const latestAnswers = await ConsentLog.aggregate<{ _id: unknown; granted: boolean; at: Date }>([
    { $match: { userId: { $in: userIds }, consentType: "marketing" } },
    { $sort: { createdAt: -1 } },
    { $group: { _id: "$userId", granted: { $first: "$granted" }, at: { $first: "$createdAt" } } },
  ]);
  const latestYes = new Map(latestAnswers.filter((a) => a.granted).map((a) => [String(a._id), new Date(a.at).getTime()]));

  const counts: Record<Outcome, number> = {
    copy_new: 0, copy_missing_category: 0, copy_default_off: 0, already_on: 0, skip_marketing_off: 0, skip_unsubscribed_all: 0, skip_inactive: 0,
  };

  for (const rawId of userIds) {
    const userId = String(rawId);
    const pref = prefByUser.get(userId);
    const marketing = (pref?.categories as { marketing?: { enabled?: boolean } } | undefined)?.marketing;
    let outcome: Outcome;
    if (!activeIds.has(userId)) outcome = "skip_inactive";
    else if (!pref) outcome = "copy_new";
    else if (pref.unsubscribedAll === true) outcome = "skip_unsubscribed_all";
    else if (!marketing) outcome = "copy_missing_category";
    else if (marketing.enabled === true) outcome = "already_on";
    else {
      const yesAt = latestYes.get(userId);
      const prefAt = pref.updatedAt ? new Date(pref.updatedAt as Date).getTime() : Infinity;
      outcome = yesAt !== undefined && prefAt <= yesAt ? "copy_default_off" : "skip_marketing_off";
    }
    counts[outcome]++;
    console.log(`${outcome.padEnd(22)} ${userId}`);

    if (APPLY && outcome.startsWith("copy_")) {
      await getOrCreatePreferences(userId);
      await NotificationPreference.updateOne({ userId }, { $set: { "categories.marketing.enabled": true } });
    }
  }

  console.log(`\nSeekers with marketingConsent=true: ${userIds.length}`);
  console.log(JSON.stringify(counts, null, 2));
  if (!APPLY) console.log("Dry run — nothing written. Re-run with --apply.");
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect();
  process.exit(1);
});
