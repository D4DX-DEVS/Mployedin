/**
 * Deterministic industry classifier for job seekers.
 * Assigns a single primary industry based on experience, skills, and education.
 * Never wildly guesses; returns undefined if evidence is unclear or conflicting.
 *
 * The classifier uses the existing `detectIndustries` keyword matching from
 * src/lib/matching/industry.ts and prioritizes work experience > skills > education.
 */

import { detectIndustries, type IndustryKey } from "@/lib/matching/industry";
import type { IJobSeeker } from "@/models/JobSeeker";

/**
 * Maps INDUSTRY_KEYS (from keyword detection) to Industries master names.
 * These are the exact names from the admin-managed Industries collection.
 * Storage: we store the Industries name on JobSeeker.industry, not the key.
 */
export const INDUSTRY_KEY_TO_INDUSTRIES: Record<IndustryKey, string> = {
  food_fmcg: "Food & Beverages",
  retail: "Retail",
  hospitality: "Hospitality/Hotels/Restaurants",
  travel: "Tourism/Travel",
  healthcare: "Healthcare/Hospitals",
  pharma: "Pharmaceuticals",
  construction: "Construction/Engineering/Cement",
  real_estate: "Real Estate/Property",
  manufacturing: "Manufacturing",
  automotive: "AutoMobile",
  it_software: "Information Technology",
  banking_finance: "Banking/Financial Services",
  insurance: "Insurance",
  education: "Education/Training",
  logistics: "Distribution & Logistics",
  oil_gas: "Energy/Oil & Gas",
  telecom: "Telecom/ISP",
  media: "Media/Communications",
  professional_services: "Consultancy",
  staffing: "Human Resources/Recruitment",
};

// Deprecated: use INDUSTRY_KEY_TO_INDUSTRIES instead
export const INDUSTRY_KEY_TO_CATEGORY = INDUSTRY_KEY_TO_INDUSTRIES;

interface ClassifyResult {
  /** Industry label (or undefined if no clear match). */
  industry: string | undefined;
  /** Why the industry was chosen: 'experience' (most recent job), 'skills', 'education', or 'none'. */
  source: "experience" | "skills" | "education" | "none";
  /** Detected industries in order of evidence strength. */
  detected: IndustryKey[];
}

/**
 * Classify a job seeker to a single primary industry.
 * Looks at (in order):
 * 1. Most recent job experience (highest confidence)
 * 2. Skills list (medium confidence)
 * 3. Education field (lower confidence)
 *
 * Returns the top match if found, or undefined if unclear.
 */
export function classifyIndustry(seeker: Pick<IJobSeeker, "experience" | "skills" | "education" | "careerProfile" | "cv">): ClassifyResult {
  // Strategy 1: Most recent job (highest confidence).
  if (seeker.experience && seeker.experience.length > 0) {
    // Sort by end date descending (most recent first).
    const sorted = [...seeker.experience].sort((a, b) => {
      const aEnd = a.endDate || (a.isCurrent ? new Date() : new Date(0));
      const bEnd = b.endDate || (b.isCurrent ? new Date() : new Date(0));
      return new Date(bEnd).getTime() - new Date(aEnd).getTime();
    });

    // Check the most recent job and the last 2-3 jobs.
    for (const job of sorted.slice(0, 3)) {
      if (job.jobTitle || job.company) {
        const text = [job.company, job.jobTitle, job.description].filter(Boolean).join(" ");
        const detected = detectIndustries(text);
        if (detected.length === 1) {
          const categoryName = INDUSTRY_KEY_TO_CATEGORY[detected[0]];
          return { industry: categoryName, source: "experience", detected };
        }
      }
    }
  }

  // Strategy 2: Explicitly stated industry on profile.
  if (seeker.careerProfile?.currentIndustry) {
    const detected = detectIndustries(seeker.careerProfile.currentIndustry);
    if (detected.length === 1) {
      const label = INDUSTRY_KEY_TO_CATEGORY[detected[0]];
      return { industry: label, source: "experience", detected };
    }
  }

  // Strategy 3: Skills (medium confidence).
  if (seeker.skills && seeker.skills.length > 0) {
    const detected = detectIndustries(seeker.skills.join(" "));
    if (detected.length === 1) {
      const label = INDUSTRY_KEY_TO_CATEGORY[detected[0]];
      return { industry: label, source: "skills", detected };
    }
  }

  // Strategy 4: Education field (lower confidence).
  if (seeker.education && seeker.education.length > 0) {
    for (const edu of seeker.education) {
      if (edu.field) {
        const detected = detectIndustries(edu.field);
        if (detected.length === 1) {
          const label = INDUSTRY_KEY_TO_CATEGORY[detected[0]];
          return { industry: label, source: "education", detected };
        }
      }
    }
  }

  // No clear match.
  return { industry: undefined, source: "none", detected: [] };
}

/**
 * Classify multiple seekers and return a summary distribution.
 * Useful for the backfill script to show what would be classified.
 */
export function classifyMultiple(
  seekers: Array<Pick<IJobSeeker, "experience" | "skills" | "education" | "careerProfile" | "cv">>
): { results: ClassifyResult[]; distribution: Record<string, number> } {
  const results = seekers.map((s) => classifyIndustry(s));
  const distribution: Record<string, number> = {};
  for (const result of results) {
    const key = result.industry || "(unclassified)";
    distribution[key] = (distribution[key] ?? 0) + 1;
  }
  return { results, distribution };
}
