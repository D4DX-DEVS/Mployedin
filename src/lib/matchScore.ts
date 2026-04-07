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
  experienceYears: number;
  salaryExpectation: number; // mid-point of preferred salary range, 0 disables salary component
  /** Preferred job type: "remote" | "hybrid" | "onsite" | "any" */
  jobType?: string;
  /** Preferred role keywords (lower-cased). Used for bonus only. */
  preferredRoles?: string[];
}

export interface JobProfile {
  skills: string[];
  /** Job country (lower-cased). */
  location: string;
  remote: boolean;
  salaryMin: number;
  salaryMax: number;
  /** 0 = no minimum */
  minExp: number;
  /** 30 = no cap */
  maxExp: number;
  /** Job title (lower-cased). Used for bonus. */
  title?: string;
}

export function calculateMatchScore(seeker: SeekerProfile, job: JobProfile): number {
  // ── Skills (40%) ────────────────────────────────────────────────────
  const jobSkills = job.skills.map((s) => s.toLowerCase());
  const seekerSkills = seeker.skills.map((s) => s.toLowerCase());
  const skillsScore =
    jobSkills.length === 0
      ? 1 // job requires no specific skills → full score
      : seekerSkills.filter((s) => jobSkills.includes(s)).length /
        jobSkills.length;

  // ── Location (20%) ───────────────────────────────────────────────────
  const locationScore = (() => {
    if (job.remote) return 1;
    if (!seeker.location || seeker.location === "") return 0.5; // partial when unknown
    return seeker.location.toLowerCase() === job.location.toLowerCase() ? 1 : 0;
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
    const jobMid = (job.salaryMin + job.salaryMax) / 2;
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

  // ── Role title bonus (+5, capped at 100) ─────────────────────────────
  if (job.title && seeker.preferredRoles?.length) {
    const titleLower = job.title.toLowerCase();
    if (seeker.preferredRoles.some((r) => titleLower.includes(r.toLowerCase()))) {
      score = Math.min(100, score + 5);
    }
  }

  return score;
}

/**
 * Build a SeekerProfile from a Mongoose JobSeeker lean document.
 * experienceYears is computed from work experience date ranges.
 */
export function seekerProfileFromDoc(seeker: {
  skills?: string[];
  preferredCountries?: string[];
  preferredSalary?: { min?: number; max?: number };
  preferredJobType?: string;
  preferredRoles?: string[];
  experience?: Array<{
    startDate?: Date | string;
    endDate?: Date | string;
    isCurrent?: boolean;
  }>;
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

  return {
    skills: seeker.skills ?? [],
    location: (seeker.preferredCountries ?? [])[0]?.toLowerCase() ?? "",
    experienceYears: Math.round(experienceYears * 10) / 10,
    salaryExpectation,
    jobType: seeker.preferredJobType ?? "any",
    preferredRoles: (seeker.preferredRoles ?? []).map((r) => r.toLowerCase()),
  };
}

/**
 * Build a JobProfile from a Mongoose Job lean document.
 */
export function jobProfileFromDoc(job: {
  requirements?: { skills?: string[]; experienceMin?: number; experienceMax?: number };
  salary?: { min?: number; max?: number };
  location?: { country?: string; isRemote?: boolean };
  title?: string;
}): JobProfile {
  return {
    skills: job.requirements?.skills ?? [],
    location: job.location?.country?.toLowerCase() ?? "",
    remote: job.location?.isRemote ?? false,
    salaryMin: job.salary?.min ?? 0,
    salaryMax: job.salary?.max ?? 0,
    minExp: job.requirements?.experienceMin ?? 0,
    maxExp: job.requirements?.experienceMax ?? 30,
    title: job.title?.toLowerCase() ?? "",
  };
}
