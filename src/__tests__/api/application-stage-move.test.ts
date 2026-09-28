/**
 * @jest-environment node
 *
 * PATCH /api/applications/[id] with a workflow `stageId`. A job's stages sit
 * on the fixed status backbone, several stages can share one status
 * (Technical round → Culture fit, both "interview_scheduled"):
 *  - a stage names its status, so stageId alone can move the status;
 *  - a move between two stages of one status changes only the stage, and is
 *    written to the history and the audit log under the stage's name;
 *  - an unknown stage, or a stage that contradicts the status sent, is refused;
 *  - a job seeker can't move stages.
 */
import { NextRequest, NextResponse } from "next/server";

const USER_ID = "64b100000000000000000001";
const APP_ID = "64b100000000000000000002";
const JOB_ID = "64b100000000000000000003";
const EMPLOYER_ID = "64b100000000000000000004";
const SEEKER_ID = "64b100000000000000000005";
let ctxRole = "admin";

jest.mock("@/lib/db/mongoose", () => ({ __esModule: true, connectDB: jest.fn().mockResolvedValue(undefined), default: jest.fn() }));
const logActivity = jest.fn().mockResolvedValue(undefined);
jest.mock("@/lib/audit/log", () => ({ logActivity: (...a: unknown[]) => logActivity(...a), actorFromCtx: () => ({}) }));
jest.mock("@/lib/logger", () => ({ __esModule: true, default: { error: jest.fn(), warn: jest.fn(), info: jest.fn() } }));
jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: (req: NextRequest, ctx: unknown, params?: Record<string, string>) => Promise<Response>) =>
    async (req: NextRequest, context?: { params: Promise<Record<string, string>> }) => {
      const params = context ? await context.params : {};
      try {
        return await handler(req, { userId: USER_ID, role: ctxRole, locale: "en" }, params);
      } catch (err) {
        if (err instanceof NextResponse) return err;
        throw err;
      }
    },
}));
jest.mock("@/lib/notifications/trigger", () => ({
  notify: jest.fn().mockResolvedValue(undefined),
  notifyInterviewSelected: jest.fn().mockResolvedValue(undefined),
  notifyOfferMade: jest.fn().mockResolvedValue(undefined),
  notifyRejected: jest.fn().mockResolvedValue(undefined),
  notifyStatusChange: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/lib/hiring/closeOpenInterviews", () => ({
  advancesPastInterviewing: jest.fn(() => false),
  closeOpenInterviewsForAdvance: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/lib/auth/agentRestrictions", () => ({ getSuperAgentScope: jest.fn() }));
jest.mock("@/lib/permissions/team", () => ({ memberMayAccessJob: jest.fn().mockResolvedValue(true) }));
jest.mock("@/models/Agent", () => ({ __esModule: true, default: { findOne: jest.fn() } }));

const lean = (value: unknown) => {
  const c: Record<string, unknown> = {};
  c.select = () => c;
  c.sort = () => c;
  c.lean = async () => value;
  return c;
};
jest.mock("@/models/Employer", () => {
  const model = { findOne: jest.fn(() => lean({ _id: EMPLOYER_ID, userId: "64b1000000000000000000ee", companyName: "Acme", workflow: {} })) };
  return { __esModule: true, Employer: model, default: model };
});
jest.mock("@/models/JobSeeker", () => ({
  __esModule: true,
  default: { findOne: jest.fn(() => lean({ _id: SEEKER_ID })), findById: jest.fn(() => lean(null)) },
}));
jest.mock("@/models/Interview", () => ({ __esModule: true, default: { findOne: jest.fn(() => lean(null)) } }));

const STAGES = [
  { id: "applied", label: "Applied", phase: "applied" },
  { id: "tech_1", label: "Technical round", phase: "interview_scheduled" },
  { id: "tech_2", label: "Culture fit", phase: "interview_scheduled" },
  { id: "offer", label: "Offer", phase: "offer" },
  { id: "hired", label: "Hired", phase: "hired" },
];

let app: Record<string, unknown> & { statusHistory: Record<string, unknown>[]; save: jest.Mock };
jest.mock("@/models/Application", () => ({
  __esModule: true,
  default: { findById: jest.fn(() => ({ populate: async () => app })) },
}));

function patch(body: unknown) {
  return new NextRequest(`http://localhost/api/applications/${APP_ID}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
const params = { params: Promise.resolve({ id: APP_ID }) };

beforeEach(() => {
  jest.clearAllMocks();
  ctxRole = "admin";
  app = {
    _id: APP_ID,
    status: "interview_scheduled",
    stageId: "tech_1",
    jobSeekerId: SEEKER_ID,
    statusHistory: [],
    jobId: {
      _id: JOB_ID,
      employerId: EMPLOYER_ID,
      title: "Sales Executive",
      workflow: { stages: STAGES, template: { name: "Sales hiring", version: 1, source: "custom" } },
    },
    save: jest.fn().mockResolvedValue(undefined),
  };
});

describe("PATCH /api/applications/[id] — workflow stages", () => {
  it("moves between two stages of one status: stage changes, status stays, history and audit name the stage", async () => {
    const { PATCH } = await import("@/app/api/applications/[id]/route");
    const res = await PATCH(patch({ stageId: "tech_2" }), params);

    expect(res.status).toBe(200);
    expect(app.status).toBe("interview_scheduled");
    expect(app.stageId).toBe("tech_2");
    expect(app.statusHistory).toEqual([
      expect.objectContaining({ status: "interview_scheduled", stageId: "tech_2", stageLabel: "Culture fit" }),
    ]);
    expect(app.save).toHaveBeenCalled();
    const actions = logActivity.mock.calls.map((c) => (c[0] as { action: string }).action);
    expect(actions).toEqual(["application.stage_change"]);
  });

  it("a stage names its status: stageId alone moves the candidate to that status", async () => {
    const { PATCH } = await import("@/app/api/applications/[id]/route");
    const res = await PATCH(patch({ stageId: "offer" }), params);

    expect(res.status).toBe(200);
    expect(app.status).toBe("offer");
    expect(app.stageId).toBe("offer");
    expect(app.statusHistory[0]).toMatchObject({ status: "offer", stageId: "offer", stageLabel: "Offer" });
    expect(logActivity).toHaveBeenCalledWith(expect.objectContaining({ action: "application.status_change" }));
  });

  it("a status change without a stage lands in the first stage of that status", async () => {
    app.status = "applied";
    app.stageId = undefined;
    const { PATCH } = await import("@/app/api/applications/[id]/route");
    const res = await PATCH(patch({ status: "interview_scheduled" }), params);

    expect(res.status).toBe(200);
    expect(app.stageId).toBeUndefined();
    expect(app.statusHistory[0]).toMatchObject({ status: "interview_scheduled", stageId: "tech_1", stageLabel: "Technical round" });
  });

  it("refuses a stage the job doesn't have", async () => {
    const { PATCH } = await import("@/app/api/applications/[id]/route");
    const res = await PATCH(patch({ stageId: "nope" }), params);

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("UNKNOWN_STAGE");
    expect(app.save).not.toHaveBeenCalled();
  });

  it("refuses a stage that contradicts the status sent", async () => {
    const { PATCH } = await import("@/app/api/applications/[id]/route");
    const res = await PATCH(patch({ status: "offer", stageId: "tech_2" }), params);

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("STAGE_STATUS_MISMATCH");
    expect(app.save).not.toHaveBeenCalled();
  });

  it("re-selecting the stage the candidate is already in changes nothing", async () => {
    const { PATCH } = await import("@/app/api/applications/[id]/route");
    const res = await PATCH(patch({ stageId: "tech_1" }), params);

    expect(res.status).toBe(200);
    expect(app.statusHistory).toEqual([]);
    expect(logActivity).not.toHaveBeenCalled();
  });

  it("a job seeker can't move stages", async () => {
    ctxRole = "job_seeker";
    const { PATCH } = await import("@/app/api/applications/[id]/route");
    const res = await PATCH(patch({ stageId: "tech_2" }), params);

    expect(res.status).toBe(403);
    expect(app.save).not.toHaveBeenCalled();
  });
});
