/**
 * Deterministic industry classifier for job seekers.
 * Assigns a single primary industry based on experience, skills, and education.
 * Never wildly guesses; returns undefined if evidence is unclear or conflicting.
 *
 * The classifier uses the existing `detectIndustries` keyword matching from
 * src/lib/matching/industry.ts and prioritizes work experience > skills > education.
 */

import { detectIndustries, type IndustryKey } from "@/lib/matching/industry";
import { flattenText } from "@/lib/matchScore";
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
const IT_INDUSTRY = INDUSTRY_KEY_TO_INDUSTRIES.it_software;

/**
 * Job-title phrases that make a role a technology role. "developer" alone is
 * deliberately absent: a "Property Developer" or "Business Developer" is not
 * an IT job, so it only counts with a tech qualifier ("MERN Stack Developer").
 */
const TECH_TITLE_PHRASES: readonly string[] = [
  "software", "full stack", "fullstack", "front end", "frontend", "back end", "backend", "mern", "mean stack",
  "devops", "programmer", "web developer", "web development", "app developer", "application developer",
  "mobile developer", "android developer", "ios developer", "react developer", "node developer",
  "java developer", "python developer", "php developer", "net developer", "wordpress developer",
  "data scientist", "data engineer", "machine learning", "qa engineer", "sdet", "cloud engineer",
  "cybersecurity", "cyber security", "system administrator", "network engineer", "ui ux", "it support", "it engineer",
];

/** Skills that only appear on a technology CV. Generic ones (Excel, SQL alone) are not enough. */
const TECH_SKILL_TERMS: ReadonlySet<string> = new Set([
  "javascript", "typescript", "react", "reactjs", "react js", "node", "nodejs", "node js", "express", "expressjs",
  "express js", "mongodb", "next js", "nextjs", "angular", "vue", "vuejs", "python", "java", "php", "laravel",
  "django", "flask", "c#", "c++", "html", "css", "git", "docker", "kubernetes", "aws", "mysql", "postgresql",
  "rest api", "restful api", "graphql", "tailwind", "tailwind css", "redux", "spring boot", "dotnet", "net",
]);
const MIN_TECH_SKILLS = 3;

/** Degree fields that point at an IT career. Lowest-confidence evidence. */
const TECH_EDUCATION_PHRASES: readonly string[] = [
  "computer science", "computer engineering", "computer applications", "information technology",
  "software engineering", "information systems", "bca", "mca",
];

function hasPhrase(text: string | null | undefined, phrases: readonly string[]): boolean {
  if (!text) return false;
  const haystack = flattenText(text);
  return phrases.some((p) => haystack.includes(` ${p} `));
}

function singleIndustry(text: string): IndustryKey | undefined {
  const detected = detectIndustries(text);
  return detected.length === 1 ? detected[0] : undefined;
}

export function classifyIndustry(seeker: Pick<IJobSeeker, "experience" | "skills" | "education" | "careerProfile" | "cv">): ClassifyResult {
  // Strategy 1: recent jobs, newest first. Evidence per job, strongest first:
  //   a) the job title + employer name (what the business IS) — one clear industry wins;
  //   b) a technology job title — IT;
  //   c) the description, for non-technical titles only. A tech job's description
  //      names the projects built ("real estate listings dashboard"), not the
  //      industry the person works in, so it never decides.
  if (seeker.experience && seeker.experience.length > 0) {
    // Sort by end date descending (most recent first).
    const sorted = [...seeker.experience].sort((a, b) => {
      const aEnd = a.endDate || (a.isCurrent ? new Date() : new Date(0));
      const bEnd = b.endDate || (b.isCurrent ? new Date() : new Date(0));
      return new Date(bEnd).getTime() - new Date(aEnd).getTime();
    });

    // Check the most recent job and the last 2-3 jobs.
    for (const job of sorted.slice(0, 3)) {
      if (!job.jobTitle && !job.company) continue;

      // Employer first (a developer at a bank works in banking), then the title.
      const named = (job.company ? singleIndustry(job.company) : undefined) ?? (job.jobTitle ? singleIndustry(job.jobTitle) : undefined);
      if (named) return { industry: INDUSTRY_KEY_TO_INDUSTRIES[named], source: "experience", detected: [named] };

      if (hasPhrase(job.jobTitle, TECH_TITLE_PHRASES)) {
        return { industry: IT_INDUSTRY, source: "experience", detected: ["it_software"] };
      }

      const fromDescription = job.description ? singleIndustry(job.description) : undefined;
      if (fromDescription) {
        return { industry: INDUSTRY_KEY_TO_INDUSTRIES[fromDescription], source: "experience", detected: [fromDescription] };
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
    const techSkills = new Set(
      seeker.skills.map((s) => flattenText(String(s)).trim()).filter((s) => TECH_SKILL_TERMS.has(s)),
    );
    if (techSkills.size >= MIN_TECH_SKILLS) {
      return { industry: IT_INDUSTRY, source: "skills", detected: ["it_software"] };
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
        if (hasPhrase(edu.field, TECH_EDUCATION_PHRASES)) {
          return { industry: IT_INDUSTRY, source: "education", detected: ["it_software"] };
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
