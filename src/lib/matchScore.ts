/**
 * Match score calculator for job recommendations.
 * Returns an integer 0–100 based on 4 weighted components:
 *   Skills       40%
 *   Location     20%
 *   Experience   20%
 *   Salary       20%
 *
 * All inputs are plain primitives — no Mongoose documents.
 */

export interface SeekerProfile {
  skills: string[];
  /** Primary preferred country (lower-cased). Pass "" if unknown. */
  location: string;
  /** All preferred countries (lower-cased). Falls back to [location] when omitted. */
  locations?: string[];
  experienceYears: number;
  salaryExpectation: number; // mid-point of preferred salary range, 0 disables salary component
  /** ISO currency code of salaryExpectation (e.g. "USD", "INR"). "" if unknown. */
  salaryCurrency?: string;
  /** Preferred job type: "remote" | "hybrid" | "onsite" | "any" */
  jobType?: string;
  /** Preferred role keywords (lower-cased). Used for bonus only. */
  preferredRoles?: string[];
  /** Highest attained education level (1-5, 0 = unknown). See educationRank(). */
  educationLevel?: number;
}

export interface JobProfile {
  skills: string[];
  /** Job country (lower-cased). */
  location: string;
  remote: boolean;
  salaryMin: number;
  salaryMax: number;
  /** Pay period for salaryMin/Max. Used to normalize to monthly. Defaults to "monthly". */
  salaryPeriod?: "monthly" | "yearly" | "lpa";
  /** ISO currency code of salaryMin/Max. "" if unknown. */
  salaryCurrency?: string;
  /** 0 = no minimum */
  minExp: number;
  /** 30 = no cap */
  maxExp: number;
  /** Job title (lower-cased). Used for bonus. */
  title?: string;
  /** Required education level (1-5, 0 = none/unspecified). See educationRank(). */
  requiredEducationLevel?: number;
}

/**
 * Ordered education levels — higher keyword groups are checked first so that
 * e.g. "postgraduate" ranks above the generic "graduate".
 *   5 doctorate · 4 master/PG · 3 bachelor/UG · 2 diploma · 1 school
 */
const EDUCATION_LEVELS: Array<{ level: number; keywords: string[] }> = [
  { level: 5, keywords: ["phd", "ph.d", "doctorate", "doctoral", "dphil"] },
  { level: 4, keywords: ["master", "m.tech", "mtech", "m.sc", "msc", "m.a", "mba", "mca", "m.com", "mcom", "postgraduate", "post graduate", "post-graduate"] },
  { level: 3, keywords: ["bachelor", "b.tech", "btech", "b.e", "b.sc", "bsc", "b.a", "b.com", "bcom", "bca", "bba", "undergraduate", "graduate", "degree"] },
  { level: 2, keywords: ["diploma", "associate", "certificate", "iti", "vocational", "polytechnic"] },
  { level: 1, keywords: ["high school", "higher secondary", "secondary", "ssc", "hsc", "10th", "12th", "matriculation"] },
];

/**
 * Maps a free-text qualification ("B.Tech", "Master of Science", "Diploma") to a
 * numeric level 1-5. Returns 0 when the text is empty or unrecognised.
 */
export function educationRank(text: string | undefined | null): number {
  if (!text) return 0;
  // Normalize separators so hyphenated/underscored abbreviations like "B-Tech"
  // or "M_Tech" match the dotted keywords ("b.tech", "m.tech").
  const lower = text.toLowerCase().replace(/[-_]/g, ".");
  for (const { level, keywords } of EDUCATION_LEVELS) {
    if (keywords.some((k) => lower.includes(k))) return level;
  }
  return 0;
}

/**
 * Groups of related/interchangeable skills.
 * If a seeker knows one skill in a group, they get partial credit (0.5)
 * for any other skill in the same group that a job requires.
 */
const SKILL_GROUPS: string[][] = [
  // Frontend frameworks
  ["react", "reactjs", "react.js", "angular", "angularjs", "angular.js", "vue", "vuejs", "vue.js", "svelte", "next.js", "nextjs", "nuxt", "nuxt.js", "nuxtjs"],
  // Backend JS
  ["node", "nodejs", "node.js", "express", "expressjs", "express.js", "nestjs", "nest.js", "fastify", "koa"],
  // Databases
  ["mongodb", "mongoose", "postgresql", "postgres", "mysql", "mariadb", "sqlite", "dynamodb", "couchdb"],
  // Cloud
  ["aws", "amazon web services", "azure", "gcp", "google cloud", "digitalocean"],
  // Mobile
  ["react native", "flutter", "ionic", "swift", "kotlin", "swiftui", "jetpack compose"],
  // CSS / UI
  ["css", "sass", "scss", "less", "tailwind", "tailwindcss", "bootstrap", "styled-components", "material ui", "chakra ui"],
  // Languages (typed)
  ["typescript", "javascript", "js", "ts"],
  // Python frameworks
  ["django", "flask", "fastapi"],
  // DevOps / CI
  ["docker", "kubernetes", "k8s", "jenkins", "github actions", "gitlab ci", "circleci"],
  // State management
  ["redux", "zustand", "mobx", "recoil", "jotai", "pinia", "vuex", "ngrx"],
  // Testing
  ["jest", "mocha", "vitest", "cypress", "playwright", "selenium", "testing library"],
  // Java ecosystem
  ["java", "spring", "spring boot", "springboot"],
  // PHP ecosystem
  ["php", "laravel", "symfony", "codeigniter"],
  // .NET
  ["c#", "csharp", ".net", "dotnet", "asp.net"],
];

/**
 * Normalizes a skill for comparison: lowercases, trims, and strips a trailing
 * "js" suffix variant so "React.js", "ReactJS", "react js" and "React" all
 * compare equal. Keeps the original when stripping would destroy the name
 * (e.g. "JS" itself).
 */
export function normalizeSkill(s: string): string {
  const lower = s.toLowerCase().trim();
  const stripped = lower.replace(/[\s.\-_]*js$/, "");
  return stripped.length >= 2 ? stripped : lower;
}

/**
 * Splits a possibly-compound skill string into individual normalized skill
 * tokens, e.g. "Cloud Platforms (AWS/Azure)" → ["cloud platforms", "aws",
 * "azure"]. The normalized full string is always included so multi-word skills
 * keep matching too. Tokens shorter than 2 chars are dropped.
 */
export function tokenizeSkill(s: string): string[] {
  const tokens = new Set<string>();
  const full = normalizeSkill(s);
  if (full.length >= 2) tokens.add(full);
  for (const part of s.split(/[()/,&+|]|\band\b/i)) {
    const norm = normalizeSkill(part);
    if (norm.length >= 2) tokens.add(norm);
  }
  return [...tokens];
}

/** Pre-built lookup: normalized skill → set of related normalized skills */
const RELATED_SKILLS_MAP: Map<string, Set<string>> = (() => {
  const map = new Map<string, Set<string>>();
  for (const group of SKILL_GROUPS) {
    const lower = group.map(normalizeSkill);
    for (const skill of lower) {
      const existing = map.get(skill) ?? new Set<string>();
      for (const other of lower) {
        if (other !== skill) existing.add(other);
      }
      map.set(skill, existing);
    }
  }
  return map;
})();

export function getMatchedSkills(seekerSkills: string[], jobSkills: string[]): string[] {
  const jobSet = new Set(jobSkills.flatMap(tokenizeSkill));
  return seekerSkills.filter((s) => tokenizeSkill(s).some((t) => jobSet.has(t)));
}

/**
 * True when the seeker shares at least one skill (exact after normalization,
 * or via a related-skill group) with the job's required skills.
 */
export function skillsOverlap(seekerSkills: string[], jobSkills: string[]): boolean {
  if (seekerSkills.length === 0 || jobSkills.length === 0) return false;
  const seekerSet = new Set(seekerSkills.flatMap(tokenizeSkill));
  for (const rawJob of jobSkills) {
    for (const jSkill of tokenizeSkill(rawJob)) {
      if (seekerSet.has(jSkill)) return true;
      const related = RELATED_SKILLS_MAP.get(jSkill);
      if (related) {
        for (const s of seekerSet) {
          if (related.has(s)) return true;
        }
      }
    }
  }
  return false;
}

export function calculateMatchScore(seeker: SeekerProfile, job: JobProfile): number {
  // ── Skills (40%) ────────────────────────────────────────────────────
  const jobSkills = job.skills.map(normalizeSkill);
  const seekerSkills = seeker.skills.flatMap(tokenizeSkill);

  let skillsScore: number;
  if (jobSkills.length === 0) {
    // Job lists no structured skill requirements — there is no evidence of skill
    // fit, so award only a small floor. (A higher neutral value previously let
    // skill-less, off-target jobs outrank genuine matches with partial overlap.)
    skillsScore = 0.15;
  } else {
    let totalCredit = 0;
    for (const jSkill of jobSkills) {
      if (seekerSkills.includes(jSkill)) {
        totalCredit += 1; // exact match
      } else {
        // Check related skills — partial credit (0.5)
        const related = RELATED_SKILLS_MAP.get(jSkill);
        if (related && seekerSkills.some((s) => related.has(s))) {
          totalCredit += 0.5;
        }
      }
    }
    skillsScore = totalCredit / jobSkills.length;
  }

  // ── Location (20%) ───────────────────────────────────────────────────
  const locationScore = (() => {
    if (job.remote) return 1;
    // Consider every preferred country, not just the first.
    const seekerLocations = (seeker.locations?.length ? seeker.locations : [seeker.location])
      .map((l) => l.toLowerCase().trim())
      .filter(Boolean);
    if (seekerLocations.length === 0) return 0.5; // partial when unknown
    const jobLocation = job.location.toLowerCase().trim();
    return seekerLocations.includes(jobLocation) ? 1 : 0;
  })();

  // ── Experience (20%) ─────────────────────────────────────────────────
  const experienceScore = (() => {
    const { minExp, maxExp } = job;
    const yrs = seeker.experienceYears;
    if (yrs >= minExp && yrs <= maxExp) return 1;
    const gapMin = Math.abs(yrs - minExp);
    const gapMax = Math.abs(yrs - maxExp);
    const gap = Math.min(gapMin, gapMax);
    if (gap <= 1) return 0.7;
    return 0.3;
  })();

  // ── Salary (20%) ─────────────────────────────────────────────────────
  const salaryScore = (() => {
    if (seeker.salaryExpectation <= 0) return 1; // no expectation → full score
    // Different currencies can't be compared numerically — treat salary as
    // neutral rather than producing a garbage 0/1 score.
    const seekerCur = (seeker.salaryCurrency ?? "").toUpperCase().trim();
    const jobCur = (job.salaryCurrency ?? "").toUpperCase().trim();
    if (seekerCur && jobCur && seekerCur !== jobCur) return 0.5;
    // Normalize job pay to a monthly figure so monthly vs yearly/LPA jobs are
    // compared against the seeker's (monthly) expectation on the same basis.
    const periodDivisor = job.salaryPeriod === "yearly" || job.salaryPeriod === "lpa" ? 12 : 1;
    let annualizedMid = (job.salaryMin + job.salaryMax) / 2;
    // Defensive: "lpa" amounts are stored as full rupees (12 LPA = 1,200,000),
    // but if an employer entered the figure in lakhs (e.g. 12), convert it —
    // no real annual salary in rupees is below 1,000.
    if (job.salaryPeriod === "lpa" && annualizedMid > 0 && annualizedMid < 1000) {
      annualizedMid *= 100_000;
    }
    const jobMid = annualizedMid / periodDivisor;
    if (jobMid <= 0) return 0.5;
    const diff = Math.abs(seeker.salaryExpectation - jobMid) / jobMid;
    if (diff <= 0.1) return 1;
    if (diff <= 0.2) return 0.7;
    return 0;
  })();

  const raw =
    skillsScore * 0.4 +
    locationScore * 0.2 +
    experienceScore * 0.2 +
    salaryScore * 0.2;

  let score = Math.round(raw * 100);

  // ── Role title bonus (+15, capped at 100) ────────────────────────────
  if (job.title && seeker.preferredRoles?.length) {
    const titleLower = job.title.toLowerCase();
    if (seeker.preferredRoles.some((r) => titleLower.includes(r.toLowerCase()) || r.toLowerCase().includes(titleLower))) {
      score = Math.min(100, score + 15);
    }
  }

  // ── Qualification penalty ─────────────────────────────────────────────
  // Push down jobs that demand a higher qualification than the seeker holds so
  // they don't surface as "suggested". Only applied when BOTH the job's required
  // level and the seeker's level are known — otherwise the score is unchanged.
  const reqLevel = job.requiredEducationLevel ?? 0;
  const seekerLevel = seeker.educationLevel ?? 0;
  if (reqLevel > 0 && seekerLevel > 0 && seekerLevel < reqLevel) {
    const gap = reqLevel - seekerLevel;
    score = Math.max(0, score - (gap === 1 ? 8 : 18));
  }

  return score;
}

/**
 * Blend a behavioral score (0-100) into the base match score.
 * @param baseScore  – result from calculateMatchScore (0-100)
 * @param behaviorScore – behavioral engagement score (0-100)
 * @param behaviorWeight – 0-1 fraction for behavior (default 0.1 = 10%)
 */
export function blendBehaviorScore(
  baseScore: number,
  behaviorScore: number,
  behaviorWeight = 0.1,
): number {
  const baseWeight = 1 - behaviorWeight;
  return Math.min(100, Math.round(baseScore * baseWeight + behaviorScore * behaviorWeight));
}

/**
 * Build a SeekerProfile from a Mongoose JobSeeker lean document.
 * experienceYears is computed from work experience date ranges.
 */
export function seekerProfileFromDoc(seeker: {
  skills?: string[];
  preferredCountries?: string[];
  preferredSalary?: { min?: number; max?: number; currency?: string };
  preferredJobType?: string;
  preferredRoles?: string[];
  experience?: Array<{
    startDate?: Date | string;
    endDate?: Date | string;
    isCurrent?: boolean;
  }>;
  education?: Array<{ degree?: string; field?: string }>;
}): SeekerProfile {
  const now = Date.now();

  const experienceYears = (seeker.experience ?? []).reduce((total, exp) => {
    const start = exp.startDate ? new Date(exp.startDate).getTime() : 0;
    const end =
      exp.isCurrent || !exp.endDate
        ? now
        : new Date(exp.endDate).getTime();
    const years = Math.max(0, (end - start) / (1000 * 60 * 60 * 24 * 365.25));
    return total + years;
  }, 0);

  const salMin = seeker.preferredSalary?.min ?? 0;
  const salMax = seeker.preferredSalary?.max ?? 0;
  const salaryExpectation =
    salMin > 0 && salMax > 0 ? (salMin + salMax) / 2 : salMin + salMax;

  // Highest qualification the seeker holds across all education entries.
  const educationLevel = (seeker.education ?? []).reduce(
    (max, e) => Math.max(max, educationRank(e.degree), educationRank(e.field)),
    0,
  );

  return {
    skills: seeker.skills ?? [],
    location: (seeker.preferredCountries ?? [])[0]?.toLowerCase() ?? "",
    locations: (seeker.preferredCountries ?? []).map((c) => c.toLowerCase()),
    experienceYears: Math.round(experienceYears * 10) / 10,
    salaryExpectation,
    salaryCurrency: seeker.preferredSalary?.currency ?? "",
    jobType: seeker.preferredJobType ?? "any",
    preferredRoles: (seeker.preferredRoles ?? []).map((r) => r.toLowerCase()),
    educationLevel,
  };
}

/**
 * Build a JobProfile from a Mongoose Job lean document.
 */
export function jobProfileFromDoc(job: {
  requirements?: { skills?: string[]; experienceMin?: number; experienceMax?: number; education?: string };
  salary?: { min?: number; max?: number; period?: "monthly" | "yearly" | "lpa"; currency?: string };
  location?: { country?: string; isRemote?: boolean };
  title?: string;
}): JobProfile {
  return {
    skills: job.requirements?.skills ?? [],
    location: job.location?.country?.toLowerCase() ?? "",
    remote: job.location?.isRemote ?? false,
    salaryMin: job.salary?.min ?? 0,
    salaryMax: job.salary?.max ?? 0,
    salaryPeriod: job.salary?.period ?? "monthly",
    salaryCurrency: job.salary?.currency ?? "",
    minExp: job.requirements?.experienceMin ?? 0,
    maxExp: job.requirements?.experienceMax ?? 30,
    title: job.title?.toLowerCase() ?? "",
    requiredEducationLevel: educationRank(job.requirements?.education),
  };
}
