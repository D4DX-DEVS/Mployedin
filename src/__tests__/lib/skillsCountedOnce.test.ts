/**
 * A language or a driving licence the job asks for in its own part is not also
 * counted as a skill (owner, 2026-11-13).
 *
 * The "Operations Head" job typed "Malayalam proficiency", "English
 * proficiency" and "Driving" as skills and again as Languages and a
 * "2 or 4 Wheeler Driving License" line, so the job page listed each twice and
 * one missing licence cost the seeker in Skills and in Licences.
 */
import type { SeekerProfile } from "@/lib/matchScore";
import { calculateRelevance } from "@/lib/matching/relevance";
import { toCandidateJob } from "@/lib/matching/recommend";

function seeker(overrides: Partial<SeekerProfile> = {}): SeekerProfile {
  return {
    skills: ["Leadership"],
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
    evidence: { level: 0, entries: [], languages: ["english", "malayalam"], listed: ["Leadership"], cv: "", roles: [] },
    ...overrides,
  };
}

const operationsHead = (extra: Record<string, unknown> = {}) =>
  toCandidateJob({
    _id: "job-ops",
    title: "Operations Head",
    location: { country: "India", isRemote: false },
    requirements: {
      skills: ["Leadership", "IT Tools", "Malayalam proficiency", "English proficiency", "Driving", "Event Coordination"],
      experienceMin: 0,
      experienceMax: 5,
      languages: ["English", "Malayalam"],
      languagesConfirmedAt: new Date("2026-11-01"),
    },
    qualifications: ["2 or 4 Wheeler Driving License"],
    employerId: { companyName: "Acme" },
    ...extra,
  });

describe("skills the job also asks for elsewhere", () => {
  it("scores the languages and the licence in their own parts only", () => {
    const b = calculateRelevance(seeker(), operationsHead().profile);
    const listed = [...b.requiredMatched, ...b.requiredMissing];
    expect(listed).toEqual(["Leadership", "IT Tools", "Event Coordination"]);
    expect(b.requiredMatched).toEqual(["Leadership"]);
    expect(b.languages).toBe(100);
    expect(b.credentials).not.toBeNull();
    // Skills: 1 of the 3 real skills.
    expect(b.skills).toBe(33);
  });

  it("keeps a language typed only as a skill when the job lists no languages", () => {
    const j = operationsHead({
      requirements: { skills: ["Leadership", "English proficiency"], experienceMin: 0, experienceMax: 5 },
      qualifications: [],
    });
    const b = calculateRelevance(seeker(), j.profile);
    expect(b.requiredMatched).toEqual(["Leadership", "English proficiency"]);
    expect(b.languages).toBeNull();
  });

  it("keeps Driving as a skill when the job asks for no driving licence", () => {
    const j = operationsHead({
      requirements: { skills: ["Leadership", "Driving"], experienceMin: 0, experienceMax: 5 },
      qualifications: [],
    });
    const b = calculateRelevance(seeker(), j.profile);
    expect([...b.requiredMatched, ...b.requiredMissing]).toEqual(["Leadership", "Driving"]);
  });

  it("keeps a language skill the job's language list does not cover", () => {
    const j = operationsHead({
      requirements: {
        skills: ["Arabic proficiency"],
        experienceMin: 0,
        experienceMax: 5,
        languages: ["English"],
        languagesConfirmedAt: new Date("2026-11-01"),
      },
      qualifications: [],
    });
    const b = calculateRelevance(seeker(), j.profile);
    expect(b.requiredMissing).toContain("Arabic proficiency");
  });
});
