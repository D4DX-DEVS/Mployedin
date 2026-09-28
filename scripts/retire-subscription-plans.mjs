/**
 * Retire every subscription plan outside the current catalogue, moving the
 * people still on those plans to the top plan of their audience first.
 *
 * Why this exists: the plan list carried test and legacy plans (`ssss`,
 * `hiufd`, an old USD "Enterprise") next to the real catalogue, and dozens of
 * live subscriptions pointed at them — or at plan documents deleted long ago,
 * or at no plan at all. The admin UI can only deactivate a plan while anyone
 * is subscribed to it, so the junk rows could never leave the list.
 *
 * What --apply does, in one transaction:
 *   1. Every LIVE subscription (active / suspended) whose plan is not in
 *      KEEP_SLUGS is moved to the highest-tier kept plan for its role
 *      (employer → Platinum, job seeker → Premium Plus): planId + a fresh
 *      planSnapshot, auto-renew OFF (so the nightly cron never issues a
 *      top-plan renewal invoice), end date kept — or pushed one billing cycle
 *      out when it has already passed, so nobody expires the same night.
 *   2. One SubscriptionHistory row per move (performedByRole "system").
 *   3. Employer.subscriptionType (legacy mirror) is set for moved employers.
 *   4. Every plan outside KEEP_SLUGS is deleted. Cancelled / expired
 *      subscriptions may still point at one — history renders from the
 *      frozen planSnapshot, never from the plan document, so that is safe.
 *
 * No invoice is issued and no issued invoice is touched.
 *
 * Usage:
 *   node scripts/retire-subscription-plans.mjs          # report only (default)
 *   node scripts/retire-subscription-plans.mjs --apply  # perform the migration
 */

import "dotenv/config";
import mongoose from "mongoose";

const APPLY = process.argv.includes("--apply");

/** The catalogue that stays (owner decision 2026-09-28). */
const KEEP_SLUGS = {
  employer: ["employer_free", "employer_silver", "employer_gold", "employer_platinum"],
  job_seeker: ["job_seeker_free", "job_seeker_premium", "job_seeker_premium_plus"],
};
const LIVE_STATUSES = ["active", "suspended"];
const MIGRATION = "plan-catalogue-cleanup-2026-09-28";
const CYCLE_MS = {
  monthly: 30 * 24 * 60 * 60 * 1000,
  quarterly: 90 * 24 * 60 * 60 * 1000,
  yearly: 365 * 24 * 60 * 60 * 1000,
};

/** Same shape as buildPlanSnapshot() in src/lib/subscription/helpers.ts. */
function buildPlanSnapshot(plan) {
  return {
    name: plan.name,
    tier: plan.tier,
    price: plan.price,
    currency: plan.currency,
    billingCycle: plan.billingCycle,
    employerLimits: plan.employerLimits ? JSON.parse(JSON.stringify(plan.employerLimits)) : undefined,
    jobSeekerLimits: plan.jobSeekerLimits ? JSON.parse(JSON.stringify(plan.jobSeekerLimits)) : undefined,
  };
}

/** Same rule as tierToLegacyType() in src/lib/subscription/helpers.ts. */
const tierToLegacyType = (tier) => (tier >= 2 ? "premium" : "basic");

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set");
  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  const now = new Date();

  const plans = await db.collection("subscriptionplans").find({}).toArray();
  const keepSlugs = new Set(Object.values(KEEP_SLUGS).flat());
  const kept = plans.filter((p) => keepSlugs.has(p.slug));
  const retired = plans.filter((p) => !keepSlugs.has(p.slug));

  // Refuse to run against a catalogue that does not look like the one decided on.
  const target = {};
  for (const [role, slugs] of Object.entries(KEEP_SLUGS)) {
    for (const slug of slugs) {
      const plan = kept.find((p) => p.slug === slug);
      if (!plan) throw new Error(`Kept plan "${slug}" does not exist`);
      if (!plan.isActive) throw new Error(`Kept plan "${slug}" is inactive`);
    }
    const rolePlans = kept.filter((p) => p.targetRole === role).sort((a, b) => b.tier - a.tier);
    target[role] = rolePlans[0];
  }
  for (const plan of retired) {
    if (plan.isDefault) throw new Error(`Retired plan "${plan.slug}" is the ${plan.targetRole} default`);
  }

  const keptIds = kept.map((p) => p._id);
  const plansById = new Map(plans.map((p) => [String(p._id), p]));
  const toMove = await db.collection("subscriptions").find({
    status: { $in: LIVE_STATUSES },
    $or: [{ planId: { $nin: keptIds } }, { planId: null }],
  }).toArray();

  console.log(`Kept plans   : ${kept.map((p) => `${p.targetRole}/${p.name}`).join(", ")}`);
  console.log(`Top plans    : employer → ${target.employer.name}, job_seeker → ${target.job_seeker.name}`);
  console.log(`Retired plans: ${retired.map((p) => `${p.targetRole}/${p.name} (${p.slug})`).join(", ") || "none"}`);
  console.log("");

  const moves = toMove.map((sub) => {
    const to = target[sub.targetRole];
    if (!to) throw new Error(`Subscription ${sub._id} has unknown targetRole "${sub.targetRole}"`);
    const from = sub.planId ? plansById.get(String(sub.planId)) : undefined;
    const endDate = sub.endDate && sub.endDate > now
      ? sub.endDate
      : new Date(now.getTime() + (CYCLE_MS[to.billingCycle] ?? CYCLE_MS.monthly));
    return { sub, to, from, endDate, extended: endDate !== sub.endDate };
  });

  const summary = new Map();
  for (const m of moves) {
    const fromLabel = m.from ? m.from.name : `${m.sub.planSnapshot?.name ?? "?"} (plan ${m.sub.planId ? "deleted" : "missing"})`;
    const key = `${m.sub.targetRole}: ${fromLabel} → ${m.to.name}`;
    summary.set(key, (summary.get(key) ?? 0) + 1);
  }
  console.log(`Live subscriptions to move: ${moves.length}`);
  for (const [key, n] of summary) console.log(`  ${String(n).padStart(3)}  ${key}`);
  const extended = moves.filter((m) => m.extended).length;
  if (extended > 0) console.log(`  (${extended} already past their end date — pushed one billing cycle out)`);

  const retiredIds = retired.map((p) => p._id);
  const historicalRefs = await db.collection("subscriptions").countDocuments({
    planId: { $in: retiredIds },
    status: { $nin: LIVE_STATUSES },
  });
  console.log(`Cancelled/expired subscriptions left pointing at a retired plan: ${historicalRefs} (render from snapshot)`);

  if (!APPLY) {
    console.log("");
    console.log("Report only. Re-run with --apply to perform the migration.");
    await mongoose.disconnect();
    return;
  }

  const session = await mongoose.startSession();
  let result;
  try {
    await session.withTransaction(async () => {
      let moved = 0;
      let employersSynced = 0;
      for (const m of moves) {
        const res = await db.collection("subscriptions").updateOne(
          { _id: m.sub._id, status: { $in: LIVE_STATUSES } },
          {
            $set: {
              planId: m.to._id,
              planSnapshot: buildPlanSnapshot(m.to),
              autoRenew: false,
              endDate: m.endDate,
              updatedAt: now,
            },
          },
          { session },
        );
        if (res.modifiedCount !== 1) throw new Error(`Subscription ${m.sub._id} changed under the migration`);
        moved += 1;

        const oldTier = m.sub.planSnapshot?.tier ?? 0;
        await db.collection("subscriptionhistories").insertOne(
          {
            userId: m.sub.userId,
            subscriptionId: m.sub._id,
            action: m.to.tier >= oldTier ? "upgraded" : "downgraded",
            ...(m.sub.planId ? { fromPlanId: m.sub.planId } : {}),
            toPlanId: m.to._id,
            fromPlanName: m.sub.planSnapshot?.name ?? "Unknown",
            toPlanName: m.to.name,
            performedByRole: "system",
            reason: "Plan catalogue cleanup: retired plan replaced by the current top plan",
            meta: { migration: MIGRATION, oldTier, newTier: m.to.tier, autoRenewWas: m.sub.autoRenew ?? false },
            createdAt: now,
          },
          { session },
        );

        if (m.sub.targetRole === "employer") {
          const emp = await db.collection("employers").updateOne(
            { userId: m.sub.userId },
            { $set: { subscriptionType: tierToLegacyType(m.to.tier) } },
            { session },
          );
          employersSynced += emp.matchedCount;
        }
      }

      const stillLive = await db.collection("subscriptions").countDocuments(
        { planId: { $in: retiredIds }, status: { $in: LIVE_STATUSES } },
        { session },
      );
      if (stillLive > 0) throw new Error(`${stillLive} live subscription(s) still on a retired plan`);
      const del = await db.collection("subscriptionplans").deleteMany({ _id: { $in: retiredIds } }, { session });

      result = { moved, employersSynced, plansDeleted: del.deletedCount };
    });
  } finally {
    await session.endSession();
  }

  console.log("");
  console.log(`Moved ${result.moved} subscription(s); ${result.employersSynced} employer record(s) synced; ${result.plansDeleted} plan(s) deleted.`);
  console.log("No invoice was issued or modified.");
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("FAILED:", err.message);
  process.exit(1);
});
