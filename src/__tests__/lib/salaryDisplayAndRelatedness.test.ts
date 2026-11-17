import { formatSalary, lakhsOf, salaryAmount, type SalaryTranslate } from "@/lib/ui/salaryDisplay";
import { relatedness, RELATED_ENOUGH } from "@/lib/matching/relevance";

const t: SalaryTranslate = (key, { amount }) =>
  ({ monthly: `${amount} / month`, yearly: `${amount} / year`, lpa: `${amount} LPA`, from: `From ${amount}` })[key];
const n = (v: number) => String(v);

describe("salary display (QA 2026-11-17)", () => {
  it("prints an LPA job in lakhs, stored either as lakhs or as whole rupees", () => {
    expect(formatSalary({ min: 8, max: 18, currency: "INR", period: "lpa" }, t, n)).toBe("8–18 LPA");
    expect(formatSalary({ min: 600000, max: 1200000, currency: "INR", period: "lpa" }, t, n)).toBe("6–12 LPA");
    expect(lakhsOf(1_250_000)).toBe(12.5);
  });

  it("keeps the job's own period instead of always saying per month", () => {
    expect(formatSalary({ min: 1200000, max: 1800000, currency: "INR", period: "yearly" }, t, n)).toBe("1200000–1800000 INR / year");
    expect(formatSalary({ min: 40000, max: 80000, currency: "INR" }, t, n)).toBe("40000–80000 INR / month");
  });

  it("prints one figure for an equal range and 'From' when only a minimum is set", () => {
    expect(formatSalary({ min: 800, max: 800, currency: "KWD", period: "monthly" }, t, n)).toBe("800 KWD / month");
    expect(formatSalary({ min: 5000, currency: "AED" }, t, n)).toBe("From 5000 AED / month");
  });

  it("treats a negative or zero bound as absent", () => {
    expect(salaryAmount({ min: -100, max: 9000, currency: "AED" }, n)).toBe("9000 AED");
    expect(formatSalary({ min: 0, max: 0, currency: "INR" }, t, n)).toBeNull();
  });
});

describe("relatedness: experience and education count only for related jobs", () => {
  it("is 0 for a job with no role relation and no skill overlap", () => {
    expect(relatedness(0.15, { kind: "none" }, false, 0)).toBe(0);
    expect(relatedness(0.15, { kind: "none" }, true, 0)).toBe(0);
  });

  it("is full once role fit or skills reach the bar", () => {
    expect(relatedness(0.9, { kind: "past", title: "Developer" }, true, 0)).toBe(1);
    expect(relatedness(0.15, { kind: "none" }, false, 1)).toBe(1);
    expect(relatedness(0.15, { kind: "none" }, false, RELATED_ENOUGH)).toBe(1);
  });

  it("scales in between", () => {
    expect(relatedness(0.15, { kind: "none" }, false, 0.25)).toBeCloseTo(0.5);
  });

  it("stays neutral when the profile and the job give no evidence either way", () => {
    expect(relatedness(0.5, { kind: "unknown" }, true, 0)).toBe(1);
  });
});

describe("wanted-role partial match ignores generic job nouns", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { calculateRelevance } = require("@/lib/matching/relevance") as typeof import("@/lib/matching/relevance");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { seekerProfileFromDoc } = require("@/lib/matchScore") as typeof import("@/lib/matchScore");
  const job = (title: string) => ({
    title, skills: [], preferredSkills: [], experienceMin: 0, experienceMax: 30, location: "india",
    salaryMin: 0, salaryMax: 0, salaryCurrency: "INR", remote: false,
  }) as never;

  it("does not match on a shared 'executive' or school grade alone", () => {
    const accountant = seekerProfileFromDoc({ preferredRoles: ["Accounts Executive"], preferredCountries: ["India"] });
    expect(calculateRelevance(accountant, job("Medical Executive")).role).toBe(15);
    const teacher = seekerProfileFromDoc({ preferredRoles: ["PGT Physics"], preferredCountries: ["India"] });
    expect(calculateRelevance(teacher, job("PGT – Accountancy")).role).toBe(15);
  });

  it("still matches on the word that says what the work is", () => {
    const qa = seekerProfileFromDoc({ preferredRoles: ["QA Tester"], preferredCountries: ["India"] });
    expect(calculateRelevance(qa, job("Senior QA Engineer")).role).toBe(60);
  });
});
