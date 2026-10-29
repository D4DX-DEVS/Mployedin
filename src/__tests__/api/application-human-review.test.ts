/**
 * @jest-environment node
 */
/**
 * POST /api/applications/[id]/human-review — a candidate asks a person to
 * review an automatic rejection (UK GDPR Art 22A-D safeguards).
 */
import { NextRequest } from "next/server";

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/auth/withAuth", () => ({ withAuth: (handler: Function) => handler }));
jest.mock("@/lib/audit/log", () => ({ logActivity: jest.fn().mockResolvedValue(undefined), actorFromCtx: () => ({}) }));
jest.mock("@/lib/security/rateLimit", () => ({
  RATE_LIMIT_CONFIGS: { applications: {} },
  checkRateLimitDual: jest.fn().mockResolvedValue({ allowed: true, resetAt: Date.now() }),
}));

const mockNotifyEmployer = jest.fn().mockResolvedValue(undefined);
jest.mock("@/lib/notifications/trigger", () => ({
  notifyHumanReviewRequested: (...args: unknown[]) => mockNotifyEmployer(...args),
}));

const lean = (value: unknown) => ({ select: () => ({ lean: () => Promise.resolve(value) }) });

let application: Record<string, unknown> & { save: jest.Mock };
// The conditional write: null when another request (or a staff move) got there first.
const mockFindOneAndUpdate = jest.fn();
jest.mock("@/models/Application", () => ({
  __esModule: true,
  default: {
    findById: jest.fn(() => Promise.resolve(application)),
    findOneAndUpdate: (...args: unknown[]) => ({
      select: () => ({ lean: () => Promise.resolve(mockFindOneAndUpdate(...args)) }),
    }),
  },
}));

const mockSeeker = jest.fn();
jest.mock("@/models/JobSeeker", () => ({
  __esModule: true,
  default: { findOne: jest.fn(() => lean(mockSeeker())) },
}));
jest.mock("@/models/Job", () => ({
  __esModule: true,
  default: { findById: jest.fn(() => lean({ title: "Site Engineer", employerId: "emp_1" })) },
}));
jest.mock("@/models/Employer", () => ({
  Employer: { findById: jest.fn(() => lean({ userId: "employer_user_1" })) },
}));
jest.mock("@/models/User", () => ({
  __esModule: true,
  default: { findById: jest.fn(() => lean({ name: "Asha Rao" })) },
}));

const decidedAt = new Date("2026-10-27T09:00:00Z");

function freshApplication(overrides: Record<string, unknown> = {}) {
  return {
    _id: "app_1",
    jobSeekerId: "seeker_1",
    jobId: "job_1",
    status: "rejected",
    rejectionReason: "AI match score (32) below threshold (40)",
    automatedDecision: { kind: "auto_reject", score: 32, threshold: 40, decidedAt },
    statusHistory: [] as unknown[],
    save: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

async function post(body: unknown = {}, role = "job_seeker") {
  const { POST } = await import("@/app/api/applications/[id]/human-review/route");
  const req = new NextRequest("http://localhost/api/applications/app_1/human-review", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
  return (POST as Function)(req, { userId: "user_1", role, locale: "en" }, { id: "64b7f0c2a1b2c3d4e5f60718" });
}

describe("POST /api/applications/[id]/human-review", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    application = freshApplication();
    mockSeeker.mockReturnValue({ _id: "seeker_1", fullName: "Asha Rao" });
    mockFindOneAndUpdate.mockReturnValue({ _id: "app_1", status: "applied", automatedDecision: {} });
  });

  it("reopens the application for the employer, records the request and tells the employer", async () => {
    const res = await post({ note: "My CV lists 6 years on site." });
    expect(res.status).toBe(200);
    const [filter, update] = mockFindOneAndUpdate.mock.calls[0] as [Record<string, unknown>, Record<string, Record<string, unknown>>];
    // Only once, only on an auto-reject that still stands — enforced by the write itself.
    expect(filter).toEqual({
      _id: "app_1",
      status: "rejected",
      "automatedDecision.kind": "auto_reject",
      "automatedDecision.reviewRequestedAt": { $exists: false },
    });
    expect(update.$set.status).toBe("applied");
    expect(update.$set["automatedDecision.reviewRequestedAt"]).toBeInstanceOf(Date);
    expect(update.$set["automatedDecision.reviewNote"]).toBe("My CV lists 6 years on site.");
    expect(update.$unset).toEqual({ rejectionReason: 1 });
    expect(String((update.$push.statusHistory as { note?: string }).note)).toMatch(/human review/i);
    expect(mockNotifyEmployer).toHaveBeenCalledWith("employer_user_1", "Asha Rao", "Site Engineer", "app_1");
  });

  it("answers 409 and tells no one when a second request lost the race", async () => {
    mockFindOneAndUpdate.mockReturnValue(null);
    expect((await post()).status).toBe(409);
    expect(mockNotifyEmployer).not.toHaveBeenCalled();
  });

  it("refuses a second request", async () => {
    application = freshApplication({
      automatedDecision: { kind: "auto_reject", score: 32, threshold: 40, decidedAt, reviewRequestedAt: new Date() },
    });
    const res = await post();
    expect(res.status).toBe(409);
    expect(mockFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it("refuses a rejection a person made", async () => {
    application = freshApplication({ automatedDecision: undefined });
    expect((await post()).status).toBe(409);
  });

  it("refuses someone else's application", async () => {
    mockSeeker.mockReturnValue({ _id: "seeker_other" });
    expect((await post()).status).toBe(403);
    expect(mockFindOneAndUpdate).not.toHaveBeenCalled();
  });

  it("refuses staff: only the candidate can ask", async () => {
    expect((await post({}, "employer")).status).toBe(403);
  });
});
