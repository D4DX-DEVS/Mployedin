export interface FinanceByCurrency {
  currency: string;
  target: number;
  achieved: number;
}

export interface FinanceTotals {
  /** Currency of `target` and `achieved`: the one with the largest target. Null with no plans. */
  currency: string | null;
  target: number;
  achieved: number;
  /** Every other currency, listed and never added in. */
  others: FinanceByCurrency[];
}

/**
 * Finance targets and achievement across plans, one currency at a time. A
 * finance target is an amount in its plan's currency and nothing converts, so
 * adding an INR plan to an AED one produced a number in no currency at all.
 */
export function financeTotals(
  profiles: { currency?: string | null; financeTarget: number; financeAchieved: number }[],
): FinanceTotals {
  const byCurrency = new Map<string, FinanceByCurrency>();
  for (const profile of profiles) {
    // A plan without a currency predates the field; the schema default is AED.
    const currency = profile.currency || "AED";
    const row = byCurrency.get(currency) ?? { currency, target: 0, achieved: 0 };
    row.target += profile.financeTarget;
    row.achieved += profile.financeAchieved;
    byCurrency.set(currency, row);
  }
  const [main, ...others] = [...byCurrency.values()]
    .sort((left, right) => right.target - left.target || right.achieved - left.achieved || left.currency.localeCompare(right.currency));
  return { currency: main?.currency ?? null, target: main?.target ?? 0, achieved: main?.achieved ?? 0, others };
}
