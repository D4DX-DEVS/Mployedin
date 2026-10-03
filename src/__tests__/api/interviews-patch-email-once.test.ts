/**
 * @jest-environment node
 *
 * Rescheduling or cancelling through PATCH /api/interviews/[id] reissues the
 * calendar invitation (a REQUEST with the new time and the response link, or a
 * CANCEL) and also writes a notify() row for the candidate. With the
 * orchestrator's dedup fixed, that row would mail a second, plainer copy, so it
 * keeps to in-app and push and the invitation stays the candidate's email.
 * Without sendPush the event would not be emitted at all (nothing else asks for
 * it), and the candidate would hear of the change only from the bell.
 *
 * DELETE sends no invitation, so its notify() email is the only one and stays.
 */
import { NextRequest } from "next/server";

const IV = "650000000000000000000050";
const SEEKER_USER = "650000000000000000000031";

jest.mock("@/lib/auth/withAuth", () => ({
  withAuth:
    (h: (req: NextRequest, ctx: unknown, params?: Record<string, string>) => Promise<Response>) =>
    async (req: NextRequest, rc?: { params?: Promise<Record<string, string>> }) =>
      h(req, { userId: "employer_user", role: "employer", locale: "en" }, rc?.params ? await rc.params : undefined),
}));
jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/audit/log", () => ({ logActivity: jest.fn(), actorFromCtx: jest.fn(() => ({})) }));
jest.mock("@/lib/interviews/access", () => ({ verifyInterviewAccess: jest.fn(async () => null) }));
jest.mock("@/lib/validators", () => ({ validateBody: jest.fn(async (req: NextRequest) => req.json()) }));
jest.mock("@/lib/validators/interviews", () => ({ interviewUpdateSchema: {} }));
const sendInterviewInvite = jest.fn().mockResolvedValue(true);
jest.mock("@/lib/interviews/sendInvite", () => ({ sendInterviewInvite: (...a: unknown[]) => sendInterviewInvite(...a) }));
const notify = jest.fn().mockResolvedValue(undefined);
jest.mock("@/lib/notifications/trigger", () => ({ notify: (...a: unknown[]) => notify(...a) }));

let interview: Record<string, unknown>;
jest.mock("@/models/Interview", () => ({ __esModule: true, default: { findById: async () => interview } }));
jest.mock("@/models/Application", () => ({ __esModule: true, default: { findById: jest.fn() } }));
jest.mock("@/models/JobSeeker", () => ({
  __esModule: true,
  default: { findById: () => ({ select: () => ({ lean: async () => ({ userId: SEEKER_USER }) }) }) },
}));
jest.mock("@/models/Job", () => ({
  __esModule: true,
  default: { findById: () => ({ select: () => ({ lean: async () => ({ title: "Nurse" }) }) }) },
}));

import { PATCH as _PATCH, DELETE as _DELETE } from "@/app/api/interviews/[id]/route";

type Route = (req: NextRequest, rc: { params: Promise<Record<string, string>> }) => Promise<Response>;
const PATCH = _PATCH as unknown as Route;
const DELETE = _DELETE as unknown as Route;
const rc = { params: Promise.resolve({ id: IV }) };

function patch(body: Record<string, unknown>) {
  return PATCH(
    new NextRequest(`http://localhost/api/interviews/${IV}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    rc,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  interview = {
    _id: IV,
    jobSeekerId: "650000000000000000000030",
    jobId: "650000000000000000000010",
    applicationId: "650000000000000000000040",
    status: "scheduled",
    type: "in_person",
    location: "Dubai office",
    scheduledAt: new Date(Date.now() + 2 * 86_400_000),
    rescheduleCount: 0,
    icsSequence: 0,
    save: jest.fn().mockResolvedValue(undefined),
  };
});

describe("interview changes email the candidate once", () => {
  it("a reschedule sends the updated invitation and keeps notify() to in-app and push", async () => {
    const res = await patch({ scheduledAt: new Date(Date.now() + 3 * 86_400_000).toISOString() });
    expect(res.status).toBe(200);
    expect(sendInterviewInvite).toHaveBeenCalledWith(IV, "en");
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ userId: SEEKER_USER, title: "Interview Rescheduled", sendEmail: false, sendPush: true }),
    );
  });

  it("a cancellation sends the calendar CANCEL and keeps notify() to in-app and push", async () => {
    const res = await patch({ status: "cancelled" });
    expect(res.status).toBe(200);
    expect(sendInterviewInvite).toHaveBeenCalledWith(IV, "en");
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ userId: SEEKER_USER, title: "Interview Cancelled", sendEmail: false, sendPush: true }),
    );
  });

  it("DELETE sends no invitation, so its notify() email is the candidate's only one", async () => {
    const res = await DELETE(new NextRequest(`http://localhost/api/interviews/${IV}`, { method: "DELETE" }), rc);
    expect(res.status).toBe(200);
    expect(sendInterviewInvite).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ userId: SEEKER_USER, title: "Interview Cancelled", sendEmail: true }),
    );
  });
});

/**
 * The hourly cron sends the "24 hour" reminder to any interview less than 24 h
 * away that has reminderSent false, and its text is the booking notice
 * ("Interview Scheduled"). PATCH never touched reminderSent, so rescheduling an
 * unreminded interview into the next day sent the reissued invitation and then,
 * within the hour, that reminder. A reschedule inside the window marks it
 * reminded; the 1 h reminder (which needs reminderSent true) still fires.
 */
describe("a reschedule inside the 24 hour window", () => {
  const HOUR = 3_600_000;

  beforeEach(() => {
    interview.reminderSent = false;
  });

  it("marks the interview reminded when the new time is 3 hours away", async () => {
    const res = await patch({ scheduledAt: new Date(Date.now() + 3 * HOUR).toISOString() });
    expect(res.status).toBe(200);
    expect(interview.reminderSent).toBe(true);
  });

  it("leaves it to the 24 hour reminder when the new time is 3 days away", async () => {
    const res = await patch({ scheduledAt: new Date(Date.now() + 72 * HOUR).toISOString() });
    expect(res.status).toBe(200);
    expect(interview.reminderSent).toBe(false);
  });

  it("does not touch the flag on an edit that moves nothing", async () => {
    const res = await patch({ instructions: "Bring your ID" });
    expect(res.status).toBe(200);
    expect(interview.reminderSent).toBe(false);
  });
});
