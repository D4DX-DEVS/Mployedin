/**
 * @jest-environment node
 *
 * The in-app side of "one engine". Every seeker page — home, the jobs feed,
 * the preferences and skills pages — and the employer's applicant score go
 * through these helpers, so they pin what the pages promise:
 *
 *   - "recommended" means eligible AND at or above the admin threshold — the
 *     rule the digest uses — and recommended jobs always lead;
 *   - a job that fails a gate keeps its percentage and only loses position;
 *   - a page and the email give the same pair the same number;
 *   - an empty list comes with the reason.
 */
import type { SeekerProfile } from "@/lib/matchScore";

const mockDecide = jest.fn();
jest.mock("@/lib/ai/jev", () => ({
  ...jest.requireActual("@/lib/ai/jev"),
  hasJev: () => true,
  decide: (...args: unknown[]) => mockDecide(...args),
}));

let mockThreshold = 80;
let mockAiOn = true;
jest.mock("@/models/SystemConfig", () => ({
  resolveMatchThreshold: async () => mockThreshold,
  isAiRerankEnabled: async () => mockAiOn,
}));

// The Mongo-backed verdict store, in memory: same contract, no database.
const mockVerdicts = new Map<string, number>();
jest.mock("@/lib/matching/jevVerdictStore", () => ({
  mongoJevVerdictStore: {
    get: async (input: unknown) => mockVerdicts.get(JSON.stringify(input)) ?? null,
    set: async (input: unknown, fit: number) => void mockVerdicts.set(JSON.stringify(input), fit),
  },
}));

jest.mock("@/lib/matching/skillVectors", () => ({
  prepareSkillVectors: async () => new Map(),
}));

import { IRRELEVANT_SORT_PENALTY } from "@/lib/jobRecommendations";
import { recommendJobsFor, toCandidateJob } from "@/lib/matching/recommend";
import { mongoJevVerdictStore } from "@/lib/matching/jevVerdictStore";
import { scoreOnePair, scoreSeekerPool, storedBreakdown } from "@/lib/matching/seekerMatches";

function seeker(overrides: Partial<SeekerProfile> = {}): SeekerProfile {
  return {
    skills: ["React", "Node.js"],
    location: "",
    locations: ["india"],
    experienceYears: 3,
    experienceKnown: true,
    salaryExpectation: 0,
    salaryCurrency: "",
    jobType: "any",
    preferredRoles: ["react developer"],
    educationLevel: 0,
    city: "",
    cities: [],
    cvText: "",
    roleHistory: [],
    ...overrides,
  };
}

function job(id: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    _id: id,
    title: "React Developer",
    location: { country: "India", isRemote: false },
    requirements: { skills: ["React", "Node.js"], experienceMin: 0, experienceMax: 10 },
    employerId: { companyName: "Acme" },
    ...overrides,
  };
}

const strong = () => job("strong");
const weak = () =>
  job("weak", {
    title: "Accountant",
    requirements: { skills: ["Tally", "GST filing"], experienceMin: 0, experienceMax: 10 },
  });
/** Word for word the strong job, filed in a country the seeker never chose. */
const gated = () => job("gated", { location: { country: "Oman", isRemote: false } });

const byId = <T extends Record<string, unknown>>(jobs: T[], id: string) => jobs.find((j) => j._id === id)!;

beforeEach(() => {
  mockThreshold = 80;
  mockAiOn = true;
  mockVerdicts.clear();
  mockDecide.mockReset();
  mockDecide.mockResolvedValue({ answers: { genuine_fit: { type: "noul", noul: 0.9 } } });
});

describe("what counts as recommended", () => {
  it("recommends only eligible jobs at or above the threshold, and lists them first", async () => {
    const pool = await scoreSeekerPool(seeker(), [weak(), gated(), strong()]);
    expect(pool.jobs[0]._id).toBe("strong");
    expect(byId(pool.jobs, "strong")).toMatchObject({ eligible: true, recommended: true });
    expect(byId(pool.jobs, "gated")).toMatchObject({ eligible: false, recommended: false });
    expect(byId(pool.jobs, "weak")).toMatchObject({ eligible: true, recommended: false });
    expect(pool.recommendedCount).toBe(1);
    expect(pool.eligibleCount).toBe(2);
    expect(pool.threshold).toBe(80);
    expect(pool.limitingFactor).toBeUndefined();
  });

  it("follows the admin threshold rather than a number of its own", async () => {
    mockThreshold = 10;
    const pool = await scoreSeekerPool(seeker(), [weak(), strong()]);
    expect(byId(pool.jobs, "weak").recommended).toBe(true);
    expect(pool.threshold).toBe(10);
  });

  it("puts every recommended job ahead of a gated one, even where the penalty alone would not", async () => {
    // At a threshold of 10 the weak job is recommended on ~15 points, while the
    // gated job still sorts at ~80 after its penalty.
    mockThreshold = 10;
    const pool = await scoreSeekerPool(seeker(), [gated(), weak(), strong()]);
    expect(pool.jobs.map((j) => j._id)).toEqual(["strong", "weak", "gated"]);
  });
});

describe("a job that fails a gate", () => {
  it("keeps its percentage and only loses sort position", async () => {
    const pool = await scoreSeekerPool(seeker(), [gated(), strong()]);
    const g = byId(pool.jobs, "gated");
    expect(g.matchScore).toBe(byId(pool.jobs, "strong").matchScore);
    expect(g.sortScore).toBe(Math.max(0, g.matchScore - IRRELEVANT_SORT_PENALTY));
  });

  it("never sorts below zero", async () => {
    const pool = await scoreSeekerPool(seeker({ skills: [], preferredRoles: [] }), [
      job("far", { location: { country: "Oman", isRemote: false }, title: "Accountant" }),
    ]);
    expect(pool.jobs[0].sortScore).toBeGreaterThanOrEqual(0);
  });
});

describe("an empty recommendation list says why", () => {
  it("names the score when eligible jobs exist but none are strong enough", async () => {
    const pool = await scoreSeekerPool(seeker(), [weak()]);
    expect(pool.recommendedCount).toBe(0);
    expect(pool.limitingFactor).toBe("score");
    expect(pool.bestScore).toBe(pool.jobs[0].matchScore);
  });

  it("names the gate when it removed everything", async () => {
    const pool = await scoreSeekerPool(seeker(), [gated()]);
    expect(pool.limitingFactor).toBe("country");
    // Only eligible jobs count towards the closest match the page quotes.
    expect(pool.bestScore).toBe(0);
  });

  it("recommends nothing without a known country, but still scores the browse list", async () => {
    const pool = await scoreSeekerPool(seeker({ locations: [], locationSource: "none" }), [strong()]);
    expect(pool.recommendedCount).toBe(0);
    expect(pool.jobs[0].recommended).toBe(false);
    expect(pool.jobs[0].matchScore).toBeGreaterThan(0);
    expect(pool.limitingFactor).toBe("no_location");
  });

  it("points at the profile when the seeker has listed no skills", async () => {
    const pool = await scoreSeekerPool(seeker({ skills: [] }), [strong()]);
    expect(pool.limitingFactor).toBe("no_skills");
  });
});

describe("a page and the email agree", () => {
  it("scores a pair exactly as the digest does, and pays Jev once for both", async () => {
    const pool = await scoreSeekerPool(seeker(), [strong()]);
    const email = await recommendJobsFor(seeker(), [toCandidateJob(strong())], {
      threshold: 80,
      useAi: true,
      verdicts: mongoJevVerdictStore,
    });
    expect(email.jobs[0].score).toBe(pool.jobs[0].matchScore);
    expect(mockDecide).toHaveBeenCalledTimes(1);
  });

  it("gives an applicant the same number as the seeker's own list", async () => {
    const pool = await scoreSeekerPool(seeker(), [strong()]);
    const pair = await scoreOnePair(seeker(), strong());
    expect(pair.score).toBe(pool.jobs[0].matchScore);
  });

  it("leaves Jev out when the admin has switched AI re-ranking off", async () => {
    mockAiOn = false;
    await scoreSeekerPool(seeker(), [strong()]);
    expect(mockDecide).not.toHaveBeenCalled();
  });
});

describe("storedBreakdown", () => {
  it("stores the engine's parts, with overall equal to the score shown", async () => {
    const pair = await scoreOnePair(seeker(), strong());
    const stored = storedBreakdown(pair);
    expect(Object.keys(stored).sort()).toEqual(["experience", "overall", "role", "skills"]);
    expect(stored.overall).toBe(pair.score);
  });
});
