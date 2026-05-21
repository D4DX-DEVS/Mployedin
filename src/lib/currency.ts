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
  // Additional countries
  CN: { code: "CNY", symbol: "¥", label: "Chinese Yuan" },
  KR: { code: "KRW", symbol: "₩", label: "South Korean Won" },
  TH: { code: "THB", symbol: "฿", label: "Thai Baht" },
  VN: { code: "VND", symbol: "₫", label: "Vietnamese Dong" },
  ID: { code: "IDR", symbol: "Rp", label: "Indonesian Rupiah" },
  TR: { code: "TRY", symbol: "₺", label: "Turkish Lira" },
  BR: { code: "BRL", symbol: "R$", label: "Brazilian Real" },
  MX: { code: "MXN", symbol: "MX$", label: "Mexican Peso" },
  NZ: { code: "NZD", symbol: "NZ$", label: "New Zealand Dollar" },
  CH: { code: "CHF", symbol: "CHF", label: "Swiss Franc" },
  SE: { code: "SEK", symbol: "kr", label: "Swedish Krona" },
  NO: { code: "NOK", symbol: "kr", label: "Norwegian Krone" },
  DK: { code: "DKK", symbol: "kr", label: "Danish Krone" },
  PL: { code: "PLN", symbol: "zł", label: "Polish Zloty" },
  CZ: { code: "CZK", symbol: "Kč", label: "Czech Koruna" },
  HU: { code: "HUF", symbol: "Ft", label: "Hungarian Forint" },
  RO: { code: "RON", symbol: "lei", label: "Romanian Leu" },
  IQ: { code: "IQD", symbol: "IQD", label: "Iraqi Dinar" },
  LK: { code: "LKR", symbol: "Rs", label: "Sri Lankan Rupee" },
  NP: { code: "NPR", symbol: "Rs", label: "Nepalese Rupee" },
  GH: { code: "GHS", symbol: "GH₵", label: "Ghanaian Cedi" },
  TZ: { code: "TZS", symbol: "TSh", label: "Tanzanian Shilling" },
  UG: { code: "UGX", symbol: "USh", label: "Ugandan Shilling" },
  ET: { code: "ETB", symbol: "Br", label: "Ethiopian Birr" },
  MA: { code: "MAD", symbol: "MAD", label: "Moroccan Dirham" },
  TN: { code: "TND", symbol: "TND", label: "Tunisian Dinar" },
  RU: { code: "RUB", symbol: "₽", label: "Russian Ruble" },
  HK: { code: "HKD", symbol: "HK$", label: "Hong Kong Dollar" },
  TW: { code: "TWD", symbol: "NT$", label: "Taiwan Dollar" },
  CL: { code: "CLP", symbol: "CL$", label: "Chilean Peso" },
  CO: { code: "COP", symbol: "COL$", label: "Colombian Peso" },
  AR: { code: "ARS", symbol: "AR$", label: "Argentine Peso" },
  PE: { code: "PEN", symbol: "S/", label: "Peruvian Sol" },
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
  // Additional currencies
  CNY: 1.977,
  KRW: 361.5,
  THB: 9.45,
  VND: 6800,
  IDR: 4320,
  TRY: 8.77,
  BRL: 1.36,
  MXN: 4.68,
  NZD: 0.4545,
  CHF: 0.2395,
  SEK: 2.81,
  NOK: 2.88,
  DKK: 1.875,
  PLN: 1.08,
  CZK: 6.14,
  HUF: 99.5,
  RON: 1.245,
  IQD: 356.5,
  LKR: 82.0,
  NPR: 36.45,
  GHS: 4.12,
  TZS: 702,
  UGX: 1013,
  ETB: 15.7,
  MAD: 2.72,
  TND: 0.845,
  RUB: 23.8,
  HKD: 2.123,
  TWD: 8.72,
  CLP: 254.0,
  COP: 1133,
  ARS: 242.0,
  PEN: 1.015,
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
