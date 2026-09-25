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
// The engine seam. The worker stores the employer's ATS score built from the
// engine's parts (lib/matching/applicantScore.ts) and keeps the engine's own
// number as the seeker's. The job below weights skills alone, so the ATS
// score here is the skills part — `score` — and each workflow test can set it.
const mockScoreOnePair = jest.fn(async () => ({
  eligible: true,
  score,
  breakdown: {
    overall: score - 2,
    skills: score,
    role: 20,
    experience: 90,
    matchedSkills: [],
    missingSkills: [],
    skillsUnknown: false,
    requiredCoverage: null,
    requiredMatched: [],
    requiredMissing: [],
    preferredCoverage: null,
  },
}));
const SKILLS_ONLY = { skills: 100, experience: 0, education: 0, industryExperience: 0, preferredQualifications: 0 };
jest.mock("@/lib/matching/seekerMatches", () => ({
  scoreOnePair: (...args: unknown[]) => mockScoreOnePair(...(args as [])),
  storedBreakdown: jest.requireActual("@/lib/matching/seekerMatches").storedBreakdown,
}));
jest.mock("@/lib/effectiveSeekerProfile", () => ({
  effectiveSeekerProfile: async (_userId: string, doc: unknown) => doc,
}));
// Which CV the application is scored on (lib/cv/cvDocuments.ts has its own tests).
const mockApplicantCvFor = jest.fn(async (..._a: unknown[]): Promise<unknown> => ({ state: "none" }));
jest.mock("@/lib/cv/cvDocuments", () => ({ applicantCvFor: (...a: unknown[]) => mockApplicantCvFor(...a) }));

let application: Record<string, unknown> & { status: string; statusHistory: unknown[]; save: jest.Mock };
let jobWorkflow: unknown;
let employerWorkflow: unknown;
let jobRequirements: Record<string, unknown>;
// The worker scores whatever effectiveSeekerProfile returns (mocked to pass the
// doc through), so tests shape the profile directly.
let seekerDoc: Record<string, unknown>;

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
      chain({ _id: JOB_ID, title: "Accountant", employerId: EMPLOYER_ID, requirements: jobRequirements, workflow: jobWorkflow, matchingWeights: SKILLS_ONLY })),
  },
}));
jest.mock("@/models/JobSeeker", () => ({
  __esModule: true,
  default: { findById: jest.fn(() => chain(seekerDoc)) },
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
    jobRequirements = { skills: ["Tally"] };
    seekerDoc = { _id: "seeker", skills: ["Tally"], totalExperienceYears: 3, experienceYears: 3, experienceKnown: true };
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

  it("scores on the CV the application was sent with, and says so in the checklist", async () => {
    const documents = [{ name: "CV", url: "https://cdn/cvs/sent.pdf", type: "resume" }];
    application.documents = documents;
    seekerDoc.cv = { originalUrl: "https://cdn/cvs/newer.pdf" };
    mockApplicantCvFor.mockResolvedValueOnce({ state: "read", fileName: "sent.pdf", text: "", parsed: null });
    await runWorker();
    expect(mockApplicantCvFor).toHaveBeenCalledWith({
      jobSeekerId: "seeker",
      documents,
      profileCvUrl: "https://cdn/cvs/newer.pdf",
    });
    expect(application.qualifications).toEqual(
      expect.arrayContaining([{ key: "cv", status: "met", hard: false, actual: "read", label: "sent.pdf" }]),
    );
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

  it("stores the ATS score and its parts, and the engine's number as the seeker's", async () => {
    score = 72;
    await runWorker();
    expect(application.aiMatchScore).toBe(72);
    expect(application.seekerMatchScore).toBe(72);
    expect(application.scoredVia).toBe("engine");
    // overall is the final score — so the badge and the breakdown header always
    // agree. Experience is the employer's reading of 3 years against 0–30.
    expect(application.matchBreakdown).toEqual({ skills: 72, role: 20, experience: 100, overall: 72 });
    expect(application.weightsApplied).toBe(true);
  });

  it("scores the profile it was given with every engine field loaded", async () => {
    const JobSeeker = (await import("@/models/JobSeeker")).default as unknown as { findById: jest.Mock };
    await runWorker();
    const select = JobSeeker.findById.mock.results.at(-1)!.value.select as jest.Mock;
    const fields = String(select.mock.calls[0][0]);
    // The old select left these out, so role fit always scored zero here.
    for (const field of ["preferredRoles", "preferredJobType", "workStatus", "cv.rawText"]) {
      expect(fields).toContain(field);
    }
  });

  it("skips an application that is already scored", async () => {
    application.scoredAt = new Date();
    const result = await runWorker();
    expect(result).toEqual({ skipped: true, reason: "already scored" });
    expect(application.save).not.toHaveBeenCalled();
  });

  it("still builds the checklist for an auto-applied row that arrived with a score", async () => {
    // Auto-apply stores the engine score at creation; the checklist and the
    // skills lists only exist once this worker has run.
    application.aiMatchScore = 77;
    score = 77;
    const result = await runWorker();
    expect(result).toMatchObject({ scored: true });
    expect(application.scoredAt).toBeInstanceOf(Date);
    expect(application.requirementsStatus).toBeDefined();
  });

  it("stores the requirements checklist beside the score", async () => {
    jobRequirements = { skills: ["Tally"], experienceMin: 5, experienceMax: 8 };
    seekerDoc = { _id: "seeker", skills: ["Tally"], experienceKnown: true, experienceYears: 1 };
    await runWorker();
    expect(application.requirementsStatus).toBe("not_met");
    expect(application.qualifications).toEqual(
      expect.arrayContaining([expect.objectContaining({ key: "experience", status: "not_met", hard: true })]),
    );
    expect(application.seekerMatchScore).toBe(30);
  });
});
