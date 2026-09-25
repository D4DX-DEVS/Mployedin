/**
 * @jest-environment node
 */
/**
 * PATCH /api/jobs/[id] and the employer's ATS:
 *  - a deal-breaker's qualifying answers are split off the public question
 *    into the private Job.screeningKnockouts, so seekers are never served them;
 *  - a save that changes what applicants are scored on queues a re-score, and
 *    one that does not (a status move) costs nothing.
 */
import { NextRequest, NextResponse } from "next/server";

const EMPLOYER = "651000000000000000000001";
const JOB_ID = "651000000000000000000003";

let mockJob: Record<string, unknown> = {};
const mockQueueRescore = jest.fn().mockResolvedValue(undefined);

jest.mock("@/lib/inngest/rescoreJobApplicants", () => ({
  queueApplicantRescore: (...args: unknown[]) => mockQueueRescore(...args),
}));
jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/audit/log", () => ({
  actorFromCtx: jest.fn((ctx) => ({ actorId: ctx.userId, actorRole: ctx.role })),
  logActivity: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/lib/auth/agentRestrictions", () => ({ getScopedEmployerIds: jest.fn() }));
jest.mock("@/models/Job", () => ({
  __esModule: true,
  default: { findById: jest.fn(() => Promise.resolve(mockJob)) },
}));
jest.mock("@/models/Employer", () => ({
  __esModule: true,
  Employer: {
    findOne: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue({ _id: EMPLOYER }) }),
    }),
    findById: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockResolvedValue({ createdVia: "self", profileConfirmedAt: null }),
      }),
    }),
  },
}));
jest.mock("@/models/Agent", () => ({ __esModule: true, default: { findOne: jest.fn() } }));

async function patch(body: Record<string, unknown>) {
  mockJob = {
    _id: JOB_ID,
    employerId: EMPLOYER,
    agentId: null,
    status: "active",
    title: "Driver",
    requirements: { skills: ["Driving"], experienceMin: 2 },
    screeningQuestions: [],
    screeningKnockouts: [],
    save: jest.fn().mockResolvedValue(undefined),
  };
  const { patchHandler } = await import("@/app/api/jobs/[id]/handlers");
  const req = new NextRequest(`http://localhost:3000/api/jobs/${JOB_ID}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  try {
    return await patchHandler(req, { userId: "651000000000000000000009", role: "employer", locale: "en" }, { id: JOB_ID });
  } catch (err) {
    if (err instanceof NextResponse) return err;
    throw err;
  }
}

const licence = {
  id: "q1",
  label: "Valid UAE driving licence?",
  type: "radio",
  required: false,
  options: ["Yes", "No"],
  order: 0,
  knockout: true,
  acceptedAnswers: ["Yes"],
};

describe("PATCH /api/jobs/[id] — deal-breakers and re-scoring", () => {
  beforeEach(() => mockQueueRescore.mockClear());

  it("stores the qualifying answer apart from the public question", async () => {
    const res = await patch({ screeningQuestions: [licence] });
    expect(res.status).toBe(200);
    const questions = mockJob.screeningQuestions as Array<Record<string, unknown>>;
    expect(questions[0]).not.toHaveProperty("acceptedAnswers");
    expect(questions[0]).not.toHaveProperty("knockout");
    expect(questions[0].required).toBe(true);
    expect(mockJob.screeningKnockouts).toEqual([{ questionId: "q1", acceptedAnswers: ["Yes"] }]);
  });

  it("rejects a deal-breaker with no qualifying answer among its options", async () => {
    const res = await patch({ screeningQuestions: [{ ...licence, acceptedAnswers: ["Maybe"] }] });
    expect(res.status).toBe(400);
    expect(mockQueueRescore).not.toHaveBeenCalled();
  });

  it("queues a re-score when the requirements change", async () => {
    await patch({ requirements: { skills: ["Driving"], experienceMin: 5, experienceMax: 30 } });
    expect(mockQueueRescore).toHaveBeenCalledWith([JOB_ID]);
  });

  it("queues a re-score when a deal-breaker is added", async () => {
    await patch({ screeningQuestions: [licence] });
    expect(mockQueueRescore).toHaveBeenCalledWith([JOB_ID]);
  });

  it("does not re-score on a save that changes nothing applicants are scored on", async () => {
    await patch({ status: "paused" });
    expect(mockQueueRescore).not.toHaveBeenCalled();
  });
});
