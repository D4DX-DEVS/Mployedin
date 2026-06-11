/**
 * @jest-environment node
 */
import { calculateMatchScore, educationRank, skillsOverlap, getMatchedSkills } from "@/lib/matchScore";

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

  it("job with 0 required skills gives only a small skill floor", () => {
    const result = calculateMatchScore(
      { ...baseSeeker },
      { ...baseJob, skills: [] }
    );
    // skills: 0.15×40=6, location: 20, experience: 20, salary: 20 = 66
    // Skill-less jobs must not outrank genuine matches with partial overlap.
    expect(result).toBe(66);
  });

  it("matches compound skill strings via embedded tokens (AWS/Azure)", () => {
    const seeker = { ...baseSeeker, skills: ["Cloud Platforms (AWS/Azure)", "React"] };
    // Without tokenizing, "Cloud Platforms (AWS/Azure)" would never match "AWS".
    expect(skillsOverlap(seeker.skills, ["AWS", "Docker"])).toBe(true);
    expect(getMatchedSkills(seeker.skills, ["AWS"])).toContain("Cloud Platforms (AWS/Azure)");
    const result = calculateMatchScore(seeker, { ...baseJob, skills: ["AWS", "Azure"] });
    // Both job skills now matched via the compound seeker skill.
    expect(result).toBeGreaterThanOrEqual(80);
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

  it("role title bonus adds 15 points capped at 100", () => {
    const result = calculateMatchScore(
      { ...baseSeeker, preferredRoles: ["senior developer"] },
      { ...baseJob, title: "senior developer react" }
    );
    // base 100 + 15 (bonus) = capped at 100
    expect(result).toBe(100);
  });

  it("role title bonus adds 15 when base is below 100", () => {
    const result = calculateMatchScore(
      { ...baseSeeker, salaryExpectation: 100000, preferredRoles: ["react developer"] },
      { ...baseJob, salaryMin: 5000, salaryMax: 7000, title: "react developer" }
    );
    // salary mismatch: base = 80, + bonus 15 = 95
    expect(result).toBe(95);
  });

  it("matches a job in a non-primary preferred country via locations[]", () => {
    const result = calculateMatchScore(
      { ...baseSeeker, location: "uae", locations: ["uae", "india"] },
      { ...baseJob, location: "india" }
    );
    // India is the seeker's 2nd preferred country → location full credit
    // skills: 40, location: 20, experience: 20, salary: 20 = 100
    expect(result).toBe(100);
  });

  it("normalizes yearly/LPA job salary to monthly before comparing", () => {
    const result = calculateMatchScore(
      { ...baseSeeker, salaryExpectation: 100000 }, // 100k/month
      { ...baseJob, salaryMin: 1200000, salaryMax: 1200000, salaryPeriod: "lpa" }
    );
    // 12 LPA = 1.2M/year → 100k/month, matches expectation exactly → salary = 1.0
    // skills: 40, location: 20, experience: 20, salary: 20 = 100
    expect(result).toBe(100);
  });

  it("penalizes a job requiring one level above the seeker's qualification", () => {
    const result = calculateMatchScore(
      { ...baseSeeker, educationLevel: 3 }, // bachelor
      { ...baseJob, requiredEducationLevel: 4 } // master
    );
    // base 100, under-qualified by 1 level → -8
    expect(result).toBe(92);
  });

  it("penalizes harder when the seeker is two or more levels below", () => {
    const result = calculateMatchScore(
      { ...baseSeeker, educationLevel: 1 }, // school
      { ...baseJob, requiredEducationLevel: 4 } // master
    );
    // base 100, gap 3 → -18
    expect(result).toBe(82);
  });

  it("does not penalize when the seeker meets or exceeds the requirement", () => {
    const result = calculateMatchScore(
      { ...baseSeeker, educationLevel: 4 }, // master
      { ...baseJob, requiredEducationLevel: 3 } // bachelor
    );
    expect(result).toBe(100);
  });

  it("does not penalize when job or seeker education level is unknown", () => {
    expect(
      calculateMatchScore({ ...baseSeeker, educationLevel: 0 }, { ...baseJob, requiredEducationLevel: 4 })
    ).toBe(100);
    expect(
      calculateMatchScore({ ...baseSeeker, educationLevel: 3 }, { ...baseJob, requiredEducationLevel: 0 })
    ).toBe(100);
  });
});

describe("educationRank", () => {
  it("maps qualifications to ascending numeric levels", () => {
    expect(educationRank("High School")).toBe(1);
    expect(educationRank("Diploma in IT")).toBe(2);
    expect(educationRank("B.Tech")).toBe(3);
    expect(educationRank("Bachelor's degree")).toBe(3);
    expect(educationRank("Master of Science")).toBe(4);
    expect(educationRank("MBA")).toBe(4);
    expect(educationRank("PhD")).toBe(5);
  });

  it("recognises hyphenated degree abbreviations", () => {
    expect(educationRank("B-Tech")).toBe(3);
    expect(educationRank("M-Tech")).toBe(4);
    expect(educationRank("B-E")).toBe(3);
  });

  it("ranks postgraduate above the generic graduate keyword", () => {
    expect(educationRank("Postgraduate")).toBe(4);
    expect(educationRank("Undergraduate")).toBe(3);
  });

  it("returns 0 for empty or unrecognised text", () => {
    expect(educationRank("")).toBe(0);
    expect(educationRank(undefined)).toBe(0);
    expect(educationRank("astronaut")).toBe(0);
  });
});

