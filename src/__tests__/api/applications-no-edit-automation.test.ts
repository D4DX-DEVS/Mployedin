/**
 * @jest-environment node
 *
 * Employer edits never trigger automation. Auto-reject lives in the screening
 * worker only; auto-progress is retired. A notes-only save on a low-scoring
 * candidate used to flip them to "rejected" and email them — this guards
 * against that ever coming back.
 */
import { NextRequest } from "next/server";

const EMPLOYER_USER = "64b000000000000000000001";
const EMPLOYER_ID = "64b000000000000000000002";
const APP_ID = "64b000000000000000000003";

const notifyRejected = jest.fn().mockResolvedValue(undefined);
const notifyStatusChange = jest.fn().mockResolvedValue(undefined);

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/audit/log", () => ({
  actorFromCtx: jest.fn((ctx) => ({ actorId: ctx.userId, actorRole: ctx.role })),
  logActivity: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/lib/logger", () => ({ __esModule: true, default: { error: jest.fn(), info: jest.fn(), warn: jest.fn() } }));
jest.mock("@/lib/notifications/trigger", () => ({
  notify: jest.fn().mockResolvedValue(undefined),
  notifyInterviewSelected: jest.fn().mockResolvedValue(undefined),
  notifyOfferMade: jest.fn().mockResolvedValue(undefined),
  notifyRejected: (...args: unknown[]) => notifyRejected(...args),
  notifyStatusChange: (...args: unknown[]) => notifyStatusChange(...args),
}));
jest.mock("@/lib/auth/agentRestrictions", () => ({ getSuperAgentScope: jest.fn() }));
jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: (req: NextRequest, ctx: unknown, params?: Record<string, string>) => Promise<Response>) =>
    (req: NextRequest, context: { params: Promise<Record<string, string>> }) =>
      context.params.then((params) => handler(req, { userId: EMPLOYER_USER, role: "employer", locale: "en" }, params)),
}));
jest.mock("@/models/Agent", () => ({ __esModule: true, default: { findOne: jest.fn() } }));
jest.mock("@/models/JobSeeker", () => ({
  __esModule: true,
  default: { findById: jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue({ userId: "64b000000000000000000099" }) }) }) },
}));
jest.mock("@/models/Interview", () => ({ __esModule: true, default: { findOne: jest.fn(() => ({ select: () => ({ lean: async () => null }) })) } }));

const saveMock = jest.fn().mockResolvedValue(undefined);
let jobWorkflow: unknown;
let employerWorkflow: unknown;
let application: Record<string, unknown>;

jest.mock("@/models/Application", () => ({
  __esModule: true,
  default: {
    findById: jest.fn(() => ({
      populate: jest.fn().mockImplementation(async () => application),
    })),
  },
}));
jest.mock("@/models/Employer", () => ({
  __esModule: true,
  Employer: {
    findOne: jest.fn(() => ({
      select: jest.fn(() => ({
        lean: jest.fn(async () => ({ _id: EMPLOYER_ID, userId: EMPLOYER_USER, companyName: "Acme", workflow: employerWorkflow })),
      })),
    })),
  },
}));

const stage = (id: string, order: number, autoProgress = false) => ({ id, label: id, enabled: true, autoProgress, order });

function makeApplication(status: string, aiMatchScore?: number) {
  return {
    _id: APP_ID,
    status,
    aiMatchScore,
    statusHistory: [] as unknown[],
    jobSeekerId: "64b000000000000000000050",
    jobId: { employerId: EMPLOYER_ID, title: "Senior Accountant", agentId: null, workflow: jobWorkflow },
    save: saveMock,
  };
}

async function patch(body: Record<string, unknown>) {
  const { PATCH } = await import("@/app/api/applications/[id]/route");
  const req = new NextRequest(`http://localhost:3000/api/applications/${APP_ID}`, {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
  return PATCH(req, { params: Promise.resolve({ id: APP_ID }) });
}

describe("PATCH /api/applications/[id] never automates", () => {
  beforeEach(() => {
    saveMock.mockClear();
    notifyRejected.mockClear();
    notifyStatusChange.mockClear();
    jobWorkflow = undefined;
    employerWorkflow = undefined;
  });

  it("a notes-only save on a low score with auto-reject enabled leaves the status alone", async () => {
    jobWorkflow = { settings: { autoRejectEnabled: true, autoRejectBelow: 40 } };
    application = makeApplication("applied", 10);
    const res = await patch({ employerNotes: "call back Monday" });
    expect(res.status).toBe(200);
    expect(application.status).toBe("applied");
    expect(application.employerNotes).toBe("call back Monday");
    expect(notifyRejected).not.toHaveBeenCalled();
    expect(saveMock).toHaveBeenCalledTimes(1);
  });

  it("an explicit stage move lands exactly where the employer put it (no auto-progress)", async () => {
    jobWorkflow = { stages: [stage("applied", 1), stage("shortlisted", 2, true), stage("interview_scheduled", 3)] };
    application = makeApplication("applied", 10);
    const res = await patch({ status: "shortlisted" });
    expect(res.status).toBe(200);
    expect(application.status).toBe("shortlisted");
    expect(application.statusHistory).toHaveLength(1);
  });

  it("candidate notifications follow the resolved notifyOnStageChange rule (job over employer)", async () => {
    employerWorkflow = { settings: { notifyOnStageChange: true } };
    jobWorkflow = { customizedAt: new Date(), settings: { notifyOnStageChange: false } };
    application = makeApplication("applied", 90);
    await patch({ status: "shortlisted" });
    expect(notifyStatusChange).not.toHaveBeenCalled();

    jobWorkflow = undefined;
    application = makeApplication("applied", 90);
    await patch({ status: "shortlisted" });
    expect(notifyStatusChange).toHaveBeenCalledTimes(1);
  });
});
