/** Country-to-currency mapping and formatting utilities */

export interface CurrencyInfo {
  code: string;
  symbol: string;
  label: string;
}

export const COUNTRY_CURRENCIES: Record<string, CurrencyInfo> = {
  AE: { code: "AED", symbol: "AED", label: "UAE Dirham" },
  US: { code: "USD", symbol: "$", label: "US Dollar" },
  IN: { code: "INR", symbol: "₹", label: "Indian Rupee" },
  GB: { code: "GBP", symbol: "£", label: "British Pound" },
  SA: { code: "SAR", symbol: "SAR", label: "Saudi Riyal" },
  QA: { code: "QAR", symbol: "QAR", label: "Qatari Riyal" },
  KW: { code: "KWD", symbol: "KWD", label: "Kuwaiti Dinar" },
  BH: { code: "BHD", symbol: "BHD", label: "Bahraini Dinar" },
  OM: { code: "OMR", symbol: "OMR", label: "Omani Rial" },
  EG: { code: "EGP", symbol: "EGP", label: "Egyptian Pound" },
  PK: { code: "PKR", symbol: "PKR", label: "Pakistani Rupee" },
  BD: { code: "BDT", symbol: "৳", label: "Bangladeshi Taka" },
  PH: { code: "PHP", symbol: "₱", label: "Philippine Peso" },
  CA: { code: "CAD", symbol: "CA$", label: "Canadian Dollar" },
  AU: { code: "AUD", symbol: "A$", label: "Australian Dollar" },
  EU: { code: "EUR", symbol: "€", label: "Euro" },
  DE: { code: "EUR", symbol: "€", label: "Euro" },
  FR: { code: "EUR", symbol: "€", label: "Euro" },
  JP: { code: "JPY", symbol: "¥", label: "Japanese Yen" },
  SG: { code: "SGD", symbol: "S$", label: "Singapore Dollar" },
  MY: { code: "MYR", symbol: "RM", label: "Malaysian Ringgit" },
  JO: { code: "JOD", symbol: "JOD", label: "Jordanian Dinar" },
  LB: { code: "LBP", symbol: "LBP", label: "Lebanese Pound" },
  NG: { code: "NGN", symbol: "₦", label: "Nigerian Naira" },
  ZA: { code: "ZAR", symbol: "R", label: "South African Rand" },
  KE: { code: "KES", symbol: "KSh", label: "Kenyan Shilling" },
};

export const SUPPORTED_COUNTRIES = Object.entries(COUNTRY_CURRENCIES).map(([countryCode, info]) => ({
  countryCode,
  ...info,
}));

/** Unique list of currencies (de-duped, e.g. EUR appears once) */
export const SUPPORTED_CURRENCIES: CurrencyInfo[] = Object.values(
  Object.values(COUNTRY_CURRENCIES).reduce<Record<string, CurrencyInfo>>((acc, c) => {
    if (!acc[c.code]) acc[c.code] = c;
    return acc;
  }, {})
);

/** Look up the default currency for a country code (e.g. "IN" → INR) */
export function currencyForCountry(countryCode: string): CurrencyInfo {
  return COUNTRY_CURRENCIES[countryCode] ?? COUNTRY_CURRENCIES.AE;
}

/**
 * Approximate exchange rates FROM AED.
 * i.e. 1 AED ≈ X of target currency.
 * Updated periodically — these are indicative display-only rates.
 */
export const AED_EXCHANGE_RATES: Record<string, number> = {
  AED: 1,
  USD: 0.2723,
  INR: 22.78,
  GBP: 0.2158,
  SAR: 1.0209,
  QAR: 0.9914,
  KWD: 0.0836,
  BHD: 0.1026,
  OMR: 0.1048,
  EGP: 13.63,
  PKR: 75.83,
  BDT: 32.59,
  PHP: 15.32,
  CAD: 0.3753,
  AUD: 0.4179,
  EUR: 0.2514,
  JPY: 38.86,
  SGD: 0.3598,
  MYR: 1.1796,
  JOD: 0.1929,
  LBP: 24384,
  NGN: 422.0,
  ZAR: 4.9,
  KES: 35.2,
};

/** Convert an amount from one currency to another using AED as pivot.
 *  Accepts an optional rates map (from live API); falls back to AED_EXCHANGE_RATES. */
export function convertCurrency(
  amount: number,
  fromCurrency: string,
  toCurrency: string,
  rates: Record<string, number> = AED_EXCHANGE_RATES,
): number {
  if (fromCurrency === toCurrency) return amount;
  const fromRate = rates[fromCurrency] ?? AED_EXCHANGE_RATES[fromCurrency] ?? 1;
  const toRate = rates[toCurrency] ?? AED_EXCHANGE_RATES[toCurrency] ?? 1;
  // Convert: amount → AED → target
  const inAED = amount / fromRate;
  return Math.round(inAED * toRate * 100) / 100;
}

/** Format a number with a currency code, e.g. "INR 12,500" or "$ 3,200" */
export function formatCurrency(amount: number | string | null | undefined, currencyCode = "AED"): string {
  if (amount == null || amount === "") return "—";
  const num = Number(amount);
  if (isNaN(num)) return "—";
  const info = SUPPORTED_CURRENCIES.find((c) => c.code === currencyCode);
  const symbol = info?.symbol ?? currencyCode;
  return `${symbol} ${num.toLocaleString()}`;
}

/**
 * Convert and format: converts from source currency to display currency,
 * then formats with the display currency symbol.
 * Accepts an optional rates map (from live API); falls back to AED_EXCHANGE_RATES.
 */
export function convertAndFormat(
  amount: number | string | null | undefined,
  fromCurrency: string,
  toCurrency: string,
  rates?: Record<string, number>,
): string {
  if (amount == null || amount === "") return "—";
  const num = Number(amount);
  if (isNaN(num)) return "—";
  if (num === 0) return "Free";
  const converted = convertCurrency(num, fromCurrency, toCurrency, rates);
  return formatCurrency(converted, toCurrency);
}
