/**
 * Drift between a subscription's frozen plan snapshot and the live plan.
 *
 * `planSnapshot` is written once, when the subscription is created or changed,
 * and every auto-renewal invoice is generated from it. Nothing re-reads the
 * plan afterwards, so editing a plan leaves existing subscribers on the old
 * terms indefinitely — an employer on the Free plan was still invoiced in USD
 * months after that plan moved to AED.
 *
 * The freeze is intentional: it grandfathers the price someone signed up at.
 * So this module only *reports* the difference. Applying it is an explicit act
 * by an admin, because re-syncing a snapshot re-prices a live customer.
 */

export type PlanLike = {
  name?: string;
  tier?: number;
  price?: number;
  currency?: string;
  billingCycle?: string;
};

export type SnapshotLike = PlanLike | null | undefined;

export type SnapshotDriftField = {
  field: "name" | "tier" | "price" | "currency" | "billingCycle";
  /** What the subscriber is currently billed on. */
  was: string | number | undefined;
  /** What the live plan says today. */
  now: string | number | undefined;
};

const COMPARED_FIELDS = ["name", "tier", "price", "currency", "billingCycle"] as const;

/** Currency codes are stored inconsistently cased; "aed" and "AED" are one currency. */
function normalize(field: (typeof COMPARED_FIELDS)[number], value: unknown): unknown {
  if (value === null || value === undefined) return undefined;
  if (field === "currency" && typeof value === "string") return value.trim().toUpperCase();
  if (typeof value === "string") return value.trim();
  return value;
}

/**
 * Compare a live plan with a subscription's snapshot.
 *
 * Fields the plan does not define are skipped, so a partial plan document can
 * never report drift that would blank a snapshot value. A missing snapshot
 * counts as drifted on every field the plan does define.
 */
export function diffPlanSnapshot(plan: PlanLike, snapshot: SnapshotLike): SnapshotDriftField[] {
  const drift: SnapshotDriftField[] = [];

  for (const field of COMPARED_FIELDS) {
    const planValue = normalize(field, plan[field]);
    if (planValue === undefined) continue;

    const snapValue = normalize(field, snapshot?.[field]);
    if (snapValue !== planValue) {
      drift.push({
        field,
        was: snapshot?.[field] as string | number | undefined,
        now: plan[field] as string | number | undefined,
      });
    }
  }

  return drift;
}

/** True when a subscription is still billed against the plan. */
export const LIVE_SUBSCRIPTION_STATUSES = ["active", "suspended"] as const;
