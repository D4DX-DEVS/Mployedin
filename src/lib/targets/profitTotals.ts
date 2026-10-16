export interface ProfitByCurrency {
  currency: string;
  target: number;
  achieved: number;
}

export interface ProfitTotals {
  /** Currency of `target` and `achieved`: the one with the largest target. Null with no plans. */
  currency: string | null;
  target: number;
  achieved: number;
  /** Every other currency, listed and never added in. */
  others: ProfitByCurrency[];
}

const round2 = (amount: number) => Math.round(amount * 100) / 100;

/**
 * Profit targets and achievement across plans, one currency at a time. A
 * profit target is an amount in its plan's currency and nothing converts, so
 * adding an INR plan to an AED one would produce a number in no currency at all.
 */
export function profitTotals(
  profiles: { currency?: string | null; profitTarget: number; profitAchieved: number }[],
): ProfitTotals {
  const byCurrency = new Map<string, ProfitByCurrency>();
  for (const profile of profiles) {
    // A plan without a currency predates the field; the schema default is AED.
    const currency = profile.currency || "AED";
    const row = byCurrency.get(currency) ?? { currency, target: 0, achieved: 0 };
    row.target += profile.profitTarget;
    row.achieved += profile.profitAchieved;
    byCurrency.set(currency, row);
  }
  const [main, ...others] = [...byCurrency.values()]
    .map((row) => ({ ...row, target: round2(row.target), achieved: round2(row.achieved) }))
    .sort((left, right) => right.target - left.target || right.achieved - left.achieved || left.currency.localeCompare(right.currency));
  return { currency: main?.currency ?? null, target: main?.target ?? 0, achieved: main?.achieved ?? 0, others };
}
