/**
 * How an application's date, pay and history read on the seeker's pages.
 *
 * The Applications list and the application page each had their own
 * formatting, so one application read "Applied Oct 1 · ₹50K - ₹70K" in the
 * list and "Applied 10/1/2026 · INR 50,000 – 70,000" on its own page
 * (QA 2026-10-06). Both pages use these now.
 */

/** The list pages' number locale: Arabic digits for Arabic, en-US otherwise. */
export function applicationNumberLocale(locale: string | undefined): string {
  return locale === "ar" ? "ar-SA" : "en-US";
}

/** "Oct 1", or "Oct 1, 2026" where there is room for the year. */
export function formatApplicationDate(
  value: string | Date | null | undefined,
  locale: string | undefined,
  { withYear = false }: { withYear?: boolean } = {},
): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(applicationNumberLocale(locale), {
    month: "short",
    day: "numeric",
    ...(withYear ? { year: "numeric" } : {}),
  });
}

interface SalaryRange {
  min?: number | null;
  max?: number | null;
  currency?: string | null;
}

/**
 * "₹50K - ₹70K"; one bound reads "AED 12K+" (from) or "AED 12K" (up to), and
 * a fixed figure (min = max) reads once. Null when there is no amount or no currency.
 */
export function formatApplicationSalary(
  salary: SalaryRange | null | undefined,
  locale: string | undefined,
): string | null {
  const min = salary?.min && salary.min > 0 ? salary.min : 0;
  const max = salary?.max && salary.max > 0 ? salary.max : 0;
  const currency = salary?.currency;
  if ((!min && !max) || !currency) return null;
  const range = Boolean(min && max && min !== max);

  const numberLocale = applicationNumberLocale(locale);
  let format: (n: number) => string;
  try {
    const formatter = new Intl.NumberFormat(numberLocale, {
      style: "currency",
      currency,
      notation: "compact",
      minimumFractionDigits: 0,
      maximumFractionDigits: 1,
    });
    format = (n) => formatter.format(n);
  } catch {
    // Not an ISO code Intl knows: plain numbers, code after.
    const plain = (n: number) => n.toLocaleString(numberLocale);
    if (range) return `${plain(min)} - ${plain(max)} ${currency}`;
    return `${plain(min || max)}${min && !max ? "+" : ""} ${currency}`;
  }

  if (range) return `${format(min)} - ${format(max)}`;
  return min && !max ? `${format(min)}+` : format(min || max);
}

interface HistoryEntry {
  status: string;
  changedAt: string;
}

/**
 * Status history without back-to-back repeats: rescheduling an interview logs
 * "interview_scheduled" again, which read as "Interview → Interview".
 * Each run keeps its first entry, so the date is when that stage began.
 */
export function collapseStatusHistory<T extends HistoryEntry>(history: readonly T[]): T[] {
  return history.filter((entry, i) => i === 0 || history[i - 1].status !== entry.status);
}
