/**
 * A seeker's salary expectation, as a monthly figure.
 *
 * Matching reads the expectation as monthly — the Preferences page asks for a
 * monthly range — but onboarding asked only for a "Preferred salary", right
 * under "Annual salary", and the stored figure carries no period. Seekers
 * answered with yearly numbers: on 2026-11-13, of the 27 seekers who state pay,
 * figures like INR 8–15 lakh, AED 60,000–100,000 and EUR 70,000 were read as a
 * month's pay, which priced them out of almost every job.
 *
 * Owner decision 2026-11-13: a figure too high to be anyone's monthly pay is
 * read as yearly and divided by 12. The ceiling is set in AED and converted, at
 * two levels, because one number cannot serve both markets: INR 8 lakh is a
 * normal year's pay in India but far above a monthly one, while AED 35,000 is a
 * real monthly ask in Dubai. Reading a true monthly figure as yearly only makes
 * the salary check more lenient for that seeker — it never hides a job — which
 * is the safe direction to be wrong in.
 */
import { AED_EXCHANGE_RATES } from "@/lib/currency";

/** Currencies where monthly pay runs far below Gulf levels. */
const LOWER_PAY_CURRENCIES: ReadonlySet<string> = new Set([
  "INR", "PKR", "BDT", "NPR", "LKR", "PHP", "EGP", "NGN", "KES", "IDR", "VND", "ETB", "UGX", "TZS", "GHS",
]);

/** Highest believable monthly expectation, in AED. Above it, the figure is a year's pay. */
const MONTHLY_CEILING_AED = { lowerPay: 13_000, other: 50_000 } as const;

/** The monthly ceiling in the given currency, or `null` when we have no rate for it. */
export function monthlyCeiling(currency: string | null | undefined): number | null {
  const cur = (currency ?? "").toUpperCase().trim();
  const rate = AED_EXCHANGE_RATES[cur];
  if (!rate) return null;
  const aed = LOWER_PAY_CURRENCIES.has(cur) ? MONTHLY_CEILING_AED.lowerPay : MONTHLY_CEILING_AED.other;
  return aed * rate;
}

/**
 * The expectation as a month's pay: unchanged when believable as monthly,
 * divided by 12 when it can only be yearly. A currency without a rate is left
 * as typed, since there is nothing to judge it against.
 */
export function monthlyExpectation(amount: number, currency: string | null | undefined): number {
  if (!(amount > 0)) return 0;
  const ceiling = monthlyCeiling(currency);
  return ceiling !== null && amount > ceiling ? amount / 12 : amount;
}
