/**
 * Major ↔ minor unit conversion for gateway amounts.
 *
 * - Zero-decimal currencies (JPY, KRW, …) are sent as-is.
 * - Three-decimal currencies (KWD, BHD, OMR, JOD, TND) are sent ×1000, and both
 *   Stripe and Razorpay require the last digit to be 0 — i.e. the amount must be
 *   a whole number of hundredths. Invoice totals are already kept in hundredths
 *   (Invoice.pre("save") works in cents), so rounding to 2 dp first loses nothing.
 * - Everything else (AED, SAR, QAR, INR, USD, EUR, …) is ×100.
 */

const ZERO_DECIMAL = new Set([
  "BIF", "CLP", "DJF", "GNF", "JPY", "KMF", "KRW", "MGA", "PYG", "RWF",
  "UGX", "VND", "VUV", "XAF", "XOF", "XPF",
]);

const THREE_DECIMAL = new Set(["BHD", "JOD", "KWD", "OMR", "TND"]);

export function currencyExponent(currency: string): 0 | 2 | 3 {
  const c = (currency || "").toUpperCase();
  if (ZERO_DECIMAL.has(c)) return 0;
  if (THREE_DECIMAL.has(c)) return 3;
  return 2;
}

/** Major units → provider minor units (integer). */
export function toMinorUnits(amount: number, currency: string): number {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error(`Invalid payment amount: ${amount}`);
  }
  const exp = currencyExponent(currency);
  if (exp === 0) return Math.round(amount);
  const hundredths = Math.round(amount * 100);
  // 3-decimal: whole hundredths ×10 keeps the trailing digit 0 (provider rule).
  return exp === 3 ? hundredths * 10 : hundredths;
}

/** Provider minor units → major units. */
export function fromMinorUnits(minor: number, currency: string): number {
  const exp = currencyExponent(currency);
  if (exp === 0) return minor;
  return Math.round(minor) / (exp === 3 ? 1000 : 100);
}

/** Money comparison in hundredths — the precision invoices are stored at. */
export function toCents(amount: number): number {
  return Math.round((amount || 0) * 100);
}
