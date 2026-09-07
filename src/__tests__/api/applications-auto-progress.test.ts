/**
 * @jest-environment node
 */
import { NextRequest } from "next/server";

const EMPLOYER_USER = "64b000000000000000000001";
const EMPLOYER_ID = "64b000000000000000000002";
const APP_ID = "64b000000000000000000003";

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
  notifyRejected: jest.fn().mockResolvedValue(undefined),
  notifyStatusChange: jest.fn().mockResolvedValue(undefined),
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

function makeApplication(status: string) {
  return {
    _id: APP_ID,
    status,
    statusHistory: [],
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

describe("PATCH /api/applications/[id] auto-progress", () => {
  beforeEach(() => {
    saveMock.mockClear();
    jobWorkflow = undefined;
    employerWorkflow = undefined;
  });

  it("uses the job's own workflow before the employer default", async () => {
    jobWorkflow = { stages: [stage("applied", 1), stage("shortlisted", 2, true), stage("interview_scheduled", 3)] };
    employerWorkflow = { stages: [stage("applied", 1), stage("shortlisted", 2, false), stage("interview_scheduled", 3)] };
    application = makeApplication("applied");
    const res = await patch({ status: "shortlisted" });
    expect(res.status).toBe(200);
    expect(application.status).toBe("interview_scheduled");
  });

  it("falls back to the employer workflow and understands legacy ids without writing them", async () => {
    employerWorkflow = { stages: [stage("new", 1), stage("screening", 2, true), stage("interview_scheduled", 3)] };
    application = makeApplication("applied");
    await patch({ status: "shortlisted" });
    // legacy lists lose their auto-progress flags, so the status stays where the employer put it
    expect(application.status).toBe("shortlisted");
  });

  it("never advances into rejected or withdrawn", async () => {
    jobWorkflow = { stages: [stage("offer", 1, true), stage("rejected", 2)] };
    application = makeApplication("selected");
    await patch({ status: "offer" });
    expect(application.status).toBe("offer");
  });
});
