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

/** Format a number with a currency code, e.g. "INR 12,500" or "$ 3,200" */
export function formatCurrency(amount: number | string | null | undefined, currencyCode = "AED"): string {
  if (amount == null || amount === "") return "—";
  const num = Number(amount);
  if (isNaN(num)) return "—";
  const info = SUPPORTED_CURRENCIES.find((c) => c.code === currencyCode);
  const symbol = info?.symbol ?? currencyCode;
  return `${symbol} ${num.toLocaleString()}`;
}
