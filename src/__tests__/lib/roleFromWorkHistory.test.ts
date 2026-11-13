/**
 * Role fit reads the seeker's past job titles as well as their preferred roles
 * (owner, 2026-11-13).
 *
 * Before, a seeker who named no preferred role sat at a neutral 50 for every
 * job, so any job listing no skills read 69% for anyone — a VLSI engineer's
 * top three were MERN Stack Developer, Medical Executive and PGT Accountancy.
 * And 1.9 years as a "MERN Stack Developer" counted for nothing on a MERN
 * Stack Developer job when the preferred role said "Full Stack Developer".
 */
import type { JobProfile, SeekerProfile } from "@/lib/matchScore";
import { calculateRelevance } from "@/lib/matching/relevance";

function seeker(overrides: Partial<SeekerProfile> = {}): SeekerProfile {
  return {
    skills: [],
    location: "india",
    locations: ["india"],
    experienceYears: 3,
    experienceKnown: true,
    salaryExpectation: 0,
    salaryCurrency: "",
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

function job(title: string, overrides: Partial<JobProfile> = {}): JobProfile {
  return {
    skills: [],
    location: "india",
    remote: false,
    salaryMin: 0,
    salaryMax: 0,
    minExp: 0,
    maxExp: 10,
    title,
    workMode: "onsite",
    ...overrides,
  } as JobProfile;
}

const role = (s: SeekerProfile, title: string) => calculateRelevance(s, job(title)).role;

describe("role fit from work history", () => {
  const mern = seeker({
    preferredRoles: ["ui/ux designer", "react developer", "full stack developer"],
    roleHistory: [
      { title: "MERN Stack Developer", years: 1.9 },
      { title: "Full Stack Intern", years: 0.5 },
    ],
  });

  it("credits a past job of the same kind above a loose preferred-role match", () => {
    // Preferred "Full Stack Developer" only shares "stack" (60); the history is the same job.
    expect(role(mern, "MERN Stack Developer")).toBe(90);
  });

  it("still lets an exact wanted role outrank what the seeker did", () => {
    expect(role(mern, "React Developer")).toBe(100);
  });

  it("does not match on a shared generic noun", () => {
    const qa = seeker({ roleHistory: [{ title: "QA Engineer", years: 3 }] });
    expect(role(qa, "Backend Engineer")).toBe(15);
    expect(role(qa, "Senior QA Engineer")).toBe(90);
  });

  it("scores an unrelated job low when the seeker has a history but no preferred roles", () => {
    const vlsi = seeker({ roleHistory: [{ title: "VLSI Design Engineer", years: 2 }, { title: "Hardware Engineer", years: 1 }] });
    expect(role(vlsi, "Medical Executive")).toBe(15);
    expect(role(vlsi, "MERN Stack Developer")).toBe(15);
    expect(role(vlsi, "Hardware Design Engineer")).toBe(90);
  });

  it("stays neutral only for a seeker who told us nothing", () => {
    expect(role(seeker(), "MERN Stack Developer")).toBe(50);
  });

  it("no longer reads a blank job as 69% for anyone", () => {
    const vlsi = seeker({ roleHistory: [{ title: "VLSI Design Engineer", years: 3 }] });
    const blank = job("PGT – Accountancy");
    // Role 15 of 25 points and experience full: (3.75 + 15) / 40.
    expect(calculateRelevance(vlsi, blank).overall).toBe(47);
    expect(calculateRelevance(seeker(), blank).overall).toBe(69);
  });

  it("puts a past MERN developer on a MERN job near the top", () => {
    const j = job("MERN Stack Developer", {
      skills: ["MongoDB", "Express.js", "React.js", "Node.js", "JavaScript", "REST APIs"],
      minExp: 2,
      maxExp: 5,
    });
    const s = { ...mern, skills: ["MongoDB", "Express.js", "React.js", "Node.js", "JavaScript", "REST APIs"], experienceYears: 2.4 };
    // Skills 50 + role 0.9 × 31.25 + experience 18.75.
    expect(calculateRelevance(s, j).overall).toBe(97);
  });
});
