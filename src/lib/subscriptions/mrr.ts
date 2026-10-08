/**
 * Monthly recurring revenue normalisation, shared by the admin subscription
 * dashboard and the AI Data Access (/api/insights) layer so both report the
 * same MRR: price ÷ months in the billing cycle (yearly 12, quarterly 3, else 1).
 */

/** Aggregation expression over a Subscription document. */
export const MRR_EXPR = {
  $divide: [
    { $ifNull: ["$planSnapshot.price", 0] },
    {
      $switch: {
        branches: [
          { case: { $eq: ["$planSnapshot.billingCycle", "yearly"] }, then: 12 },
          { case: { $eq: ["$planSnapshot.billingCycle", "quarterly"] }, then: 3 },
        ],
        default: 1,
      },
    },
  ],
};

/** Same rule, in JS, for a single lean document. */
export function mrrOf(price: number | null | undefined, billingCycle: string | null | undefined): number {
  const p = typeof price === "number" && Number.isFinite(price) ? price : 0;
  const months = billingCycle === "yearly" ? 12 : billingCycle === "quarterly" ? 3 : 1;
  return Math.round((p / months) * 100) / 100;
}
