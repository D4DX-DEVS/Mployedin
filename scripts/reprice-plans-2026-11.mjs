/**
 * Move the subscription catalogue to market prices (November 2026).
 *
 * Benchmarks used (per month, AED; 1 AED ≈ 23.7 INR, 1 USD = 3.67 AED):
 *   - Naukri job postings: Standard ₹400, Classified ₹850, Hot Vacancy ₹1,650
 *     per post (≈ AED 17 / 36 / 70). A plan with several live jobs should cost
 *     no more than buying those posts one by one.
 *   - Indeed sponsored jobs: pay per click/application, minimum budget about
 *     USD 5 a day (≈ AED 550 a month) for ONE sponsored job.
 *   - Naukri paid job-seeker membership: about ₹740 a month (≈ AED 31).
 *
 *   Employer      jobs  apps/mo  seats   old AED   new AED   per job
 *   Free            2      20      1         0         0
 *   Silver         10     100      3       499        49     ≈ 5  (cheaper than one Naukri Classified post)
 *   Gold           50     500     10     1,499       129     ≈ 2.6
 *   Platinum        ∞       ∞       ∞     3,999*      249     (*stored as 599 INR by mistake)
 *
 *   Job seeker   apps/mo                 old AED   new AED
 *   Free           10                         0         0
 *   Premium        50                        49         9   (≈ ₹205, well below Naukri ≈ ₹740)
 *   Premium Plus    ∞                        99        19
 *
 * 2026-11-06 owner: first pass (199/499/999, 19/39) still read as too high in
 * INR, so cut ~75% to sit clearly under Naukri/Indeed for small employers.
 *
 * Every price stays editable on /admin/subscription-plans; this script only
 * sets the starting point and fixes Platinum's currency.
 *
 * Usage:
 *   node scripts/reprice-plans-2026-11.mjs                 # report only (default)
 *   node scripts/reprice-plans-2026-11.mjs --apply         # update the plans
 *   node scripts/reprice-plans-2026-11.mjs --apply --migrate
 *        # …and move current subscribers of those plans to the new price from
 *        # their next renewal (rewrites planSnapshot.price/currency only).
 *
 * Invoices already issued are never touched. While subscription enforcement
 * is OFF nobody is charged anyway; --migrate keeps every subscriber's stored
 * terms in line with the catalogue for when billing starts.
 */
import "dotenv/config";
import mongoose from "mongoose";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const MIGRATE = args.includes("--migrate");
if (MIGRATE && !APPLY) {
  console.error("--migrate needs --apply.");
  process.exit(1);
}

export const NEW_PRICES = [
  { targetRole: "employer", name: "Free", price: 0 },
  { targetRole: "employer", name: "Silver", price: 49 },
  { targetRole: "employer", name: "Gold", price: 129 },
  { targetRole: "employer", name: "Platinum", price: 249 },
  { targetRole: "job_seeker", name: "Free", price: 0 },
  { targetRole: "job_seeker", name: "Premium", price: 9 },
  { targetRole: "job_seeker", name: "Premium Plus", price: 19 },
];
const CURRENCY = "AED";
const LIVE = ["active", "suspended"];

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set");
  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  const plansCol = db.collection("subscriptionplans");
  const subsCol = db.collection("subscriptions");

  let planUpdates = 0;
  let subUpdates = 0;

  for (const target of NEW_PRICES) {
    const plans = await plansCol
      .find({ targetRole: target.targetRole, name: target.name, isActive: true })
      .toArray();
    if (plans.length === 0) {
      console.log(`⚠️  ${target.targetRole} "${target.name}": no active plan with that name — skipped`);
      continue;
    }
    for (const plan of plans) {
      const samePrice = plan.price === target.price && String(plan.currency).toUpperCase() === CURRENCY;
      const live = await subsCol.countDocuments({ planId: plan._id, status: { $in: LIVE } });
      const behind = await subsCol.countDocuments({
        planId: plan._id,
        status: { $in: LIVE },
        $or: [{ "planSnapshot.price": { $ne: target.price } }, { "planSnapshot.currency": { $ne: CURRENCY } }],
      });
      console.log(
        `${samePrice ? "✓ " : "✏️ "} ${target.targetRole.padEnd(10)} ${target.name.padEnd(13)} ` +
          `${plan.price} ${plan.currency} → ${target.price} ${CURRENCY}  ` +
          `(${live} live subscriber${live === 1 ? "" : "s"}, ${behind} on other terms)`,
      );
      if (!APPLY) continue;
      if (!samePrice) {
        await plansCol.updateOne(
          { _id: plan._id },
          { $set: { price: target.price, currency: CURRENCY, updatedAt: new Date() } },
        );
        planUpdates += 1;
      }
      if (MIGRATE && behind > 0) {
        const res = await subsCol.updateMany(
          {
            planId: plan._id,
            status: { $in: LIVE },
            $or: [{ "planSnapshot.price": { $ne: target.price } }, { "planSnapshot.currency": { $ne: CURRENCY } }],
          },
          { $set: { "planSnapshot.price": target.price, "planSnapshot.currency": CURRENCY } },
        );
        subUpdates += res.modifiedCount;
      }
    }
  }

  console.log("");
  if (!APPLY) {
    console.log("Report only. Re-run with --apply (plans) or --apply --migrate (plans + current subscribers).");
  } else {
    console.log(`Plans updated: ${planUpdates}.${MIGRATE ? ` Subscribers moved to the new terms: ${subUpdates}.` : ""}`);
    console.log("Already-issued invoices were not touched.");
  }
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("FAILED:", err.message);
  process.exit(1);
});
