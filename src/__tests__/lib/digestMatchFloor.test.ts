/**
 * @jest-environment node
 *
 * Guards the invariant that lets the daily digest claim a job "matches your
 * profile": a seeker who has stated nothing can never clear the digest's
 * threshold.
 *
 * Every component of the score treats an unstated field as neutral rather than
 * as a zero — correct for ranking, but it meant a blank profile scored a
 * plausible 46% against every job on the platform, and the digest threshold sat
 * at 40. Three live accounts were mailed five "46% match" cards every morning
 * having never entered a skill, a country or a salary.
 */
import {
  calculateMatchDetail,
  calculateMatchScore,
  profileSignalCount,
  seekerProfileFromDoc,
  jobProfileFromDoc,
  MIN_PROFILE_SIGNALS,
  NO_SIGNAL_CEILING,
  type SeekerProfile,
  type JobProfile,
} from "@/lib/matchScore";

/** The digest's own bar. Kept in sync by the "strictly above" test below. */
const MIN_MATCH_SCORE = 50;

const emptySeeker = (): SeekerProfile => seekerProfileFromDoc({});

/**
 * Every shape a live job takes, so the ceiling is proven against the whole
 * space rather than one hand-picked example.
 */
function jobMatrix(): JobProfile[] {
  const jobs: JobProfile[] = [];
  for (const skills of [[], ["react"], ["welding", "autocad"]]) {
    for (const remote of [true, false]) {
      for (const [minExp, maxExp] of [[0, 30], [0, 2], [3, 8], [10, 30]]) {
        for (const [salaryMin, salaryMax] of [[0, 0], [3000, 5000], [100000, 200000]]) {
          for (const country of ["", "india", "uae", "oman"]) {
            jobs.push(
              jobProfileFromDoc({
                requirements: { skills, experienceMin: minExp, experienceMax: maxExp },
                salary: { min: salaryMin, max: salaryMax, currency: "AED" },
                location: { country, isRemote: remote },
                title: "Site Engineer",
              }),
            );
          }
        }
      }
    }
  }
  return jobs;
}

describe("no-signal profiles cannot qualify for the daily digest", () => {
  it("the digest threshold sits strictly above the no-signal ceiling", () => {
    expect(MIN_MATCH_SCORE).toBeGreaterThan(NO_SIGNAL_CEILING);
  });

  it("an empty profile never reaches the digest threshold against any job", () => {
    const seeker = emptySeeker();
    const scores = jobMatrix().map((job) => calculateMatchScore(seeker, job));

    expect(scores.length).toBeGreaterThan(100);
    expect(Math.max(...scores)).toBeLessThanOrEqual(NO_SIGNAL_CEILING);
    expect(scores.filter((s) => s >= MIN_MATCH_SCORE)).toHaveLength(0);
  });

  it("the ceiling is reached exactly where the arithmetic says it is", () => {
    // Remote job (location 1.0) with no stated skills (floor 0.15); experience
    // and salary both unknown (0.5 each).
    const detail = calculateMatchDetail(
      emptySeeker(),
      jobProfileFromDoc({
        requirements: {},
        salary: {},
        location: { country: "", isRemote: true },
      }),
    );
    expect(detail).toMatchObject({
      skills: 15,
      location: 100,
      experience: 50,
      salary: 50,
      overall: NO_SIGNAL_CEILING,
    });
  });

  it("unknown experience scores neutral, not perfect", () => {
    // The original defect: 0 years sat inside "0 to 30" and scored 100/100, so
    // stating nothing about your career was worth the full 20% weight.
    const job = jobProfileFromDoc({
      requirements: { experienceMin: 0, experienceMax: 30 },
      location: { country: "india" },
    });
    expect(calculateMatchDetail(emptySeeker(), job).experience).toBe(50);
  });

  it("a declared fresher is scored on that, not treated as unknown", () => {
    // workStatus is the only field that can tell "0 years" apart from "never
    // answered" — totalExperienceYears defaults to 0 on every document.
    const fresher = seekerProfileFromDoc({ workStatus: "fresher" });
    const seniorJob = jobProfileFromDoc({
      requirements: { experienceMin: 6, experienceMax: 12 },
      location: { country: "india" },
    });
    expect(fresher.experienceKnown).toBe(true);
    expect(calculateMatchDetail(fresher, seniorJob).experience).toBe(30);
    // …whereas a silent document stays neutral against the same job.
    expect(calculateMatchDetail(emptySeeker(), seniorJob).experience).toBe(50);
  });

  it("uses a stated total when the seeker added no dated entries", () => {
    // The form's "total experience" field was ignored entirely: years came only
    // from dated `experience` rows, so stating 8 years scored as zero.
    const seeker = seekerProfileFromDoc({ totalExperienceYears: 8 });
    expect(seeker.experienceYears).toBe(8);
    expect(seeker.experienceKnown).toBe(true);

    const job = jobProfileFromDoc({
      requirements: { experienceMin: 6, experienceMax: 12 },
      location: { country: "india" },
    });
    expect(calculateMatchDetail(seeker, job).experience).toBe(100);
  });

  it("dated entries win over a stale stated total", () => {
    const seeker = seekerProfileFromDoc({
      totalExperienceYears: 99,
      experience: [{ jobTitle: "Dev", startDate: "2023-01-01", endDate: "2025-01-01" }],
    });
    expect(seeker.experienceYears).toBeCloseTo(2, 0);
  });

  it("a real fresher who states their history still scores on it", () => {
    const fresher = seekerProfileFromDoc({
      experience: [
        { jobTitle: "Intern", startDate: "2025-01-01", endDate: "2025-07-01" },
      ],
    });
    const job = jobProfileFromDoc({
      requirements: { experienceMin: 0, experienceMax: 2 },
      location: { country: "india" },
    });
    expect(calculateMatchDetail(fresher, job).experience).toBe(100);
  });
});

describe("profileSignalCount", () => {
  it("counts nothing for an empty profile", () => {
    expect(profileSignalCount(emptySeeker())).toBe(0);
  });

  it("counts each stated field once", () => {
    const seeker = seekerProfileFromDoc({
      skills: ["welding"],
      preferredCountries: ["UAE"],
    });
    expect(profileSignalCount(seeker)).toBe(2);
  });

  it("a salary expectation alone is below the digest's bar", () => {
    // The exact shape of the live account that was mailed five 46% cards: a
    // salary figure and nothing else.
    const seeker = seekerProfileFromDoc({
      preferredSalary: { min: 1200000, max: 0, currency: "INR" },
      preferredLocations: ["Dubai", "Mumbai"],
    });
    expect(profileSignalCount(seeker)).toBe(1);
    expect(profileSignalCount(seeker)).toBeLessThan(MIN_PROFILE_SIGNALS);
  });

  it("preferred cities alone are not a country signal", () => {
    // preferredLocations feeds city refinement only; the location component
    // reads preferredCountries, so a seeker who filled one and not the other
    // still has no location signal.
    const seeker = seekerProfileFromDoc({ preferredLocations: ["Dubai"] });
    expect(profileSignalCount(seeker)).toBe(0);
  });

  it("a profile with real signal can exceed the threshold", () => {
    const seeker = seekerProfileFromDoc({
      skills: ["react", "typescript"],
      preferredCountries: ["UAE"],
      experience: [
        { jobTitle: "Frontend Developer", startDate: "2021-01-01", isCurrent: true },
      ],
    });
    expect(profileSignalCount(seeker)).toBeGreaterThanOrEqual(MIN_PROFILE_SIGNALS);

    const job = jobProfileFromDoc({
      requirements: { skills: ["react", "typescript"], experienceMin: 2, experienceMax: 6 },
      location: { country: "UAE" },
      title: "Frontend Developer",
    });
    expect(calculateMatchScore(seeker, job)).toBeGreaterThanOrEqual(MIN_MATCH_SCORE);
  });
});
