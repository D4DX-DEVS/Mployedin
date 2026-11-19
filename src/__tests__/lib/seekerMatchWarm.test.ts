/**
 * @jest-environment node
 *
 * A new seeker saw a job at 100% on first load, then 97% or 92% on refresh:
 * the page shows the deterministic score until the background Jev verdict is
 * stored, and every profile save changes the verdict key. The warm-up scores
 * the feed right after a save, so the first home view already reads the final
 * number.
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
jest.mock("@/lib/matching/jevVerdictStore", () => {
  const { verdictKey } = jest.requireActual("@/lib/matching/jevVerdictStore");
  return {
    mongoJevVerdictStore: {
      get: async (i: unknown) => mockVerdicts.get(verdictKey(i)) ?? null,
      getMany: async (is: unknown[]) => is.map((i) => mockVerdicts.get(verdictKey(i)) ?? null),
      set: async (i: unknown, fit: number) => void mockVerdicts.set(verdictKey(i), fit),
    },
  };
});
jest.mock("@/models/JevVerdict", () => ({}));
const mockFillQueue: unknown[] = [];
jest.mock("@/lib/matching/jevFillQueue", () => ({
  JEV_FILL_MAX_JOBS: 25,
  queueJevFill: async (r: unknown) => void mockFillQueue.push(r),
}));
jest.mock("@/lib/matching/skillVectors", () => ({ prepareSkillVectors: async () => new Map() }));
jest.mock("@/lib/db/mongoose", () => ({ connectDB: async () => undefined }));
const mockLoadPool = jest.fn();
jest.mock("@/lib/matching/seekerJobPool", () => ({
  loadSeekerJobPool: (...args: unknown[]) => mockLoadPool(...args),
}));
const mockSend = jest.fn();
jest.mock("@/lib/inngest/client", () => ({
  inngest: {
    send: (...args: unknown[]) => mockSend(...args),
    createFunction: (config: unknown, handler: unknown) => ({ config, handler }),
  },
}));

import { seekerMatchWarmFunction } from "@/lib/inngest/seekerMatchWarm";
import { queueSeekerMatchWarm, SEEKER_MATCH_WARM_EVENT } from "@/lib/matching/seekerMatchWarmQueue";
import { scoreSeekerPool } from "@/lib/matching/seekerMatches";
import { fillJevVerdicts, type JevFillRequest } from "@/lib/matching/recommend";
import { mongoJevVerdictStore } from "@/lib/matching/jevVerdictStore";

const seeker: SeekerProfile = {
  skills: ["React", "Node.js", "TypeScript"],
  location: "",
  locations: ["india"],
  experienceYears: 4,
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
};
const job = {
  _id: "job-1",
  title: "React Developer",
  location: { country: "India", isRemote: false },
  requirements: { skills: ["React", "Node.js", "TypeScript"], experienceMin: 0, experienceMax: 10 },
  employerId: { companyName: "Acme" },
};

const warm = seekerMatchWarmFunction as unknown as {
  config: { debounce: { key: string }; triggers: Array<{ event: string }> };
  handler: (ctx: { event: { data: { userId: string } }; step: { run: (n: string, f: () => unknown) => unknown } }) => Promise<unknown>;
};
const runWarm = (userId: string) =>
  warm.handler({ event: { data: { userId } }, step: { run: (_n, f) => f() } });

beforeEach(() => {
  mockVerdicts.clear();
  mockFillQueue.length = 0;
  mockDecide.mockReset();
  mockSend.mockReset();
  mockLoadPool.mockReset();
});

it("listens for the save event and debounces per user", () => {
  expect(warm.config.triggers).toEqual([{ event: SEEKER_MATCH_WARM_EVENT }]);
  expect(warm.config.debounce.key).toBe("event.data.userId");
});

it("without a warm-up the first view shows a score that changes on refresh (the bug)", async () => {
  const first = await scoreSeekerPool(seeker, [job], undefined, { jevMode: "cached" });
  mockDecide.mockResolvedValue({ answers: { genuine_fit: { type: "noul", noul: 0.92 } } });
  await fillJevVerdicts(mockFillQueue[0] as JevFillRequest, mongoJevVerdictStore, 1);
  const refresh = await scoreSeekerPool(seeker, [job], undefined, { jevMode: "cached" });
  expect(first.jobs[0].matchScore).toBe(100);
  expect(refresh.jobs[0].matchScore).toBe(97);
});

it("after a save's warm-up, the first home view already shows the final score", async () => {
  mockLoadPool.mockResolvedValue({ seekerProfile: seeker, candidateJobs: [job] });
  mockDecide.mockResolvedValue({ answers: { genuine_fit: { type: "noul", noul: 0.92 } } });

  await expect(runWarm("user-1")).resolves.toEqual({ scored: 1 });
  expect(mockLoadPool).toHaveBeenCalledWith("user-1");
  expect(mockFillQueue).toHaveLength(1);
  await fillJevVerdicts(mockFillQueue[0] as JevFillRequest, mongoJevVerdictStore, 1);

  mockFillQueue.length = 0;
  const firstView = await scoreSeekerPool(seeker, [job], undefined, { jevMode: "cached" });
  const refresh = await scoreSeekerPool(seeker, [job], undefined, { jevMode: "cached" });
  expect(firstView.jobs[0].matchScore).toBe(97);
  expect(refresh.jobs[0].matchScore).toBe(97);
  // Nothing left to fill: the page found every verdict.
  expect(mockFillQueue).toHaveLength(0);
});

it("does nothing for a user with no seeker profile", async () => {
  mockLoadPool.mockResolvedValue(null);
  await expect(runWarm("nobody")).resolves.toEqual({ scored: 0 });
  expect(mockFillQueue).toHaveLength(0);
});

it("queues the event for the user and never fails the save", async () => {
  mockSend.mockResolvedValueOnce(undefined);
  await queueSeekerMatchWarm("user-1");
  expect(mockSend).toHaveBeenCalledWith({ name: SEEKER_MATCH_WARM_EVENT, data: { userId: "user-1" } });

  mockSend.mockRejectedValueOnce(new Error("inngest down"));
  await expect(queueSeekerMatchWarm("user-1")).resolves.toBeUndefined();
});
