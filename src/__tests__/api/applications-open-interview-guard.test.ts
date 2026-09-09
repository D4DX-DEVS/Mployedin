/**
 * @jest-environment node
 */
import { NextRequest } from "next/server";

const EMPLOYER_USER = "64b000000000000000000001";
const EMPLOYER_ID = "64b000000000000000000002";
const APP_ID = "64b000000000000000000030";
const JOB_ID = "64b000000000000000000010";

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: (req: NextRequest, ctx: unknown, params?: Record<string, string>) => Promise<Response>) =>
    (req: NextRequest, context: { params: Promise<Record<string, string>> }) =>
      context.params.then((params) => handler(req, { userId: EMPLOYER_USER, role: "employer", locale: "en" }, params)),
}));
jest.mock("@/lib/audit/log", () => ({ logActivity: jest.fn(() => Promise.resolve(undefined)), actorFromCtx: () => ({}) }));
// The route fires these and chains `.catch`, so each must return a promise.
jest.mock("@/lib/notifications/trigger", () => {
  const resolved = () => jest.fn(() => Promise.resolve(undefined));
  return {
    notify: resolved(),
    notifyInterviewSelected: resolved(),
    notifyOfferMade: resolved(),
    notifyRejected: resolved(),
    notifyStatusChange: resolved(),
  };
});

function chain<T>(result: T) {
  const c: Record<string, jest.Mock> = {};
  for (const m of ["populate", "sort", "skip", "limit", "select"]) c[m] = jest.fn(() => c);
  c.lean = jest.fn(async () => result);
  return c;
}

const application = {
  _id: APP_ID,
  jobId: { _id: JOB_ID, title: "Accountant", employerId: EMPLOYER_ID },
  jobSeekerId: "64b000000000000000000040",
  employerId: EMPLOYER_ID,
  status: "interview_scheduled",
  statusHistory: [] as unknown[],
  save: jest.fn(async () => undefined),
};

// PATCH awaits `findById(id).populate(...)` directly — no `.lean()` — because it
// needs a live document to `.save()`. So populate must resolve to the doc.
jest.mock("@/models/Application", () => ({
  __esModule: true,
  default: { findById: jest.fn(() => ({ populate: () => Promise.resolve(application) })) },
  APPLICATION_STATUSES: ["applied", "shortlisted", "interview_scheduled", "selected", "offer", "hired", "rejected", "withdrawn"],
}));
jest.mock("@/models/Employer", () => ({ __esModule: true, Employer: { findOne: jest.fn(() => chain({ _id: EMPLOYER_ID, userId: EMPLOYER_USER, companyName: "d4dx", workflow: null })) } }));
jest.mock("@/models/Job", () => ({ __esModule: true, default: { findById: jest.fn(() => chain({ _id: JOB_ID, employerId: EMPLOYER_ID, workflow: null })) } }));
jest.mock("@/models/Agent", () => ({ __esModule: true, default: { findOne: jest.fn(() => chain(null)), findById: jest.fn(() => chain(null)) } }));
jest.mock("@/models/JobSeeker", () => ({ __esModule: true, default: { findById: jest.fn(() => chain({ userId: "64b000000000000000000041" })) } }));

const interviewFindOne = jest.fn(() => chain(null as unknown));
jest.mock("@/models/Interview", () => ({ __esModule: true, default: { findOne: (...a: unknown[]) => interviewFindOne(...(a as [])) } }));

async function patch(payload: Record<string, unknown>) {
  const { PATCH } = await import("@/app/api/applications/[id]/route");
  return PATCH(
    new NextRequest(`http://localhost:3000/api/applications/${APP_ID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
    { params: Promise.resolve({ id: APP_ID }) },
  );
}

describe("PATCH /api/applications/[id] — open interview guard", () => {
  beforeEach(() => {
    application.status = "interview_scheduled";
    application.statusHistory = [];
    application.save.mockClear();
    interviewFindOne.mockReset();
    interviewFindOne.mockImplementation(() => chain(null as unknown));
  });

  it("refuses a backwards move while an interview is still open", async () => {
    interviewFindOne.mockImplementation(() => chain({
      _id: "iv-1", scheduledAt: new Date("2026-05-03T09:00:00.000Z"), interviewRound: 2, type: "video", status: "scheduled",
    }));

    const res = await patch({ status: "shortlisted" });

    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe("OPEN_INTERVIEW");
    expect(body.interview).toMatchObject({ _id: "iv-1", interviewRound: 2, status: "scheduled" });
    expect(application.save).not.toHaveBeenCalled();
    expect(application.status).toBe("interview_scheduled");
  });

  it("goes ahead once the caller acknowledges the open interview", async () => {
    interviewFindOne.mockImplementation(() => chain({ _id: "iv-1", status: "scheduled" }));

    const res = await patch({ status: "shortlisted", acknowledgeOpenInterview: true });

    expect(res.status).toBe(200);
    expect(application.status).toBe("shortlisted");
    expect(application.save).toHaveBeenCalled();
  });

  it("does not look for interviews on a forward move", async () => {
    const res = await patch({ status: "selected" });
    expect(res.status).toBe(200);
    expect(interviewFindOne).not.toHaveBeenCalled();
  });

  it("lets a backwards move through when no interview is open", async () => {
    const res = await patch({ status: "applied" });
    expect(res.status).toBe(200);
    expect(interviewFindOne).toHaveBeenCalled();
    expect(application.status).toBe("applied");
  });

  it("treats rejection as a decision, not a backwards move", async () => {
    const res = await patch({ status: "rejected", rejectionReason: "Not a fit" });
    expect(res.status).toBe(200);
    expect(interviewFindOne).not.toHaveBeenCalled();
  });
});
