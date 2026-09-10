/**
 * @jest-environment node
 *
 * The screening worker is the ONLY place auto-reject may happen, and only
 * when the resolved hiring rules say so. Legacy documents (threshold stored,
 * no `autoRejectEnabled`) must never reject.
 */
export {};

const APP_ID = "64b000000000000000000030";
const JOB_ID = "64b000000000000000000010";
const EMPLOYER_ID = "64b000000000000000000002";

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/logger", () => ({ __esModule: true, default: { error: jest.fn(), info: jest.fn(), warn: jest.fn() } }));
jest.mock("@/lib/inngest/client", () => ({
  inngest: {
    // Capture the handler so the test can call it like Inngest would.
    createFunction: (config: unknown, handler: unknown) => ({ config, handler }),
    send: jest.fn().mockResolvedValue(undefined),
  },
}));
jest.mock("@/lib/ai/gemini", () => ({
  generateText: jest.fn().mockResolvedValue('{"strengths":["React"],"gaps":[],"summary":"ok"}'),
  GEMINI_MODELS: { flash: "flash" },
}));

let score = 30;
jest.mock("@/lib/matchScore", () => ({
  seekerProfileFromDoc: (d: unknown) => d,
  jobProfileFromDoc: (d: unknown) => d,
  calculateMatchDetail: jest.fn(() => ({ skills: score, experience: score, location: score, salary: score, overall: score })),
}));

let application: Record<string, unknown> & { status: string; statusHistory: unknown[]; save: jest.Mock };
let jobWorkflow: unknown;
let employerWorkflow: unknown;

function chain<T>(result: T) {
  const c: Record<string, jest.Mock> = {};
  for (const m of ["select", "populate", "sort", "limit"]) c[m] = jest.fn(() => c);
  c.lean = jest.fn(async () => result);
  return c;
}

jest.mock("@/models/Application", () => ({
  __esModule: true,
  default: { findById: jest.fn(async () => application) },
}));
jest.mock("@/models/Job", () => ({
  __esModule: true,
  default: {
    findById: jest.fn(() =>
      chain({ _id: JOB_ID, title: "Accountant", employerId: EMPLOYER_ID, requirements: { skills: ["Tally"] }, workflow: jobWorkflow })),
  },
}));
jest.mock("@/models/JobSeeker", () => ({
  __esModule: true,
  default: { findById: jest.fn(() => chain({ _id: "seeker", skills: ["Tally"], totalExperienceYears: 3 })) },
}));
jest.mock("@/models/Employer", () => ({
  __esModule: true,
  Employer: { findById: jest.fn(() => chain({ _id: EMPLOYER_ID, workflow: employerWorkflow })) },
  default: { findById: jest.fn(() => chain({ _id: EMPLOYER_ID, workflow: employerWorkflow })) },
}));

async function runWorker(eventData: Record<string, unknown> = {}) {
  const mod = await import("@/lib/inngest/aiScreenApplication");
  const fn = mod.aiScreenApplication as unknown as { handler: (args: unknown) => Promise<unknown> };
  return fn.handler({
    event: { data: { applicationId: APP_ID, ...eventData } },
    step: { run: (_name: string, cb: () => Promise<unknown>) => cb() },
  });
}

describe("aiScreenApplication worker", () => {
  beforeEach(() => {
    score = 30;
    jobWorkflow = undefined;
    employerWorkflow = undefined;
    application = {
      _id: APP_ID,
      jobId: JOB_ID,
      jobSeekerId: "seeker",
      status: "applied",
      statusHistory: [],
      aiMatchScore: undefined,
      save: jest.fn().mockResolvedValue(undefined),
    };
  });

  it("scores but never rejects when no rule is enabled (legacy threshold ignored)", async () => {
    jobWorkflow = { settings: { aiAutoScreen: true, autoRejectBelow: 40 } };
    employerWorkflow = { settings: { aiAutoScreen: true, autoRejectBelow: 40 } };
    const result = await runWorker();
    expect(application.aiMatchScore).toBe(30);
    expect(application.status).toBe("applied");
    expect(application.save).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ scored: true, autoRejected: false });
  });

  it("ignores a threshold smuggled in on the event payload", async () => {
    await runWorker({ autoRejectBelow: 90 });
    expect(application.status).toBe("applied");
  });

  it("rejects on arrival when the job rule is enabled and the score is below the threshold", async () => {
    jobWorkflow = { customizedAt: new Date(), settings: { autoRejectEnabled: true, autoRejectBelow: 40 } };
    const result = await runWorker();
    expect(application.status).toBe("rejected");
    expect(String(application.rejectionReason)).toContain("30");
    expect(application.statusHistory).toEqual([
      expect.objectContaining({ status: "rejected", note: "Auto-rejected by AI screening" }),
    ]);
    expect(result).toMatchObject({ autoRejected: true });
  });

  it("falls back to the employer rule when the job has none", async () => {
    employerWorkflow = { settings: { autoRejectEnabled: true, autoRejectBelow: 50 } };
    await runWorker();
    expect(application.status).toBe("rejected");
  });

  it("leaves a strong score alone even with the rule enabled", async () => {
    score = 85;
    jobWorkflow = { customizedAt: new Date(), settings: { autoRejectEnabled: true, autoRejectBelow: 40 } };
    await runWorker();
    expect(application.status).toBe("applied");
    expect(application.aiMatchScore).toBe(85);
  });

  it("ignores job-level settings that were never saved on purpose (no customizedAt)", async () => {
    // Mongoose used to persist default settings on every job; without the stamp they must not override.
    jobWorkflow = { settings: { autoRejectEnabled: true, autoRejectBelow: 40 } };
    await runWorker();
    expect(application.status).toBe("applied");
  });

  it("never overrides a status the employer already moved forward", async () => {
    application.status = "shortlisted";
    jobWorkflow = { customizedAt: new Date(), settings: { autoRejectEnabled: true, autoRejectBelow: 40 } };
    await runWorker();
    expect(application.status).toBe("shortlisted");
  });

  it("skips an application that is already scored", async () => {
    application.aiMatchScore = 77;
    const result = await runWorker();
    expect(result).toEqual({ skipped: true, reason: "already scored" });
    expect(application.save).not.toHaveBeenCalled();
  });
});
