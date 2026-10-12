/**
 * @jest-environment node
 *
 * A candidate who is rejected or withdraws can't attend the interview they
 * still hold. Only moves *past* interviewing (offer, hired…) used to settle
 * open slots, so a rejected candidate's interview stayed "scheduled": the
 * employer's Interviews page kept counting it and the reminder cron kept
 * mailing them about it (audit FUNC-009).
 *
 * The slot is settled only once the application has saved — a stage change
 * that fails validation must leave the interview alone (FUNC-008).
 *
 * A failed interview outcome rejects the candidate; it now records why and
 * settles any later round still on the books (FUNC-018).
 */
import { NextRequest } from "next/server";

const USER_ID = "64b200000000000000000001";
const APP_ID = "64b200000000000000000002";
const JOB_ID = "64b200000000000000000003";
const EMPLOYER_ID = "64b200000000000000000004";
const SEEKER_ID = "64b200000000000000000005";
const IV_ID = "64b200000000000000000006";
let ctxRole = "employer";

jest.mock("@/lib/db/mongoose", () => ({ __esModule: true, connectDB: jest.fn().mockResolvedValue(undefined), default: jest.fn() }));
jest.mock("@/lib/audit/log", () => ({ logActivity: jest.fn().mockResolvedValue(undefined), actorFromCtx: () => ({}) }));
jest.mock("@/lib/logger", () => ({ __esModule: true, default: { error: jest.fn(), warn: jest.fn(), info: jest.fn() } }));
jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: (req: NextRequest, ctx: unknown, params?: Record<string, string>) => Promise<Response>) =>
    async (req: NextRequest, context?: { params: Promise<Record<string, string>> }) =>
      handler(req, { userId: USER_ID, role: ctxRole, locale: "en" }, context ? await context.params : {}),
}));
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
jest.mock("@/lib/permissions/team", () => ({ memberMayAccessJob: jest.fn().mockResolvedValue(true) }));
jest.mock("@/lib/interviews/access", () => ({ verifyInterviewAccess: jest.fn(async () => null) }));
jest.mock("@/lib/interviews/sendInvite", () => ({ sendInterviewInvite: jest.fn().mockResolvedValue(true) }));

function chain<T>(result: T) {
  const c: Record<string, jest.Mock> = {};
  for (const m of ["populate", "sort", "skip", "limit", "select"]) c[m] = jest.fn(() => c);
  c.lean = jest.fn(async () => result);
  return c;
}

let application: Record<string, unknown> & { statusHistory: unknown[]; save: jest.Mock };
jest.mock("@/models/Application", () => ({
  __esModule: true,
  default: {
    findById: jest.fn(() => {
      // PATCH /applications awaits .populate(); PATCH /interviews awaits findById directly.
      const p = Promise.resolve(application) as Promise<unknown> & { populate?: () => Promise<unknown> };
      p.populate = () => Promise.resolve(application);
      return p;
    }),
  },
}));
jest.mock("@/models/Employer", () => {
  const model = { findOne: jest.fn(() => chain({ _id: EMPLOYER_ID, userId: USER_ID, companyName: "Acme", workflow: null })) };
  return { __esModule: true, Employer: model, default: model };
});
jest.mock("@/models/Job", () => ({ __esModule: true, default: { findById: jest.fn(() => chain({ _id: JOB_ID, title: "Accountant" })) } }));
jest.mock("@/models/JobSeeker", () => ({
  __esModule: true,
  default: {
    findOne: jest.fn(() => chain({ _id: SEEKER_ID })),
    findById: jest.fn(() => chain({ _id: SEEKER_ID, userId: "64b200000000000000000041" })),
  },
}));

const updateMany = jest.fn(async () => ({ modifiedCount: 1 }));
const interviewFind = jest.fn(() => chain([] as Array<{ _id: string }>));
let interview: Record<string, unknown>;
jest.mock("@/models/Interview", () => ({
  __esModule: true,
  default: {
    findOne: jest.fn(() => chain(null)),
    findById: jest.fn(async () => interview),
    updateMany: (...a: unknown[]) => updateMany(...(a as [])),
    find: (...a: unknown[]) => interviewFind(...(a as [])),
  },
}));

function request(url: string, body: unknown) {
  return new NextRequest(`http://localhost${url}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function patchApplication(body: unknown) {
  const { PATCH } = await import("@/app/api/applications/[id]/route");
  return PATCH(request(`/api/applications/${APP_ID}`, body), { params: Promise.resolve({ id: APP_ID }) });
}

async function patchInterview(body: unknown) {
  const { PATCH } = await import("@/app/api/interviews/[id]/route");
  return PATCH(request(`/api/interviews/${IV_ID}`, body), { params: Promise.resolve({ id: IV_ID }) });
}

const closedFor = (id: string) =>
  updateMany.mock.calls.filter((c) => String((c as unknown[])[0] && ((c as unknown[])[0] as { applicationId?: unknown }).applicationId) === id);

beforeEach(() => {
  jest.clearAllMocks();
  ctxRole = "employer";
  application = {
    _id: APP_ID,
    status: "interview_scheduled",
    jobSeekerId: SEEKER_ID,
    statusHistory: [],
    jobId: { _id: JOB_ID, employerId: EMPLOYER_ID, title: "Accountant", workflow: null },
    save: jest.fn().mockResolvedValue(undefined),
  };
  interview = {
    _id: IV_ID,
    applicationId: APP_ID,
    jobId: JOB_ID,
    jobSeekerId: SEEKER_ID,
    status: "scheduled",
    type: "in_person",
    interviewRound: 1,
    scheduledAt: new Date(Date.now() - 3_600_000),
    save: jest.fn().mockResolvedValue(undefined),
  };
});

describe("closesOpenInterviews", () => {
  it("is true once the candidate is past interviewing or out of the process", async () => {
    const { closesOpenInterviews } = await import("@/lib/hiring/closeOpenInterviews");
    for (const s of ["selected", "offer", "hired", "rejected", "withdrawn"]) expect([s, closesOpenInterviews(s)]).toEqual([s, true]);
    for (const s of ["applied", "shortlisted", "interview_scheduled"]) expect([s, closesOpenInterviews(s)]).toEqual([s, false]);
  });
});

describe("PATCH /api/applications/[id] settles open interviews when the candidate leaves", () => {
  it("rejecting the candidate closes the interview they still hold, after the application saved", async () => {
    const res = await patchApplication({ status: "rejected", rejectionReason: "Not enough experience" });

    expect(res.status).toBe(200);
    expect(closedFor(APP_ID).length).toBeGreaterThan(0);
    expect(Math.min(...updateMany.mock.invocationCallOrder)).toBeGreaterThan(application.save.mock.invocationCallOrder[0]);
  });

  it("a slot still ahead is cancelled in the candidate's calendar too", async () => {
    interviewFind.mockReturnValueOnce(chain([{ _id: IV_ID }]));
    const { sendInterviewInvite } = jest.requireMock("@/lib/interviews/sendInvite") as { sendInterviewInvite: jest.Mock };

    const res = await patchApplication({ status: "rejected", rejectionReason: "Not enough experience" });

    expect(res.status).toBe(200);
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ applicationId: APP_ID, _id: { $in: [IV_ID] } }),
      { $set: { status: "cancelled" }, $inc: { icsSequence: 1 } },
    );
    expect(sendInterviewInvite).toHaveBeenCalledWith(IV_ID, "en");
  });

  it("the candidate withdrawing closes it too", async () => {
    ctxRole = "job_seeker";
    const res = await patchApplication({ status: "withdrawn", withdrawalReason: "accepted_elsewhere" });

    expect(res.status).toBe(200);
    expect(application.status).toBe("withdrawn");
    expect(closedFor(APP_ID).length).toBeGreaterThan(0);
  });

  it("a stage change that fails to save leaves the interview alone", async () => {
    application.save.mockRejectedValueOnce(new Error("validation failed"));

    await expect(patchApplication({ status: "rejected", rejectionReason: "Not enough experience" })).rejects.toThrow("validation failed");
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("a move that stays inside interviewing closes nothing", async () => {
    application.status = "shortlisted";
    const res = await patchApplication({ status: "interview_scheduled" });

    expect(res.status).toBe(200);
    expect(updateMany).not.toHaveBeenCalled();
  });
});

describe("Copilot withdraw_application", () => {
  it("closes the interview the candidate held, like the Applications page does", async () => {
    ctxRole = "job_seeker";
    const { withdrawApplicationTool } = await import("@/lib/ai/copilot/tools/jobSeeker");
    const result = await withdrawApplicationTool.execute(
      { applicationId: APP_ID, withdrawalReason: "accepted_elsewhere" },
      { userId: USER_ID, role: "job_seeker", locale: "en" } as never,
    );

    expect(result).toMatchObject({ ok: true });
    expect(application.status).toBe("withdrawn");
    expect(closedFor(APP_ID).length).toBeGreaterThan(0);
    expect(Math.min(...updateMany.mock.invocationCallOrder)).toBeGreaterThan(application.save.mock.invocationCallOrder[0]);
  });
});

describe("Copilot update_application_status (employer)", () => {
  it("rejecting through Copilot closes the interview too, after the save", async () => {
    const { updateApplicationStatusTool } = await import("@/lib/ai/copilot/tools/employer");
    const result = await updateApplicationStatusTool.execute(
      { applicationId: APP_ID, status: "rejected", rejectionReason: "Not enough experience" },
      { userId: USER_ID, role: "employer", locale: "en" } as never,
    );

    expect(result).toMatchObject({ ok: true });
    expect(application.status).toBe("rejected");
    expect(closedFor(APP_ID).length).toBeGreaterThan(0);
    expect(Math.min(...updateMany.mock.invocationCallOrder)).toBeGreaterThan(application.save.mock.invocationCallOrder[0]);
  });

  it("a shortlist through Copilot closes nothing", async () => {
    application.status = "applied";
    const { updateApplicationStatusTool } = await import("@/lib/ai/copilot/tools/employer");
    await updateApplicationStatusTool.execute({ applicationId: APP_ID, status: "shortlisted" }, { userId: USER_ID, role: "employer", locale: "en" } as never);

    expect(updateMany).not.toHaveBeenCalled();
  });
});

describe("PATCH /api/interviews/[id] — a failed outcome", () => {
  it("rejects with a recorded reason and settles any later round still open", async () => {
    const res = await patchInterview({ status: "completed", outcome: "failed" });

    expect(res.status).toBe(200);
    expect(application.status).toBe("rejected");
    expect(application.rejectionReason).toBe("Did not pass the round 1 interview");
    expect(application.statusHistory).toEqual([
      expect.objectContaining({ status: "rejected", note: "Did not pass the round 1 interview" }),
    ]);
    expect(closedFor(APP_ID).length).toBeGreaterThan(0);
    expect(Math.min(...updateMany.mock.invocationCallOrder)).toBeGreaterThan(application.save.mock.invocationCallOrder[0]);
  });

  it("replaces a reason left over from an earlier rejection", async () => {
    // Reinstating a candidate does not clear the old reason, so at interview
    // stage any stored reason belongs to a previous decision.
    application.rejectionReason = "Rejected in error";
    await patchInterview({ status: "completed", outcome: "failed" });

    expect(application.rejectionReason).toBe("Did not pass the round 1 interview");
  });
});
