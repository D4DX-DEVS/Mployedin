/**
 * @jest-environment node
 *
 * Cached-only Jev mode: a page render never waits on Jev, and the verdict
 * reads for a whole pool collapse into one batched lookup.
 */
import type { SeekerProfile } from "@/lib/matchScore";

const mockDecide = jest.fn();
jest.mock("@/lib/ai/jev", () => ({
  ...jest.requireActual("@/lib/ai/jev"),
  hasJev: () => true,
  decide: (...args: unknown[]) => mockDecide(...args),
}));

jest.mock("@/models/SystemConfig", () => ({
  resolveMatchThreshold: async () => 80,
  isAiRerankEnabled: async () => true,
}));

const mockVerdicts = new Map<string, number>();
const mockGetMany = jest.fn(async (inputs: unknown[]) => inputs.map((i) => mockVerdicts.get(JSON.stringify(i)) ?? null));
const mockGet = jest.fn(async (input: unknown) => mockVerdicts.get(JSON.stringify(input)) ?? null);
jest.mock("@/lib/matching/jevVerdictStore", () => ({
  mongoJevVerdictStore: {
    get: (input: unknown) => mockGet(input),
    getMany: (inputs: unknown[]) => mockGetMany(inputs),
    set: async (input: unknown, fit: number) => void mockVerdicts.set(JSON.stringify(input), fit),
  },
}));

const mockQueue = jest.fn(async (_request: unknown) => undefined);
jest.mock("@/lib/matching/jevFillQueue", () => ({
  JEV_FILL_MAX_JOBS: 25,
  queueJevFill: (request: unknown) => mockQueue(request),
}));

jest.mock("@/lib/matching/skillVectors", () => ({
  prepareSkillVectors: async () => new Map(),
}));

import { jevVerdictInput, toCandidateJob, scorePair } from "@/lib/matching/recommend";
import { mongoJevVerdictStore } from "@/lib/matching/jevVerdictStore";

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
/** Shares nothing with the seeker: far below Jev's band. */
const weak = () =>
  job("weak", {
    title: "Pastry Chef",
    requirements: { skills: ["Baking", "Icing"], experienceMin: 0, experienceMax: 10 },
  });
/** Word for word the strong job, filed in a country the seeker never chose. */
const gated = () => job("gated", { location: { country: "Oman", isRemote: false } });

beforeEach(() => {
  mockVerdicts.clear();
  mockDecide.mockReset();
  mockDecide.mockResolvedValue({ answers: { genuine_fit: { type: "noul", noul: 0.9 } } });
  mockGet.mockClear();
  mockGetMany.mockClear();
  mockQueue.mockClear();
});

describe("cached Jev mode", () => {
  const opts = { threshold: 80, useAi: true, verdicts: mongoJevVerdictStore, jevMode: "cached" as const };

  it("never asks Jev; a miss keeps the deterministic score and marks the eligible pair pending", async () => {
    const pair = await scorePair(seeker(), toCandidateJob(strong()), opts);
    expect(mockDecide).not.toHaveBeenCalled();
    expect(pair.score).toBe(pair.breakdown.overall);
    expect(pair.jevPending).toBe(true);
  });

  it("uses a stored verdict exactly as live mode would", async () => {
    const live = await scorePair(seeker(), toCandidateJob(strong()), { ...opts, jevMode: "live" });
    mockDecide.mockClear();
    const cached = await scorePair(seeker(), toCandidateJob(strong()), opts);
    expect(mockDecide).not.toHaveBeenCalled();
    expect(cached.score).toBe(live.score);
    expect(cached.jevPending).toBeUndefined();
  });

  it("never marks an ineligible pair pending", async () => {
    const pair = await scorePair(seeker(), toCandidateJob(gated()), opts);
    expect(pair.eligible).toBe(false);
    expect(pair.jevPending).toBeUndefined();
  });

  it("keeps the cache key stored verdicts were written under", () => {
    const input = jevVerdictInput(seeker(), toCandidateJob(strong()));
    expect(Object.keys(input).sort()).toEqual(["model", "questions", "state"]);
    expect(Object.keys(input.state).sort()).toEqual(["candidate", "job"]);
  });
});

describe("batchVerdictReads", () => {
  it("answers many get() calls made in one tick with a single getMany", async () => {
    const { batchVerdictReads } = await import("@/lib/matching/batchVerdictReads");
    mockVerdicts.set(JSON.stringify("a"), 0.5);
    const store = batchVerdictReads(mongoJevVerdictStore as never);
    const [a, b] = await Promise.all([store.get("a"), store.get("b")]);
    expect([a, b]).toEqual([0.5, null]);
    expect(mockGetMany).toHaveBeenCalledTimes(1);
    expect(mockGet).not.toHaveBeenCalled();
  });
});

import { fillJevVerdicts, jevFillRequest } from "@/lib/matching/recommend";
import { scoreSeekerPool } from "@/lib/matching/seekerMatches";

describe("background fill", () => {
  it("stores verdicts under the keys a cached render reads next", async () => {
    const candidate = toCandidateJob(strong());
    const first = await scorePair(seeker(), candidate, { threshold: 80, useAi: true, verdicts: mongoJevVerdictStore, jevMode: "cached" });
    expect(first.jevPending).toBe(true);

    const result = await fillJevVerdicts(jevFillRequest(seeker(), [candidate]), mongoJevVerdictStore);
    expect(result).toEqual({ asked: 1, stored: 1 });

    mockDecide.mockClear();
    const next = await scorePair(seeker(), candidate, { threshold: 80, useAi: true, verdicts: mongoJevVerdictStore, jevMode: "cached" });
    expect(mockDecide).not.toHaveBeenCalled();
    expect(next.jevPending).toBeUndefined();
    expect(next.aiConfidence).toBe(0.9);
  });

  it("skips a pair filled meanwhile", async () => {
    const candidate = toCandidateJob(strong());
    await fillJevVerdicts(jevFillRequest(seeker(), [candidate]), mongoJevVerdictStore);
    mockDecide.mockClear();
    const again = await fillJevVerdicts(jevFillRequest(seeker(), [candidate]), mongoJevVerdictStore);
    expect(again).toEqual({ asked: 1, stored: 0 });
    expect(mockDecide).not.toHaveBeenCalled();
  });
});

describe("scoreSeekerPool in cached mode", () => {
  it("queues one fill for the eligible misses and never calls Jev", async () => {
    await scoreSeekerPool(seeker(), [strong(), gated(), weak()], undefined, { jevMode: "cached" });
    expect(mockDecide).not.toHaveBeenCalled();
    expect(mockQueue).toHaveBeenCalledTimes(1);
    const request = mockQueue.mock.calls[0][0] as { jobs: Array<{ id: string }> };
    expect(request.jobs.map((j) => j.id)).toEqual(["strong"]);
  });

  it("queues nothing when every verdict is stored", async () => {
    await fillJevVerdicts(jevFillRequest(seeker(), [toCandidateJob(strong())]), mongoJevVerdictStore);
    await scoreSeekerPool(seeker(), [strong()], undefined, { jevMode: "cached" });
    expect(mockQueue).not.toHaveBeenCalled();
  });

  it("reads the whole pool's verdicts in one batch", async () => {
    await scoreSeekerPool(seeker(), [strong(), job("strong2")], undefined, { jevMode: "cached" });
    expect(mockGetMany).toHaveBeenCalledTimes(1);
    expect(mockGet).not.toHaveBeenCalled();
  });
});
