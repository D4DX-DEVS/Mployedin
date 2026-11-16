/**
 * Role fit says where it came from, so the seeker's job page can explain the
 * number ("You've worked as …") instead of a bare "Role fit 90%".
 */
import type { JobProfile, SeekerProfile } from "@/lib/matchScore";
import { calculateRelevance } from "@/lib/matching/relevance";

function seeker(overrides: Partial<SeekerProfile> = {}): SeekerProfile {
  return {
    skills: ["React", "Node.js", "MongoDB"],
    location: "india",
    locations: ["india"],
    experienceYears: 2,
    experienceKnown: true,
    salaryExpectation: 0,
    salaryCurrency: "",
    jobType: "any",
    preferredRoles: [],
    educationLevel: 3,
    city: "",
    cities: [],
    cvText: "",
    roleHistory: [],
    ...overrides,
  };
}

function job(overrides: Partial<JobProfile> = {}): JobProfile {
  return {
    skills: ["React", "Node.js", "MongoDB"],
    preferredSkills: [],
    location: "india",
    city: "",
    remote: false,
    salaryMin: 0,
    salaryMax: 0,
    salaryPeriod: "monthly",
    salaryCurrency: "",
    minExp: 0,
    maxExp: 0,
    title: "mern stack developer",
    workMode: "",
    requiredEducationLevel: 0,
    ...overrides,
  };
}

describe("Role fit basis", () => {
  it("names the past job that counted when the wanted role is unrelated", () => {
    const s = seeker({
      preferredRoles: ["UI/UX Designer"],
      roleHistory: [
        { title: "Graphic Designer", years: 1 },
        { title: "MERN Stack Developer", years: 2 },
      ],
    });
    const r = calculateRelevance(s, job());
    expect(r.role).toBe(90);
    expect(r.roleBasis).toEqual({ kind: "past", title: "MERN Stack Developer" });
  });

  it("names the wanted role when it is an exact match", () => {
    const s = seeker({ preferredRoles: ["MERN Stack Developer"], roleHistory: [{ title: "MERN Stack Developer", years: 2 }] });
    const r = calculateRelevance(s, job());
    expect(r.role).toBe(100);
    expect(r.roleBasis).toEqual({ kind: "wanted", title: "MERN Stack Developer" });
  });

  it("says nothing matched when neither past jobs nor wanted roles relate", () => {
    const s = seeker({ preferredRoles: ["Accountant"], roleHistory: [{ title: "Quality Control Engineer", years: 3 }] });
    const r = calculateRelevance(s, job());
    expect(r.role).toBe(15);
    expect(r.roleBasis).toEqual({ kind: "none" });
  });

  it("is unknown when the profile names no role and no past job", () => {
    const r = calculateRelevance(seeker(), job());
    expect(r.role).toBe(50);
    expect(r.roleBasis).toEqual({ kind: "unknown" });
  });
});
