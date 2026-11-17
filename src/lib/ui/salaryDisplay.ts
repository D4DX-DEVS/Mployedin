/**
 * One way to print a job's pay on the seeker's screens.
 *
 * QA 2026-11-17: the card printed "8–18 INR" for a job stored as 8–18 LPA
 * (lakhs per year), the job page said "/ month" for every job whatever its
 * period, and the company page and Similar Jobs printed no period at all — so
 * ₹12–18 lakh a year read as a monthly figure.
 */

export type SalaryPeriod = "monthly" | "yearly" | "lpa";

export interface SalaryInput {
  min?: number | null;
  max?: number | null;
  currency?: string | null;
  period?: string | null;
}

/** Message keys of the `salaryDisplay` namespace. */
export type SalaryMessageKey = SalaryPeriod | "from";

export type SalaryTranslate = (key: SalaryMessageKey, values: { amount: string }) => string;

/**
 * An LPA figure in lakhs. Employers store LPA either as lakhs ("12") or as
 * whole rupees ("1,200,000"); the matcher reads both the same way
 * (eligibility.ts), and so does this.
 */
export function lakhsOf(value: number): number {
  return value >= 1000 ? value / 100_000 : value;
}

export function salaryPeriodOf(period: string | null | undefined): SalaryPeriod {
  return period === "yearly" || period === "lpa" ? period : "monthly";
}

/**
 * The figure without its period, e.g. "50K–80K INR", "8–18" (LPA), or null
 * when no usable amount is stored. A negative or zero bound counts as absent.
 */
export function salaryAmount(salary: SalaryInput | null | undefined, formatNumber: (n: number) => string): string | null {
  if (!salary) return null;
  const period = salaryPeriodOf(salary.period);
  const clean = (n: number | null | undefined) => (typeof n === "number" && n > 0 ? n : 0);
  let min = clean(salary.min);
  let max = clean(salary.max);
  if (!min && !max) return null;
  if (period === "lpa") {
    min = min ? lakhsOf(min) : 0;
    max = max ? lakhsOf(max) : 0;
  }
  const figure = min && max && min !== max ? `${formatNumber(min)}–${formatNumber(max)}` : formatNumber(min || max);
  // "LPA" already says rupees; any other currency is named.
  const currency = (salary.currency ?? "").trim();
  if (period === "lpa" && (!currency || currency === "INR")) return figure;
  return currency ? `${figure} ${currency}` : figure;
}

/** "50K–80K INR / month", "8–18 LPA", "From 40K AED / month", or null. */
export function formatSalary(
  salary: SalaryInput | null | undefined,
  t: SalaryTranslate,
  formatNumber: (n: number) => string,
): string | null {
  const amount = salaryAmount(salary, formatNumber);
  if (!amount || !salary) return null;
  const withPeriod = t(salaryPeriodOf(salary.period), { amount });
  const onlyMin = (salary.min ?? 0) > 0 && !((salary.max ?? 0) > 0);
  return onlyMin ? t("from", { amount: withPeriod }) : withPeriod;
}
