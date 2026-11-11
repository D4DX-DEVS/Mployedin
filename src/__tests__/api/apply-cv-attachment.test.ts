/**
 * @jest-environment node
 *
 * Every way of applying attaches the seeker's CV by one rule
 * (lib/applications/cvChoice.ts) and stores it on the application:
 *  - auto-apply and the assistant used to attach none;
 *  - the "nothing chosen" paths attached every resume the seeker had;
 *  - a chosen CV that had gone was silently replaced by another;
 *  - the assistant skipped scoring and recorded the application's id, not the
 *    seeker's, in the job's applicant list.
 */
import { NextRequest } from "next/server";

const JOB = "650000000000000000000210";
const EMP = "650000000000000000000220";
const SEEKER = "650000000000000000000230";
const SEEKER_USER = "650000000000000000000231";

jest.mock("@/lib/auth/withAuth", () => ({
  withAuth:
    (h: (req: NextRequest, ctx: unknown, params?: Record<string, string>) => Promise<Response>) =>
    (req: NextRequest) =>
      h(req, { userId: SEEKER_USER, role: "job_seeker", locale: "en" }, { id: JOB }),
}));
jest.mock("@/lib/subscription/withSubscription", () => ({ withSubscription: (h: unknown) => h }));
jest.mock("@/lib/db/mongoose", () => {
  const connectDB = jest.fn().mockResolvedValue(undefined);
  return { __esModule: true, default: connectDB, connectDB };
});
jest.mock("@/lib/security/rateLimit", () => ({
  checkRateLimitDual: jest.fn(async () => ({ allowed: true, resetAt: 0 })),
  RATE_LIMIT_CONFIGS: { applications: {} },
}));
jest.mock("@/lib/audit/log", () => ({ logActivity: jest.fn(), actorFromCtx: jest.fn(() => ({})) }));
jest.mock("@/lib/logger", () => ({ __esModule: true, default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
const inngestSend = jest.fn().mockResolvedValue(undefined);
jest.mock("@/lib/inngest/client", () => ({ inngest: { send: (...a: unknown[]) => inngestSend(...a) } }));
jest.mock("@/lib/notifications/trigger", () => ({ notifyApplicationReceived: jest.fn().mockResolvedValue(undefined) }));

function chain<T>(result: T) {
  const c: Record<string, unknown> = {};
  c.select = () => c;
  c.populate = () => c;
  c.lean = async () => result;
  return c;
}

let job: Record<string, unknown>;
const jobUpdateOne = jest.fn().mockResolvedValue({});
jest.mock("@/models/Job", () => ({
  __esModule: true,
  default: { findOne: () => chain(job), findById: () => chain(job), updateOne: (...a: unknown[]) => jobUpdateOne(...a) },
}));
let seeker: Record<string, unknown>;
// The claim on each file (lib/cv/fileClaims.ts): matched unless the test
// removes the file "in another tab".
let removedUrls: string[];
const seekerUpdateOne = jest.fn(async (filter: Record<string, string>) => {
  const url = filter["documents.url"] ?? filter["cv.originalUrl"];
  return { matchedCount: removedUrls.includes(url) ? 0 : 1 };
});
jest.mock("@/models/JobSeeker", () => ({
  __esModule: true,
  default: { findOne: () => chain(seeker), updateOne: (filter: Record<string, string>) => seekerUpdateOne(filter) },
}));
jest.mock("@/models/User", () => ({ __esModule: true, default: { findById: () => chain({ name: "Sara" }) } }));
jest.mock("@/models/Employer", () => {
  const Employer = { findById: () => chain({ companyName: "Acme" }) };
  return { __esModule: true, default: Employer, Employer };
});
jest.mock("@/models/ActivityEvent", () => ({
  ActivityEvent: { create: jest.fn().mockResolvedValue({}) },
  ACTIVITY_PRIORITY: { application_update: 1 },
}));
const create = jest.fn(async (_doc: Record<string, unknown>) => ({ _id: "650000000000000000000240" }));
jest.mock("@/models/Application", () => ({
  __esModule: true,
  default: { findOne: () => chain(null), create: (doc: Record<string, unknown>) => create(doc) },
}));

const PROFILE_CV = "https://cdn/cvs/profile.pdf";
const older = { id: "d1", name: "Old.pdf", category: "resume", url: "https://cdn/documents/old.pdf" };
const newer = { id: "d2", name: "New.pdf", category: "resume", url: "https://cdn/documents/new.pdf" };
const built = { id: "b1", name: "Sara - Mployedin CV.pdf", category: "resume", url: "https://cdn/documents/built.pdf", builtHash: "aaaaaaaaaaaaaa" };

beforeEach(() => {
  jest.clearAllMocks();
  job = { _id: JOB, title: "Nurse", employerId: EMP, status: "active", screeningQuestions: [], applicantIds: [] };
  seeker = { _id: SEEKER, fullName: "Sara Ali", cv: { originalUrl: PROFILE_CV }, documents: [older, newer, built] };
  removedUrls = [];
});

const sentDocuments = () => (create.mock.calls[0]?.[0] as { documents?: unknown[] } | undefined)?.documents;

describe("POST /api/applications", () => {
  const post = async (body: Record<string, unknown>) => {
    const { postHandler } = await import("@/app/api/applications/handlers");
    return postHandler(
      new NextRequest("http://localhost/api/applications", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jobId: JOB, easyApply: true, ...body }),
      }),
      { userId: SEEKER_USER, role: "job_seeker", locale: "en" } as never,
    );
  };

  it("attaches exactly the file the seeker chose", async () => {
    const res = await post({ documentIds: ["d1"] });
    expect(res.status).toBe(201);
    expect(sentDocuments()).toEqual([{ name: "Old.pdf", url: older.url, type: "resume" }]);
  });

  it("attaches the stored built CV when that is the one chosen", async () => {
    await post({ documentIds: ["b1"] });
    expect(sentDocuments()).toEqual([{ name: built.name, url: built.url, type: "resume" }]);
  });

  it("attaches one CV — the Profile CV — when the client names none, not every resume", async () => {
    await post({});
    expect(sentDocuments()).toEqual([{ name: "CV", url: PROFILE_CV, type: "resume" }]);
  });

  it("attaches the default CV beside other attachments when no CV was named", async () => {
    // A portfolio link or a certificate alone used to mean no CV at all.
    await post({ portfolioUrl: "https://behance.net/sara" });
    expect(sentDocuments()).toEqual([
      { name: "CV", url: PROFILE_CV, type: "resume" },
      { name: "Portfolio", url: "https://behance.net/sara", type: "portfolio" },
    ]);
  });

  it("adds no second CV beside the one the seeker chose", async () => {
    await post({ documentIds: ["d2"], portfolioUrl: "https://behance.net/sara" });
    expect((sentDocuments() as { type: string }[]).filter((d) => d.type === "resume")).toEqual([
      { name: "New.pdf", url: newer.url, type: "resume" },
    ]);
  });

  it("falls to the newest upload when there is no Profile CV", async () => {
    seeker.cv = undefined;
    await post({});
    expect(sentDocuments()).toEqual([{ name: "New.pdf", url: newer.url, type: "resume" }]);
  });

  it("refuses a chosen Profile CV that is no longer on file rather than sending another", async () => {
    seeker.cv = undefined;
    const res = await post({ includeProfileCv: true });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "DOCUMENT_NOT_FOUND" });
    expect(create).not.toHaveBeenCalled();
  });

  it("holds the chosen file while the application is saved", async () => {
    await post({ documentIds: ["b1"] });
    expect(seekerUpdateOne).toHaveBeenCalledWith({ _id: SEEKER, "documents.url": built.url });
  });

  it("does not claim a portfolio link as a file", async () => {
    await post({ documentIds: ["d1"], portfolioUrl: "https://behance.net/sara" });
    expect(JSON.stringify(seekerUpdateOne.mock.calls)).not.toContain("behance");
  });

  it("refuses — and saves nothing — when the chosen file is removed in another tab while applying", async () => {
    // Read as present, gone by the time it is held: its file may be deleted.
    removedUrls = [built.url];
    const res = await post({ documentIds: ["b1"] });
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "DOCUMENT_NOT_FOUND" });
    expect(create).not.toHaveBeenCalled();
  });

  it("refuses a chosen file that is gone, even with other resumes on hand", async () => {
    const res = await post({ documentIds: ["deleted"] });
    expect(res.status).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });
});

describe("POST /api/jobs/[id]/apply (one tap)", () => {
  it("attaches one CV by the same rule", async () => {
    const { POST } = await import("@/app/api/jobs/[id]/apply/route");
    const res = await (POST as unknown as (req: NextRequest) => Promise<Response>)(
      new NextRequest(`http://localhost/api/jobs/${JOB}/apply`, { method: "POST" }),
    );
    expect(res.status).toBeLessThan(300);
    expect(sentDocuments()).toEqual([{ name: "CV", url: PROFILE_CV, type: "resume" }]);
  });

  it("refuses when the CV is replaced in another tab while applying", async () => {
    removedUrls = [PROFILE_CV];
    const { POST } = await import("@/app/api/jobs/[id]/apply/route");
    const res = await (POST as unknown as (req: NextRequest) => Promise<Response>)(
      new NextRequest(`http://localhost/api/jobs/${JOB}/apply`, { method: "POST" }),
    );
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ code: "DOCUMENT_NOT_FOUND" });
    expect(create).not.toHaveBeenCalled();
  });
});

describe("assistant apply_to_job", () => {
  const run = async () => {
    const { applyToJobTool } = await import("@/lib/ai/copilot/tools/jobSeeker");
    return applyToJobTool.execute({ jobId: JOB }, { userId: SEEKER_USER, role: "job_seeker", locale: "en" } as never);
  };

  it("stores the seeker's CV on the application", async () => {
    expect(await run()).toMatchObject({ ok: true });
    expect(sentDocuments()).toEqual([{ name: "CV", url: PROFILE_CV, type: "resume" }]);
  });

  it("sends the uploaded resume of a seeker with no Profile CV — it used to send nothing", async () => {
    seeker.cv = undefined;
    await run();
    expect(sentDocuments()).toEqual([{ name: "New.pdf", url: newer.url, type: "resume" }]);
  });

  it("has the application scored like any other", async () => {
    await run();
    expect(inngestSend).toHaveBeenCalledWith({
      name: "application/ai-screen",
      data: { applicationId: "650000000000000000000240" },
    });
  });

  it("records the seeker, not the application, in the job's applicant list", async () => {
    await run();
    expect(jobUpdateOne).toHaveBeenCalledWith({ _id: JOB }, { $addToSet: { applicantIds: SEEKER } });
  });

  it("carries the seeker's referral and priority flags", async () => {
    seeker.isAgentReferred = true;
    await run();
    expect(create.mock.calls[0][0]).toMatchObject({ isAgentReferred: true });
  });

  it("leaves a job with required questions to the form, which can ask them", async () => {
    job.screeningQuestions = [{ id: "q1", label: "Licence number?", required: true }];
    const result = await run();
    expect(result).toMatchObject({ ok: false });
    expect(result.message).toMatch(/job page/);
    expect(create).not.toHaveBeenCalled();
  });

  it("does not apply when the CV is replaced while it applies", async () => {
    removedUrls = [PROFILE_CV];
    const result = await run();
    expect(result).toMatchObject({ ok: false });
    expect(result.message).toMatch(/CV changed/);
    expect(create).not.toHaveBeenCalled();
  });

  it("does not apply to a job that is full", async () => {
    job.maxApplicants = 1;
    job.applicantIds = ["someone"];
    expect(await run()).toMatchObject({ ok: false });
    expect(create).not.toHaveBeenCalled();
  });
});
