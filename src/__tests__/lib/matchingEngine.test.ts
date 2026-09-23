/**
 * One matching engine, every surface.
 *
 * The app and the employer view used to run an older scorer — different
 * weights, lexical skills only, no hard gates, no Jev, no floor — while the
 * emails ran this pipeline. One seeker/job pair could read one percentage in an
 * email and another on the home page. These tests pin the properties that make
 * a percentage mean the same thing everywhere:
 *
 *   - `scorePair` and `recommendJobsFor` return the same number for a pair;
 *   - whether Jev is consulted depends on the pair's own score, never on where
 *     the job sits in a list;
 *   - a Jev verdict is stored against its exact input and reused, so the same
 *     pair reads the same number on every surface and is paid for once.
 */
import type { SeekerProfile } from "@/lib/matchScore";
import {
  recommendJobsFor,
  scorePair,
  toCandidateJob,
  type JevVerdictStore,
} from "@/lib/matching/recommend";

const mockDecide = jest.fn();
jest.mock("@/lib/ai/jev", () => ({
  ...jest.requireActual("@/lib/ai/jev"),
  hasJev: () => true,
  decide: (...args: unknown[]) => mockDecide(...args),
}));

function seeker(overrides: Partial<SeekerProfile> = {}): SeekerProfile {
  return {
    skills: [],
    location: "",
    locations: [],
    experienceYears: 0,
    experienceKnown: false,
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

const applicant = () =>
  seeker({
    skills: ["React", "Node.js"],
    locations: ["india"],
    preferredRoles: ["react developer"],
    experienceKnown: true,
    experienceYears: 3,
  });

function job(id: string, overrides: Record<string, unknown> = {}) {
  return toCandidateJob({
    _id: id,
    title: "React Developer",
    location: { country: "India", isRemote: false },
    requirements: { skills: ["React", "Node.js"], experienceMin: 0, experienceMax: 10 },
    employerId: { companyName: "Acme" },
    ...overrides,
  });
}

/** An in-memory store that records what it was asked, for the cache tests. */
function memoryStore(): JevVerdictStore & { size: () => number } {
  const map = new Map<string, number>();
  const k = (input: unknown) => JSON.stringify(input);
  return {
    async get(input) {
      return map.has(k(input)) ? (map.get(k(input)) as number) : null;
    },
    async set(input, fit) {
      map.set(k(input), fit);
    },
    size: () => map.size,
  };
}

beforeEach(() => {
  mockDecide.mockReset();
  mockDecide.mockResolvedValue({ answers: { genuine_fit: { type: "noul", noul: 0.9 } } });
});

describe("scorePair agrees with recommendJobsFor", () => {
  it("gives a pair the same number on both paths", async () => {
    const store = memoryStore();
    const list = await recommendJobsFor(applicant(), [job("j1")], {
      threshold: 80,
      useAi: true,
      verdicts: store,
    });
    const single = await scorePair(applicant(), job("j1"), {
      threshold: 80,
      useAi: true,
      verdicts: store,
    });
    expect(list.jobs[0].score).toBe(single.score);
    expect(single.eligible).toBe(true);
  });

  it("still scores an ineligible pair, and says which gate it failed", async () => {
    // An employer looking at someone who applied anyway wants to know how
    // close they came; recommendation surfaces are the ones that drop it.
    const r = await scorePair(seeker({ ...applicant(), locations: ["oman"] }), job("j1"), {
      threshold: 80,
      useAi: false,
    });
    expect(r.eligible).toBe(false);
    expect(r.reason).toBe("country");
    expect(r.score).toBeGreaterThan(0);
  });
});

describe("the Jev band is a property of the pair, not of the list", () => {
  it("does not pay for a verdict below threshold − 10, where Jev cannot reach the bar", async () => {
    // A job with none of the seeker's skills scores far below 70.
    const weak = job("weak", {
      title: "Accountant",
      requirements: { skills: ["Tally", "GST filing"], experienceMin: 0, experienceMax: 10 },
    });
    const r = await scorePair(applicant(), weak, { threshold: 80, useAi: true });
    expect(r.score).toBeLessThan(70);
    expect(mockDecide).not.toHaveBeenCalled();
    expect(r.aiConfidence).toBeUndefined();
  });

  it("consults Jev for every job in the band, however long the list", async () => {
    // The old rule sent only the top ten of whatever list it was given, so the
    // eleventh job was adjusted on one surface and not on another.
    const fifteen = Array.from({ length: 15 }, (_, i) => job(`j${i}`));
    const r = await recommendJobsFor(applicant(), fifteen, { threshold: 80, limit: 5, useAi: true });
    expect(r.considered).toBe(15);
    expect(mockDecide).toHaveBeenCalledTimes(15);
  });

  it("is identical whether the job is alone or one of many", async () => {
    const store = memoryStore();
    const alone = await recommendJobsFor(applicant(), [job("target")], {
      threshold: 80,
      useAi: true,
      verdicts: store,
    });
    const crowded = await recommendJobsFor(
      applicant(),
      [...Array.from({ length: 12 }, (_, i) => job(`other${i}`)), job("target")],
      { threshold: 80, limit: 20, useAi: true, verdicts: store },
    );
    const inCrowd = crowded.jobs.find((j) => j.id === "target");
    expect(inCrowd?.score).toBe(alone.jobs[0].score);
  });
});

describe("Jev verdicts are stored and reused", () => {
  it("pays for a pair once, then reads the stored verdict", async () => {
    const store = memoryStore();
    await scorePair(applicant(), job("j1"), { threshold: 80, useAi: true, verdicts: store });
    await scorePair(applicant(), job("j1"), { threshold: 80, useAi: true, verdicts: store });
    await recommendJobsFor(applicant(), [job("j1")], { threshold: 80, useAi: true, verdicts: store });
    expect(mockDecide).toHaveBeenCalledTimes(1);
    expect(store.size()).toBe(1);
  });

  it("asks again when the seeker's profile changes", async () => {
    const store = memoryStore();
    await scorePair(applicant(), job("j1"), { threshold: 80, useAi: true, verdicts: store });
    await scorePair(
      seeker({ ...applicant(), skills: ["React", "Node.js", "TypeScript"] }),
      job("j1"),
      { threshold: 80, useAi: true, verdicts: store },
    );
    expect(mockDecide).toHaveBeenCalledTimes(2);
  });

  it("serves the stored verdict even if Jev would now answer differently", async () => {
    // Stability is the point: the email and the page must not disagree
    // because Jev was asked twice.
    const store = memoryStore();
    const first = await scorePair(applicant(), job("j1"), { threshold: 80, useAi: true, verdicts: store });
    mockDecide.mockResolvedValue({ answers: { genuine_fit: { type: "noul", noul: 0 } } });
    const second = await scorePair(applicant(), job("j1"), { threshold: 80, useAi: true, verdicts: store });
    expect(second.score).toBe(first.score);
  });

  it("keeps scoring when the store itself fails", async () => {
    const broken: JevVerdictStore = {
      get: async () => {
        throw new Error("db down");
      },
      set: async () => {
        throw new Error("db down");
      },
    };
    const r = await scorePair(applicant(), job("j1"), { threshold: 80, useAi: true, verdicts: broken });
    expect(r.aiConfidence).toBe(0.9);
    expect(mockDecide).toHaveBeenCalledTimes(1);
  });
});

describe("Jev still advises rather than decides", () => {
  it("moves a single pair by at most 10 points on either side", async () => {
    const base = await scorePair(applicant(), job("j1"), { threshold: 80, useAi: false });
    mockDecide.mockResolvedValue({ answers: { genuine_fit: { type: "noul", noul: 1 } } });
    const up = await scorePair(applicant(), job("j1"), { threshold: 80, useAi: true });
    mockDecide.mockResolvedValue({ answers: { genuine_fit: { type: "noul", noul: 0 } } });
    const down = await scorePair(applicant(), job("j1"), { threshold: 80, useAi: true });
    expect(up.score - base.score).toBeLessThanOrEqual(10);
    expect(base.score - down.score).toBeLessThanOrEqual(10);
  });
});
