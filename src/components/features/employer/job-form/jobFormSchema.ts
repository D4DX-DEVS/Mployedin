import { z } from "zod";

// ─── Constants ────────────────────────────────────────────────────────────────

export const JOB_CATEGORIES = [
  "Technology",
  "Healthcare",
  "Finance",
  "Construction",
  "Hospitality",
  "Education",
  "Manufacturing",
  "Logistics",
  "Oil & Gas",
  "Retail",
  "Marketing",
  "Legal",
  "Human Resources",
  "Other",
] as const;

export const CURRENCIES = [
  { code: "USD", symbol: "$", label: "USD — US Dollar" },
  { code: "AED", symbol: "AED", label: "AED — UAE Dirham" },
  { code: "SAR", symbol: "SAR", label: "SAR — Saudi Riyal" },
  { code: "QAR", symbol: "QAR", label: "QAR — Qatari Riyal" },
  { code: "KWD", symbol: "KWD", label: "KWD — Kuwaiti Dinar" },
  { code: "BHD", symbol: "BHD", label: "BHD — Bahraini Dinar" },
  { code: "OMR", symbol: "OMR", label: "OMR — Omani Rial" },
  { code: "INR", symbol: "₹", label: "INR — Indian Rupee" },
  { code: "EUR", symbol: "€", label: "EUR — Euro" },
  { code: "GBP", symbol: "£", label: "GBP — British Pound" },
] as const;

export type CurrencyCode = (typeof CURRENCIES)[number]["code"];

export const SALARY_PERIODS = [
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
  { value: "lpa", label: "LPA (India)" },
] as const;

/** Map country name to default currency code */
export const COUNTRY_CURRENCY_MAP: Record<string, CurrencyCode> = {
  "United Arab Emirates": "AED",
  UAE: "AED",
  "Saudi Arabia": "SAR",
  KSA: "SAR",
  Qatar: "QAR",
  Kuwait: "KWD",
  Bahrain: "BHD",
  Oman: "OMR",
  India: "INR",
  USA: "USD",
  "United States": "USD",
  "United Kingdom": "GBP",
  UK: "GBP",
  Germany: "EUR",
  France: "EUR",
};

export const COUNTRIES = [
  "United Arab Emirates",
  "Saudi Arabia",
  "Qatar",
  "Kuwait",
  "Bahrain",
  "Oman",
  "India",
  "United States",
  "United Kingdom",
  "Germany",
  "France",
  "Egypt",
  "Jordan",
  "Lebanon",
  "Morocco",
  "Pakistan",
  "Philippines",
  "Remote / Global",
] as const;

/** Salary preset suggestions by currency */
export const SALARY_PRESETS: Partial<Record<CurrencyCode, Array<{ label: string; min: number; max: number; period?: string }>>> = {
  AED: [
    { label: "5k–10k/mo", min: 5000, max: 10000 },
    { label: "10k–20k/mo", min: 10000, max: 20000 },
    { label: "20k–35k/mo", min: 20000, max: 35000 },
  ],
  SAR: [
    { label: "5k–10k/mo", min: 5000, max: 10000 },
    { label: "10k–20k/mo", min: 10000, max: 20000 },
    { label: "20k–35k/mo", min: 20000, max: 35000 },
  ],
  INR: [
    { label: "3–6 LPA", min: 300000, max: 600000, period: "lpa" },
    { label: "6–12 LPA", min: 600000, max: 1200000, period: "lpa" },
    { label: "12–24 LPA", min: 1200000, max: 2400000, period: "lpa" },
  ],
  USD: [
    { label: "$40k–60k/yr", min: 40000, max: 60000, period: "yearly" },
    { label: "$60k–100k/yr", min: 60000, max: 100000, period: "yearly" },
    { label: "$100k–150k/yr", min: 100000, max: 150000, period: "yearly" },
  ],
};

// ─── Zod Schema ───────────────────────────────────────────────────────────────

export const jobFormSchema = z.object({
  // Step 1 — Basic Info
  title: z.string().min(5, "Title must be at least 5 characters").max(200).trim(),
  category: z.string().max(100).optional(),
  location: z.object({
    country: z.string().min(1, "Country is required"),
    city: z.string().min(1, "City is required"),
    isRemote: z.boolean().default(false),
  }),

  // Step 2 — Job Details
  description: z
    .string()
    .min(20, "Description must be at least 20 characters")
    .max(5000, "Description cannot exceed 5000 characters")
    .trim(),

  // Step 3 — Requirements
  requirements: z.object({
    skills: z.array(z.string().max(100)).max(50).default([]),
    experienceMin: z.number().int().min(0).max(50).default(0),
    experienceMax: z.number().int().min(0).max(50).default(10),
  }),

  // Step 4 — Salary & Settings
  salary: z
    .object({
      min: z.number().min(0).default(0),
      max: z.number().min(0).default(0),
      currency: z.string().length(3).default("USD"),
      isNegotiable: z.boolean().default(false),
      period: z.enum(["monthly", "yearly", "lpa"]).default("monthly"),
    })
    .refine((s) => s.max === 0 || s.max >= s.min, {
      message: "Maximum salary must be greater than or equal to minimum",
    }),

  // Advanced settings
  applicationMode: z.enum(["auto", "manual"]).default("manual"),
  autoScreeningEnabled: z.boolean().default(false),
  minMatchScore: z.number().int().min(0).max(100).default(70),
  visibility: z.enum(["public", "private", "invite_only"]).default("public"),
  vacancies: z.number().int().min(1).max(100).default(1),
  maxApplicants: z.number().int().min(1).max(10000).optional(),
  showSalary: z.boolean().default(true),
  expiresAt: z.string().optional(),
  tags: z.array(z.string().max(50)).max(20).default([]),
  agentId: z.string().optional(),
});

export type JobFormValues = z.infer<typeof jobFormSchema>;

export const JOB_FORM_STEPS = [
  { id: 1, label: "Basic Info", fields: ["title", "category", "location"] },
  { id: 2, label: "Job Details", fields: ["description"] },
  { id: 3, label: "Requirements", fields: ["requirements"] },
  { id: 4, label: "Salary & Settings", fields: ["salary", "applicationMode", "vacancies"] },
] as const;

/** Format salary for display */
export function formatSalary(amount: number, currency: CurrencyCode, period: string): string {
  if (amount === 0) return "";

  const currencyObj = CURRENCIES.find((c) => c.code === currency);
  const symbol = currencyObj?.symbol ?? currency;

  if (currency === "INR" && period === "lpa") {
    const lpa = amount / 100000;
    return `₹${lpa % 1 === 0 ? lpa : lpa.toFixed(1)}L`;
  }

  const formatted = new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 0,
  }).format(amount);

  const periodLabel = period === "monthly" ? "/mo" : period === "yearly" ? "/yr" : "";
  return `${symbol}${formatted}${periodLabel}`;
}
