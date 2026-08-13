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

  it("treats an unstated salary expectation as neutral, not a free full score", () => {
    const result = calculateMatchScore(
      { ...baseSeeker, salaryExpectation: 0 },
      { ...baseJob }
    );
    // Unknown → 0.5 × 20 = 10. Previously this returned 1.0, which meant filling
    // in a salary preference could only ever lower a seeker's match scores.
    expect(result).toBe(90);
  });

  it("scores an unstated expectation below a stated one that actually fits", () => {
    const unknown = calculateMatchScore({ ...baseSeeker, salaryExpectation: 0 }, baseJob);
    const fits = calculateMatchScore(baseSeeker, baseJob); // 10000 vs 9000-11000
    expect(fits).toBeGreaterThan(unknown);
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

  it("treats salary as neutral when seeker and job currencies differ", () => {
    const result = calculateMatchScore(
      { ...baseSeeker, salaryExpectation: 100000, salaryCurrency: "INR" },
      { ...baseJob, salaryMin: 5000, salaryMax: 7000, salaryCurrency: "AED" }
    );
    // currencies differ → salary neutral 0.5 → 0.5×20 = 10
    // skills: 40, location: 20, experience: 20, salary: 10 = 90
    expect(result).toBe(90);
  });

  it("compares salary normally when currencies match", () => {
    const result = calculateMatchScore(
      { ...baseSeeker, salaryCurrency: "USD" },
      { ...baseJob, salaryCurrency: "usd" }
    );
    expect(result).toBe(100);
  });

  it("converts lakh-denominated LPA amounts to rupees before comparing", () => {
    const result = calculateMatchScore(
      { ...baseSeeker, salaryExpectation: 100000 }, // 100k/month
      { ...baseJob, salaryMin: 12, salaryMax: 12, salaryPeriod: "lpa" }
    );
    // 12 (lakhs) → 1.2M/year → 100k/month → salary = 1.0
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

  describe("required vs preferred skills", () => {
    it("costs only a little to miss the nice-to-have skills", () => {
      const result = calculateMatchScore(baseSeeker, {
        ...baseJob,
        preferredSkills: ["AWS", "Docker"],
      });
      // required 1.0 × 0.85 + preferred 0 × 0.15 = 0.85 → 34 + 20 + 20 + 20 = 94
      expect(result).toBe(94);
    });

    it("ranks a candidate with the required skills far above one with only the extras", () => {
      const job = { ...baseJob, preferredSkills: ["AWS", "Docker"] };
      const hasRequired = calculateMatchScore(baseSeeker, job);
      const hasOnlyPreferred = calculateMatchScore(
        { ...baseSeeker, skills: ["AWS", "Docker"] },
        job
      );
      // The whole point of the split: optional extras must never outweigh must-haves.
      expect(hasRequired).toBeGreaterThan(hasOnlyPreferred);
      expect(hasOnlyPreferred).toBe(66); // 0.15 × 40 = 6, + 20 + 20 + 20
    });

    it("falls back to preferred skills when a job lists no required ones", () => {
      const result = calculateMatchScore(baseSeeker, {
        ...baseJob,
        skills: [],
        preferredSkills: ["React", "TypeScript", "Node.js"],
      });
      // Better evidence than the 0.15 no-skills floor, so it must score higher.
      expect(result).toBe(100);
    });
  });

  describe("CV text as skill evidence", () => {
    const job = { ...baseJob, skills: ["React", "TypeScript", "Node.js"] };

    it("credits a required skill proven by the CV but absent from the skills list", () => {
      const declaredOnly = calculateMatchScore({ ...baseSeeker, skills: ["React"] }, job);
      const withCv = calculateMatchScore(
        {
          ...baseSeeker,
          skills: ["React"],
          cvText: "Built payment services with Node.js and TypeScript at Acme.",
        },
        job
      );
      expect(withCv).toBeGreaterThan(declaredOnly);
      expect(withCv).toBe(93); // (1 + 0.75 + 0.75)/3 × 40 = 33.3 + 60
    });

    it("does not match a skill on a substring of an unrelated word", () => {
      const result = calculateMatchScore(
        { ...baseSeeker, skills: [], cvText: "Strong JavaScript background." },
        { ...baseJob, skills: ["Java"] }
      );
      // "java" must not be found inside "javascript" — whole-token test only.
      // Java is grouped with Spring, not JS, so there is no related credit either.
      expect(result).toBe(60); // 0 skills + 20 + 20 + 20
    });
  });

  describe("city-level location", () => {
    const seeker = { ...baseSeeker, location: "india", locations: ["india"] };
    const job = { ...baseJob, location: "india", remote: false };

    it("gives full credit when the city matches", () => {
      expect(calculateMatchScore({ ...seeker, cities: ["kochi"] }, { ...job, city: "kochi" })).toBe(100);
    });

    it("discounts an onsite job in a different city of the same country", () => {
      const result = calculateMatchScore({ ...seeker, cities: ["kochi"] }, { ...job, city: "bangalore" });
      expect(result).toBe(92); // location 0.6 × 20 = 12
    });

    it("does not punish a city mismatch when either side is unknown", () => {
      expect(calculateMatchScore({ ...seeker, cities: [] }, { ...job, city: "bangalore" })).toBe(100);
      expect(calculateMatchScore({ ...seeker, cities: ["kochi"] }, { ...job, city: "" })).toBe(100);
    });

    it("still ignores location entirely for remote jobs", () => {
      const result = calculateMatchScore(
        { ...seeker, cities: ["kochi"] },
        { ...job, city: "bangalore", remote: true }
      );
      expect(result).toBe(100);
    });
  });

  describe("relevant vs raw experience", () => {
    const job = { ...baseJob, title: "senior react developer", minExp: 8, maxExp: 12 };

    it("counts years in related roles toward the requirement", () => {
      const result = calculateMatchScore(
        {
          ...baseSeeker,
          experienceYears: 10,
          roleHistory: [{ title: "React Developer", years: 10 }],
        },
        job
      );
      expect(result).toBe(100); // 10 relevant years lands inside 8-12
    });

    it("discounts a long career spent in unrelated roles", () => {
      const result = calculateMatchScore(
        {
          ...baseSeeker,
          experienceYears: 10,
          roleHistory: [{ title: "Retail Cashier", years: 10 }],
        },
        job
      );
      // 0 relevant years, floored at half of 10 = 5 → 3 short of the minimum → 0.3
      expect(result).toBe(86);
    });

    it("never zeroes out a real career on a title-wording mismatch", () => {
      // minExp 6 so the half-of-total floor (5 yrs) lands in a different band
      // than a genuinely empty career — with job's 8-12 range both saturate at 0.3.
      const nearJob = { ...job, minExp: 6 };
      const unrelated = calculateMatchScore(
        { ...baseSeeker, experienceYears: 10, roleHistory: [{ title: "Retail Cashier", years: 10 }] },
        nearJob
      );
      const noHistory = calculateMatchScore({ ...baseSeeker, experienceYears: 0 }, nearJob);
      expect(unrelated).toBe(94); // floored at 5 yrs → 1 short of min → 0.7
      expect(noHistory).toBe(86); // 0 yrs → 6 short → 0.3
    });

    it("falls back to total years when there is no role history", () => {
      const result = calculateMatchScore({ ...baseSeeker, experienceYears: 10 }, job);
      expect(result).toBe(100);
    });
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

