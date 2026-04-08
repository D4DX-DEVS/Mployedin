/**
 * @jest-environment node
 */
import { calculateMatchScore } from "@/lib/matchScore";

describe("calculateMatchScore", () => {
  const baseSeeker = {
    skills: ["React", "TypeScript", "Node.js"],
    location: "uae",
    experienceYears: 3,
    salaryExpectation: 10000,
  };

  const baseJob = {
    skills: ["React", "TypeScript", "Node.js"],
    location: "uae",
    remote: false,
    salaryMin: 9000,
    salaryMax: 11000,
    minExp: 2,
    maxExp: 5,
  };

  it("perfect match returns 100", () => {
    expect(calculateMatchScore(baseSeeker, baseJob)).toBe(100);
  });

  it("skills match only (no location, exp, salary match) returns ~40", () => {
    const result = calculateMatchScore(
      { ...baseSeeker, location: "india", experienceYears: 20, salaryExpectation: 50000 },
      { ...baseJob, location: "usa", remote: false, salaryMin: 1000, salaryMax: 2000, minExp: 0, maxExp: 1 }
    );
    // Skills: 40%, location: 0%, experience: 0.3×20%=6%, salary: 0×20%=0
    // = 40 + 0 + 6 + 0 = 46 — within range
    expect(result).toBeGreaterThanOrEqual(40);
    expect(result).toBeLessThan(55);
  });

  it("remote job ignores location mismatch", () => {
    const result = calculateMatchScore(
      { ...baseSeeker, location: "india" },
      { ...baseJob, location: "usa", remote: true }
    );
    // Location should be 1.0 for remote
    // skills: 40%, location: 20%, experience: 20%, salary: 20% = 100
    expect(result).toBe(100);
  });

  it("salary far outside range returns 0 salary component", () => {
    const result = calculateMatchScore(
      { ...baseSeeker, salaryExpectation: 100000 },
      { ...baseJob, salaryMin: 5000, salaryMax: 7000 }
    );
    // jobMid = 6000, diff = (100000-6000)/6000 ≈ 15.67 > 0.2 → salary = 0
    // skills: 40, location: 20, experience: 20, salary: 0 = 80
    expect(result).toBe(80);
  });

  it("job with 0 required skills gives full skill score", () => {
    const result = calculateMatchScore(
      { ...baseSeeker },
      { ...baseJob, skills: [] }
    );
    // skills: 1×40=40, location: 20, experience: 20, salary: 20 = 100
    expect(result).toBe(100);
  });

  it("no seeker salary expectation returns full salary score", () => {
    const result = calculateMatchScore(
      { ...baseSeeker, salaryExpectation: 0 },
      { ...baseJob }
    );
    expect(result).toBe(100);
  });

  it("experience below minimum gets partial score", () => {
    const result = calculateMatchScore(
      { ...baseSeeker, experienceYears: 0 },
      { ...baseJob, minExp: 3, maxExp: 7 }
    );
    // gap = 3 > 1 → experience = 0.3 → experienceScore×20 = 6
    // skills: 40, location: 20, experience: 6, salary: 20 = 86
    expect(result).toBe(86);
  });

  it("experience within 1 year of minimum gets 0.7 score", () => {
    const result = calculateMatchScore(
      { ...baseSeeker, experienceYears: 1 },
      { ...baseJob, minExp: 2, maxExp: 5 }
    );
    // gap = 1 ≤ 1 → experience = 0.7 → 0.7×20 = 14
    // skills: 40, location: 20, experience: 14, salary: 20 = 94
    expect(result).toBe(94);
  });

  it("role title bonus adds 5 points capped at 100", () => {
    const result = calculateMatchScore(
      { ...baseSeeker, preferredRoles: ["senior developer"] },
      { ...baseJob, title: "senior developer react" }
    );
    // base 100 + 5 (bonus) = capped at 100
    expect(result).toBe(100);
  });

  it("role title bonus adds 5 when base is below 100", () => {
    const result = calculateMatchScore(
      { ...baseSeeker, salaryExpectation: 100000, preferredRoles: ["react developer"] },
      { ...baseJob, salaryMin: 5000, salaryMax: 7000, title: "react developer" }
    );
    // salary mismatch: base = 80, + bonus 5 = 85
    expect(result).toBe(85);
  });
});
