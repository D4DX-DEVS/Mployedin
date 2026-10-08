/**
 * Plan-change pricing for online checkout.
 *
 * Rules (kept deliberately simple and explainable on the invoice):
 * - No current paid subscription → "new": full price of the new plan.
 * - Moving UP (higher tier, or same tier and higher price) mid-period →
 *   "upgrade": the unused, already-paid days of the current plan are credited
 *   against the new plan's full price; the new plan starts a fresh period on
 *   payment. Credit = currentPrice × remainingTime / periodLength, floored to
 *   the cent, never more than either price. No credit across currencies.
 * - Moving DOWN → "downgrade": nothing is charged now; the change is scheduled
 *   for the end of the current (paid) period.
 */

import { toCents } from "@/lib/payments/currency";

export interface ProrationCurrent {
  status: string;
  startDate: Date | string;
  endDate: Date | string;
  planSnapshot?: { tier?: number; price?: number; currency?: string } | null;
}

export interface ProrationPlan {
  tier: number;
  price: number;
  currency: string;
}

export interface PlanChangeQuote {
  kind: "new" | "upgrade" | "downgrade";
  /** Full price of the target plan. */
  listPrice: number;
  /** Unused-days credit from the current plan (0 when none). */
  credit: number;
  /** Amount to charge now (0 for a scheduled downgrade). */
  amount: number;
  currency: string;
  remainingDays: number;
  periodDays: number;
  /** When a downgrade takes effect. */
  effectiveAt?: Date;
  /** Credit skipped because the plans are priced in different currencies. */
  currencyMismatch?: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;

export function isDowngrade(current: ProrationCurrent, plan: ProrationPlan): boolean {
  const curTier = current.planSnapshot?.tier ?? 0;
  const curPrice = current.planSnapshot?.price ?? 0;
  if (plan.tier !== curTier) return plan.tier < curTier;
  return plan.price < curPrice;
}

export function computePlanChangeQuote(
  current: ProrationCurrent | null | undefined,
  plan: ProrationPlan,
  now: Date = new Date(),
): PlanChangeQuote {
  const listPrice = plan.price;
  const base = { listPrice, currency: plan.currency, remainingDays: 0, periodDays: 0 };

  const curPrice = current?.planSnapshot?.price ?? 0;
  const live =
    current &&
    (current.status === "active" || current.status === "past_due") &&
    new Date(current.endDate).getTime() > now.getTime();

  // Nothing paid is running (none, free plan, or lapsed) → buy outright.
  if (!current || !live || curPrice <= 0) {
    return { ...base, kind: current && live ? "upgrade" : "new", credit: 0, amount: listPrice };
  }

  const start = new Date(current.startDate).getTime();
  const end = new Date(current.endDate).getTime();
  const periodMs = Math.max(end - start, 1);
  const remainingMs = Math.min(Math.max(end - now.getTime(), 0), periodMs);
  const periodDays = Math.round(periodMs / DAY_MS);
  const remainingDays = Math.ceil(remainingMs / DAY_MS);

  if (isDowngrade(current, plan)) {
    return {
      ...base,
      kind: "downgrade",
      credit: 0,
      amount: 0,
      remainingDays,
      periodDays,
      effectiveAt: new Date(end),
    };
  }

  // Past-due periods were never paid → no credit.
  const curCurrency = (current.planSnapshot?.currency ?? plan.currency).toUpperCase();
  if (current.status === "past_due") {
    return { ...base, kind: "upgrade", credit: 0, amount: listPrice, remainingDays, periodDays };
  }
  if (curCurrency !== plan.currency.toUpperCase()) {
    return { ...base, kind: "upgrade", credit: 0, amount: listPrice, remainingDays, periodDays, currencyMismatch: true };
  }

  const creditCents = Math.min(
    Math.floor((toCents(curPrice) * remainingMs) / periodMs),
    toCents(curPrice),
    toCents(listPrice),
  );
  const amountCents = Math.max(toCents(listPrice) - creditCents, 0);

  return {
    ...base,
    kind: "upgrade",
    credit: creditCents / 100,
    amount: amountCents / 100,
    remainingDays,
    periodDays,
  };
}
