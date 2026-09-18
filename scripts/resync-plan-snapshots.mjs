/**
 * Report — and optionally repair — drift between live subscriptions' frozen
 * `planSnapshot` and the plan they point at.
 *
 * Why this exists: a subscription copies its plan into `planSnapshot` when it
 * is created, and every auto-renewal invoice is written from that copy. Nothing
 * ever re-read the plan, so editing a plan never reached existing subscribers.
 * An employer on the Free plan kept being invoiced in USD long after that plan
 * had moved to AED — five invoices in two currencies for one account, with
 * nothing converting between them.
 *
 * The freeze is deliberate (it grandfathers the price someone signed up at),
 * which is why repairing drift is opt-in here and in the admin UI: re-syncing a
 * snapshot re-prices a live customer.
 *
 * Usage:
 *   node scripts/resync-plan-snapshots.mjs                 # report only (default)
 *   node scripts/resync-plan-snapshots.mjs --apply         # rewrite drifted snapshots
 *   node scripts/resync-plan-snapshots.mjs --apply --only-currency
 *                                                         # rewrite ONLY the currency,
 *                                                           leaving the frozen price alone
 *   node scripts/resync-plan-snapshots.mjs --plan <planId> # limit to one plan
 *
 * Already-issued invoices are never touched — they are a financial record.
 * This only changes what FUTURE renewals will be billed on.
 */

import "dotenv/config";
import mongoose from "mongoose";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const ONLY_CURRENCY = args.includes("--only-currency");
const PLAN_FILTER = args.includes("--plan") ? args[args.indexOf("--plan") + 1] : null;

const LIVE_STATUSES = ["active", "suspended"];
const COMPARED = ["name", "tier", "price", "currency", "billingCycle"];

function normalize(field, value) {
  if (value === null || value === undefined) return undefined;
  if (field === "currency" && typeof value === "string") return value.trim().toUpperCase();
  if (typeof value === "string") return value.trim();
  return value;
}

function diff(plan, snapshot) {
  const out = [];
  for (const field of COMPARED) {
    const planValue = normalize(field, plan?.[field]);
    if (planValue === undefined) continue;
    if (normalize(field, snapshot?.[field]) !== planValue) {
      out.push({ field, was: snapshot?.[field], now: plan[field] });
    }
  }
  return out;
}

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set");
  await mongoose.connect(uri);
  const db = mongoose.connection.db;

  const planQuery = PLAN_FILTER ? { _id: new mongoose.Types.ObjectId(PLAN_FILTER) } : {};
  const plans = await db.collection("subscriptionplans").find(planQuery).toArray();
  const plansById = new Map(plans.map((p) => [String(p._id), p]));

  const subQuery = { status: { $in: LIVE_STATUSES } };
  if (PLAN_FILTER) subQuery.planId = new mongoose.Types.ObjectId(PLAN_FILTER);
  const subs = await db.collection("subscriptions").find(subQuery).toArray();

  const drifted = [];
  let orphaned = 0;
  for (const sub of subs) {
    const plan = plansById.get(String(sub.planId));
    if (!plan) { orphaned += 1; continue; }
    const fields = diff(plan, sub.planSnapshot);
    if (fields.length > 0) drifted.push({ sub, plan, fields });
  }

  console.log(`Live subscriptions checked : ${subs.length}`);
  console.log(`Plans loaded               : ${plans.length}`);
  if (orphaned > 0) console.log(`Subscriptions with a missing plan: ${orphaned} (skipped)`);
  console.log(`Drifted                    : ${drifted.length}`);
  console.log("");

  for (const row of drifted) {
    console.log(`  ${row.sub._id}  plan="${row.plan.name}" (${row.plan.targetRole})`);
    for (const f of row.fields) {
      console.log(`      ${f.field}: ${JSON.stringify(f.was)} -> ${JSON.stringify(f.now)}`);
    }
  }

  if (!APPLY) {
    console.log("");
    console.log(drifted.length > 0
      ? "Report only. Re-run with --apply to rewrite these snapshots."
      : "Nothing to do.");
    await mongoose.disconnect();
    return;
  }

  let updated = 0;
  for (const row of drifted) {
    const set = ONLY_CURRENCY
      ? { "planSnapshot.currency": row.plan.currency }
      : {
          "planSnapshot.name": row.plan.name,
          "planSnapshot.tier": row.plan.tier,
          "planSnapshot.price": row.plan.price,
          "planSnapshot.currency": row.plan.currency,
          "planSnapshot.billingCycle": row.plan.billingCycle,
        };
    // Currency-only runs skip subscriptions whose currency already matches.
    if (ONLY_CURRENCY && !row.fields.some((f) => f.field === "currency")) continue;
    const res = await db.collection("subscriptions").updateOne({ _id: row.sub._id }, { $set: set });
    updated += res.modifiedCount;
  }

  console.log("");
  console.log(`Updated ${updated} subscription${updated === 1 ? "" : "s"}${ONLY_CURRENCY ? " (currency only)" : ""}.`);
  console.log("Already-issued invoices were not touched.");
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("FAILED:", err.message);
  process.exit(1);
});
