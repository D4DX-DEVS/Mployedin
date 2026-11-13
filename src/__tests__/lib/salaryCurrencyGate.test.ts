/**
 * Salary preference across currencies.
 *
 * Before 2026-11-13 the salary gate only fired when the seeker and the job used
 * the same currency, so an AED seeker was never checked against an INR or KWD
 * job (454 of 729 live pairs where both sides state pay). The expectation now
 * converts into the job's currency through the indicative AED rates; a currency
 * missing from the rate table stays incomparable rather than being read 1:1.
 */
import { seekerProfileFromDoc, type JobProfile, type SeekerProfile } from "@/lib/matchScore";
import { checkEligibility, expectationInJobCurrency } from "@/lib/matching/eligibility";
import { monthlyCeiling, monthlyExpectation } from "@/lib/matching/salary";
import { calculateRelevance } from "@/lib/matching/relevance";
import { evaluateQualifications } from "@/lib/matching/qualifications";

function seeker(overrides: Partial<SeekerProfile> = {}): SeekerProfile {
  return {
    skills: ["React"],
    location: "india",
    locations: ["india"],
    experienceYears: 3,
    experienceKnown: true,
    salaryExpectation: 9000,
    salaryCurrency: "AED",
    jobType: "any",
    preferredRoles: [],
    educationLevel: 0,
    city: "",
    cities: [],
    cvText: "",
    roleHistory: [],
    ...overrides,
  };
}

function job(overrides: Partial<JobProfile> = {}): JobProfile {
  return {
    skills: ["React"],
    location: "india",
    remote: false,
    salaryMin: 0,
    salaryMax: 0,
    salaryPeriod: "monthly",
    salaryCurrency: "INR",
    minExp: 0,
    maxExp: 10,
    title: "React Developer",
    workMode: "onsite",
    ...overrides,
  } as JobProfile;
}

const salaryRow = (s: SeekerProfile, j: JobProfile) =>
  evaluateQualifications({ seeker: s, job: j, relevance: calculateRelevance(s, j) }).checks.find(
    (c) => c.key === "salary",
  );

describe("expectationInJobCurrency", () => {
  it("converts the seeker's figure into the job's currency", () => {
    // 1 AED ≈ 22.78 INR in AED_EXCHANGE_RATES.
    expect(expectationInJobCurrency(seeker(), job())).toBeCloseTo(205_020, -1);
  });

  it("leaves same-currency and currency-less figures as they are", () => {
    expect(expectationInJobCurrency(seeker({ salaryCurrency: "INR" }), job())).toBe(9000);
    expect(expectationInJobCurrency(seeker({ salaryCurrency: "" }), job())).toBe(9000);
    expect(expectationInJobCurrency(seeker(), job({ salaryCurrency: "" }))).toBe(9000);
  });

  it("refuses a currency it has no rate for instead of reading it 1:1", () => {
    expect(expectationInJobCurrency(seeker(), job({ salaryCurrency: "XYZ" }))).toBeNull();
    expect(expectationInJobCurrency(seeker({ salaryCurrency: "ABC" }), job())).toBeNull();
  });

  it("is null when the seeker stated no pay", () => {
    expect(expectationInJobCurrency(seeker({ salaryExpectation: 0 }), job())).toBeNull();
  });
});

describe("salary gate across currencies", () => {
  it("drops an INR job paying far below an AED expectation", () => {
    const j = job({ salaryMin: 40_000, salaryMax: 60_000 });
    expect(checkEligibility(seeker(), j)).toEqual({ eligible: false, reason: "salary" });
  });

  it("keeps an INR job paying at or near the converted expectation", () => {
    // 80% of ≈205,020 is ≈164,016 — a 170k–190k job clears it.
    const j = job({ salaryMin: 170_000, salaryMax: 190_000 });
    expect(checkEligibility(seeker(), j).eligible).toBe(true);
  });

  it("converts after normalising a yearly job to monthly", () => {
    // AED 10,000 ≈ KWD 836 a month.
    const s = seeker({ salaryExpectation: 10_000, locations: ["kuwait"], location: "kuwait" });
    const fair = job({ location: "kuwait", salaryCurrency: "KWD", salaryPeriod: "yearly", salaryMin: 12_000, salaryMax: 12_000 });
    const low = job({ location: "kuwait", salaryCurrency: "KWD", salaryPeriod: "yearly", salaryMin: 6_000, salaryMax: 6_000 });
    expect(checkEligibility(s, fair).eligible).toBe(true);
    expect(checkEligibility(s, low)).toEqual({ eligible: false, reason: "salary" });
  });

  it("never drops a job whose currency has no rate", () => {
    const j = job({ salaryCurrency: "XYZ", salaryMin: 1, salaryMax: 1 });
    expect(checkEligibility(seeker(), j).eligible).toBe(true);
  });

  it("still gates same-currency pairs as before", () => {
    const s = seeker({ salaryCurrency: "INR", salaryExpectation: 100_000 });
    expect(checkEligibility(s, job({ salaryMin: 50_000, salaryMax: 60_000 })).eligible).toBe(false);
    expect(checkEligibility(s, job({ salaryMin: 90_000, salaryMax: 110_000 })).eligible).toBe(true);
  });
});

describe("yearly-looking expectations (owner decision 2026-11-13)", () => {
  it("reads figures no one earns in a month as a year's pay", () => {
    expect(monthlyExpectation(1_200_000, "INR")).toBe(100_000); // 12 LPA
    expect(monthlyExpectation(800_000, "INR")).toBeCloseTo(66_667, 0);
    expect(monthlyExpectation(100_000, "AED")).toBeCloseTo(8_333, 0);
    expect(monthlyExpectation(60_000, "AED")).toBe(5_000);
    expect(monthlyExpectation(70_000, "eur")).toBeCloseTo(5_833, 0);
  });

  it("keeps believable monthly figures as typed", () => {
    expect(monthlyExpectation(150_000, "INR")).toBe(150_000);
    expect(monthlyExpectation(50_000, "INR")).toBe(50_000);
    expect(monthlyExpectation(35_000, "AED")).toBe(35_000);
    expect(monthlyExpectation(50_000, "AED")).toBe(50_000);
    expect(monthlyExpectation(9_000, "SAR")).toBe(9_000);
  });

  it("leaves a currency without a rate, and empty figures, alone", () => {
    expect(monthlyCeiling("XYZ")).toBeNull();
    expect(monthlyExpectation(5_000_000, "XYZ")).toBe(5_000_000);
    expect(monthlyExpectation(0, "INR")).toBe(0);
  });

  it("feeds the monthly reading into the match profile", () => {
    const p = seekerProfileFromDoc({ preferredSalary: { min: 1_000_000, max: 1_400_000, currency: "INR" } } as never);
    expect(p.salaryExpectation).toBe(100_000);
    const monthly = seekerProfileFromDoc({ preferredSalary: { min: 30_000, max: 70_000, currency: "INR" } } as never);
    expect(monthly.salaryExpectation).toBe(50_000);
  });

  it("no longer prices a 12 LPA seeker out of a Dubai job", () => {
    const s = seeker({ salaryExpectation: monthlyExpectation(1_200_000, "INR"), salaryCurrency: "INR", locations: ["uae"], location: "uae" });
    const j = job({ location: "uae", salaryCurrency: "AED", salaryMin: 12_000, salaryMax: 18_000 });
    expect(checkEligibility(s, j).eligible).toBe(true);
  });
});

describe("employer salary row across currencies", () => {
  it("shows the converted figure beside what the seeker typed", () => {
    const row = salaryRow(seeker(), job({ salaryMin: 200_000, salaryMax: 220_000 }));
    expect(row?.status).toBe("met");
    expect(row?.required).toBe("INR 210000");
    expect(row?.actual).toBe("≈ INR 205020 (AED 9000)");
  });

  it("marks a converted shortfall as not met", () => {
    expect(salaryRow(seeker(), job({ salaryMin: 40_000, salaryMax: 60_000 }))?.status).toBe("not_met");
  });

  it("has no salary row when the currency cannot be converted", () => {
    expect(salaryRow(seeker(), job({ salaryCurrency: "XYZ", salaryMin: 1, salaryMax: 1 }))).toBeUndefined();
  });
});
