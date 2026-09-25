/**
 * @jest-environment node
 *
 * Auto-apply acts in the seeker's name, so it may only apply where the engine
 * would recommend: eligible on every hard gate and at or above the admin
 * threshold. It used to apply at 60 on the older scorer with no gates, and its
 * country filter overwrote the expiry filter — so expired jobs, and jobs in
 * countries the seeker never chose, were both fair game.
 */
export {};

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/logger", () => ({ __esModule: true, default: { error: jest.fn(), info: jest.fn(), warn: jest.fn() } }));
const mockInngestSend = jest.fn().mockResolvedValue(undefined);
jest.mock("@/lib/inngest/client", () => ({
  inngest: {
    createFunction: (config: unknown, handler: unknown) => ({ config, handler }),
    send: (...args: unknown[]) => mockInngestSend(...args),
  },
}));
jest.mock("@/lib/behaviorSignals", () => ({ computeBehaviorSignals: () => ({ signals: {}, score: 0 }) }));

jest.mock("@/models/SystemConfig", () => ({
  resolveMatchThreshold: async () => 80,
  isAiRerankEnabled: async () => false,
}));
jest.mock("@/lib/matching/jevVerdictStore", () => ({
  mongoJevVerdictStore: { get: async () => null, set: async () => undefined },
}));
jest.mock("@/lib/matching/skillVectors", () => ({ prepareSkillVectors: async () => new Map() }));
jest.mock("@/lib/effectiveSeekerProfile", () => ({
  effectiveSeekerProfile: async (_userId: string, doc: unknown) =>
    jest.requireActual("@/lib/matchScore").seekerProfileFromDoc(doc),
}));

function chain<T>(result: T) {
  const c: Record<string, jest.Mock> = {};
  for (const m of ["select", "populate", "sort", "limit", "skip"]) c[m] = jest.fn(() => c);
  c.lean = jest.fn(async () => result);
  c.then = jest.fn((resolve: (v: T) => unknown) => Promise.resolve(result).then(resolve));
  return c;
}

let seekerDoc: Record<string, unknown>;
let jobs: Array<Record<string, unknown>>;
const mockJobFind = jest.fn();
const mockCreate = jest.fn();

jest.mock("@/models/JobSeeker", () => ({
  __esModule: true,
  default: { findOne: jest.fn(() => chain(seekerDoc)), updateOne: jest.fn(async () => ({})) },
}));
jest.mock("@/models/Job", () => ({
  __esModule: true,
  default: { find: (query: unknown) => mockJobFind(query) },
}));
jest.mock("@/models/Application", () => ({
  __esModule: true,
  default: {
    find: jest.fn(() => chain([])),
    findOne: jest.fn(() => chain(null)),
    create: (doc: unknown) => mockCreate(doc),
  },
}));
jest.mock("@/models/Employer", () => ({
  __esModule: true,
  default: { findById: jest.fn(() => chain({ companyName: "Acme" })) },
}));
jest.mock("@/models/ActivityEvent", () => ({
  ActivityEvent: { create: jest.fn(async () => ({})) },
  ACTIVITY_PRIORITY: { application_update: 1 },
}));

function job(id: string, overrides: Record<string, unknown> = {}) {
  return {
    _id: id,
    title: "React Developer",
    employerId: "emp1",
    location: { country: "India", isRemote: false },
    requirements: { skills: ["React", "Node.js"], experienceMin: 0, experienceMax: 10 },
    status: "active",
    ...overrides,
  };
}

async function run() {
  const mod = await import("@/lib/inngest/autoApply");
  const fn = mod.autoApplyFunction as unknown as { handler: (args: unknown) => Promise<unknown> };
  return fn.handler({
    event: { data: { userId: "u1" } },
    // Like Inngest: a step's result is JSON, not the live object.
    step: { run: async (_name: string, cb: () => Promise<unknown>) => JSON.parse(JSON.stringify((await cb()) ?? null)) },
  });
}

beforeEach(() => {
  mockCreate.mockReset();
  mockCreate.mockImplementation(async (doc: Record<string, unknown>) => ({ _id: `app-${String(doc.jobId)}` }));
  seekerDoc = {
    _id: "s1",
    userId: "u1",
    applicationMode: "auto",
    autoApplyCount: 0,
    autoApplyResetAt: new Date(),
    skills: ["React", "Node.js"],
    preferredCountries: ["India"],
    preferredRoles: ["React Developer"],
    totalExperienceYears: 3,
  };
  jobs = [
    job("strong"),
    job("abroad", { location: { country: "Oman", isRemote: false } }),
    job("weak", { title: "Accountant", requirements: { skills: ["Tally"], experienceMin: 0, experienceMax: 10 } }),
  ];
  mockJobFind.mockReset();
  mockJobFind.mockImplementation(() => chain(jobs));
});

describe("autoApply", () => {
  it("applies only where the engine would recommend", async () => {
    const result = await run();
    expect(result).toEqual({ applied: 1 });
    expect(mockCreate).toHaveBeenCalledTimes(1);
    const created = mockCreate.mock.calls[0][0] as Record<string, unknown>;
    expect(created.jobId).toBe("strong");
    expect(created.aiMatchScore).toBeGreaterThanOrEqual(80);
    expect(created.scoredVia).toBe("engine");
    expect(created.matchBreakdown).toMatchObject({ overall: created.aiMatchScore });
    expect(created.seekerMatchScore).toBe(created.aiMatchScore);
    // The employer's checklist comes from the screening worker, as for any application.
    expect(mockInngestSend).toHaveBeenCalledWith(expect.objectContaining({ name: "application/ai-screen" }));
  });

  it("keeps the expiry filter when it adds the country filter", async () => {
    await run();
    const query = mockJobFind.mock.calls[0][0] as { $and?: Array<Record<string, unknown>>; $or?: unknown };
    // The old code assigned the country clause to $or, replacing the expiry one.
    expect(query.$or).toBeUndefined();
    expect(query.$and).toContainEqual({ $or: [{ expiresAt: null }, { expiresAt: { $gte: expect.any(Date) } }] });
    expect(JSON.stringify(query.$and)).toContain("location.country");
  });

  it("does not apply for a seeker whose best job is below the threshold", async () => {
    jobs = [jobs[2]];
    const result = await run();
    expect(result).toEqual({ skipped: "no eligible jobs" });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("stops at the daily limit", async () => {
    seekerDoc.autoApplyCount = 4;
    jobs = [job("a"), job("b"), job("c")];
    const result = await run();
    expect(result).toEqual({ applied: 1 });
  });

  it("does nothing unless the seeker turned auto-apply on", async () => {
    seekerDoc.applicationMode = "manual";
    expect(await run()).toEqual({ skipped: "auto-apply disabled" });
    expect(mockJobFind).not.toHaveBeenCalled();
  });
});
