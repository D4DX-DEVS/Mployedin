/**
 * Which industry a job sits in, and how much of a candidate's career was spent
 * there — the "industry experience" an employer weighs and the seeker engine
 * never measured (its role part compares job titles only).
 *
 * Detection is whole-phrase keyword matching on flattened text. The lists are
 * deliberately narrow: words that also name a benefit ("health insurance"), a
 * skill ("social media marketing") or a CV's education line ("university")
 * are left out, because a false industry hit is worse than none — "none"
 * simply drops the part from the score.
 *
 * Pure: callers pass plain documents (scoreApplication.ts).
 */

import { flattenText } from "@/lib/matchScore";

export const INDUSTRY_KEYS = [
  "food_fmcg",
  "retail",
  "hospitality",
  "travel",
  "healthcare",
  "pharma",
  "construction",
  "real_estate",
  "manufacturing",
  "automotive",
  "it_software",
  "banking_finance",
  "insurance",
  "education",
  "logistics",
  "oil_gas",
  "telecom",
  "media",
  "professional_services",
  "staffing",
] as const;

export type IndustryKey = (typeof INDUSTRY_KEYS)[number];

const INDUSTRY_PHRASES: Record<IndustryKey, readonly string[]> = {
  food_fmcg: [
    "fmcg", "food", "foods", "food processing", "beverage", "beverages", "bakery", "bakeries", "snacks",
    "dairy", "confectionery", "consumer goods", "consumer products", "packaged goods", "cpg",
  ],
  retail: ["retail", "retailer", "hypermarket", "hypermarkets", "supermarket", "supermarkets", "grocery", "ecommerce", "e commerce"],
  hospitality: ["hotel", "hotels", "resort", "resorts", "hospitality", "restaurant", "restaurants", "catering"],
  travel: ["travel", "tourism", "airline", "airlines", "ticketing"],
  healthcare: ["hospital", "hospitals", "healthcare", "health care", "clinic", "clinics", "diagnostics", "diagnostic centre", "diagnostic center"],
  pharma: ["pharma", "pharmaceutical", "pharmaceuticals", "ayurveda", "ayurvedic", "otc"],
  construction: ["construction", "contracting", "contractor", "civil engineering", "infrastructure"],
  real_estate: ["real estate", "realty", "property development", "properties", "developers", "developments"],
  manufacturing: ["manufacturing", "manufacturer", "factory", "factories", "plant", "mfg", "industrial", "electronics"],
  automotive: ["automotive", "automobile", "automobiles", "motor", "motors", "motorcycles", "vehicles"],
  it_software: ["software", "information technology", "it services", "saas"],
  banking_finance: ["bank", "banking", "financial services", "mutual funds", "fintech", "investment bank", "nbfc"],
  insurance: ["insurance company", "insurer", "insurance broker", "life insurance company"],
  education: ["edtech", "e learning", "elearning", "education services", "coaching institute", "training institute"],
  logistics: ["logistics", "freight", "shipping", "warehousing", "courier", "transportation"],
  oil_gas: ["oil and gas", "oil gas", "petroleum", "refinery", "offshore"],
  telecom: ["telecom", "telecommunications"],
  media: ["newspaper", "publishing", "broadcasting", "digital media", "media house", "advertising agency"],
  professional_services: ["consulting", "consultancy", "audit", "assurance", "advisory"],
  staffing: ["manpower", "staffing", "recruitment agency", "recruitment firm", "outsourcing", "bpo", "call center", "call centre"],
};

/** Industries named in a piece of text, in INDUSTRY_KEYS order. */
export function detectIndustries(text: string | null | undefined): IndustryKey[] {
  if (!text) return [];
  const haystack = flattenText(text);
  return INDUSTRY_KEYS.filter((key) => INDUSTRY_PHRASES[key].some((phrase) => haystack.includes(` ${phrase} `)));
}

/**
 * The job's industries: what the posting says about the business (its
 * description, tags and required skills — "FMCG" is a common required skill)
 * and the employer's stated industry.
 */
export function jobIndustriesOf(input: {
  description?: string | null;
  tags?: readonly string[] | null;
  skills?: readonly string[] | null;
  employerIndustry?: string | null;
}): IndustryKey[] {
  const text = [input.description ?? "", ...(input.tags ?? []), ...(input.skills ?? []), input.employerIndustry ?? ""].join(" \n ");
  return detectIndustries(text);
}

export interface IndustryEvidence {
  /** Each dated role: its company, title and description, and how long it lasted. */
  roles: ReadonlyArray<{ text: string; years: number }>;
  /** Undated evidence — the stated industry, skills and CV. Weaker than a role. */
  profileText: string;
}

interface SeekerIndustryDoc {
  industry?: string | null;
  skills?: readonly string[] | null;
  cv?: { rawText?: string | null } | null;
  experience?: ReadonlyArray<{
    jobTitle?: string | null;
    company?: string | null;
    description?: string | null;
    startDate?: Date | string | null;
    endDate?: Date | string | null;
    isCurrent?: boolean | null;
  }> | null;
}

const YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;

export function industryEvidenceOf(seeker: SeekerIndustryDoc, now: Date = new Date()): IndustryEvidence {
  const roles = (seeker.experience ?? []).map((role) => {
    const start = role.startDate ? new Date(role.startDate).getTime() : NaN;
    const end = role.isCurrent || !role.endDate ? now.getTime() : new Date(role.endDate).getTime();
    const years = Number.isFinite(start) && Number.isFinite(end) ? Math.max(0, (end - start) / YEAR_MS) : 0;
    return { text: [role.company, role.jobTitle, role.description].filter(Boolean).join(" \n "), years };
  });
  const profileText = [seeker.industry ?? "", ...(seeker.skills ?? []), seeker.cv?.rawText ?? ""].join(" \n ");
  return { roles, profileText };
}

export interface IndustryFit {
  /** 0–100. */
  score: number;
  /** The job's industries the candidate has worked in or mentions. */
  matched: IndustryKey[];
  /** Years in dated roles in one of the job's industries. */
  years: number;
  source: "roles" | "profile" | "none";
}

/**
 * How much of a candidate's career was in the job's industry. Null when the
 * job names none: there is nothing to measure, so the part drops out.
 *
 * Three years in the industry is full marks; any dated stint counts for more
 * than a mention; nobody scores zero, because people change industries and the
 * employer weights this part, never filters on it.
 */
export function industryFit(jobIndustries: readonly IndustryKey[], evidence: IndustryEvidence): IndustryFit | null {
  if (jobIndustries.length === 0) return null;
  const wanted = new Set(jobIndustries);
  const matched = new Set<IndustryKey>();
  let years = 0;
  for (const role of evidence.roles) {
    const hits = detectIndustries(role.text).filter((key) => wanted.has(key));
    if (hits.length === 0) continue;
    hits.forEach((key) => matched.add(key));
    years += role.years;
  }
  years = Math.round(years * 10) / 10;
  if (years > 0) {
    const score = years >= 3 ? 100 : years >= 1 ? 75 : 60;
    return { score, matched: [...matched], years, source: "roles" };
  }
  const mentioned = detectIndustries(evidence.profileText).filter((key) => wanted.has(key));
  if (mentioned.length > 0) return { score: 50, matched: mentioned, years: 0, source: "profile" };
  return { score: 20, matched: [], years: 0, source: "none" };
}
