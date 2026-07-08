/**
 * @jest-environment node
 */
/**
 * JOBSEEKER-FIX-PLAN J1 — job seekers must only withdraw their own
 * application, not set any status enum value (e.g. self-mark "hired").
 */
import { NextRequest } from "next/server";

jest.mock("@/lib/db/mongoose", () => ({
  connectDB: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: Function) => {
    return async (req: NextRequest, ctxOrParams: unknown, maybeParams: unknown) =>
      handler(req, (req as unknown as { __ctx: unknown }).__ctx, (req as unknown as { __params: unknown }).__params ?? maybeParams ?? ctxOrParams);
  },
}));

jest.mock("@/lib/security/sanitize", () => ({
  isValidObjectId: () => true,
}));

jest.mock("@/lib/validators", () => ({
  validateBody: jest.fn(async (req: NextRequest) => req.json()),
}));
jest.mock("@/lib/validators/applications", () => ({ applicationUpdateSchema: {} }));

jest.mock("@/lib/audit/log", () => ({
  logActivity: jest.fn().mockResolvedValue(undefined),
  actorFromCtx: jest.fn(() => ({ actorId: "u1", actorRole: "job_seeker" })),
}));

jest.mock("@/lib/notifications/trigger", () => ({
  notify: jest.fn().mockResolvedValue(undefined),
  notifyInterviewSelected: jest.fn().mockResolvedValue(undefined),
  notifyOfferMade: jest.fn().mockResolvedValue(undefined),
  notifyRejected: jest.fn().mockResolvedValue(undefined),
  notifyStatusChange: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/auth/agentRestrictions", () => ({
  getSuperAgentScope: jest.fn(async () => null),
}));

jest.mock("@/lib/logger", () => ({
  __esModule: true,
  default: { error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

jest.mock("@/models/Agent", () => ({ __esModule: true, default: {} }));

const SEEKER_PROFILE_ID = "seeker_profile_1";

const application: Record<string, unknown> = {
  _id: "app_1",
  status: "applied",
  jobSeekerId: SEEKER_PROFILE_ID,
  jobId: { employerId: "emp_1", agentId: null, title: "Engineer" },
  statusHistory: [],
  save: jest.fn().mockResolvedValue(undefined),
};

jest.mock("@/models/Application", () => ({
  __esModule: true,
  default: {
    findById: jest.fn(() => ({
      populate: () => Promise.resolve(application),
    })),
  },
}));

jest.mock("@/models/Employer", () => ({
  __esModule: true,
  Employer: { findOne: jest.fn(() => ({ select: () => ({ lean: async () => null }) })) },
}));

jest.mock("@/models/JobSeeker", () => ({
  __esModule: true,
  default: {
    findOne: jest.fn(() => ({
      select: () => ({ lean: async () => ({ _id: SEEKER_PROFILE_ID }) }),
    })),
    findById: jest.fn(() => ({
      select: () => ({ lean: async () => ({ userId: "u1" }) }),
    })),
  },
}));

import { PATCH as _PATCH } from "@/app/api/applications/[id]/route";

const PATCH = _PATCH as unknown as (req: NextRequest) => Promise<Response>;

function patchReq(status: string) {
  const req = new NextRequest("http://localhost:3000/api/applications/app_1", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
  (req as unknown as { __ctx: unknown }).__ctx = { userId: "u1", role: "job_seeker", locale: "en" };
  (req as unknown as { __params: unknown }).__params = { id: "app_1" };
  return req;
}

describe("PATCH /api/applications/[id] — job seeker status gate", () => {
  beforeEach(() => {
    application.status = "applied";
    application.statusHistory = [];
  });

  it("403s when a job seeker tries to set status to hired", async () => {
    const res = await PATCH(patchReq("hired"));
    expect(res.status).toBe(403);
  });

  it("allows a job seeker to withdraw their own application", async () => {
    const res = await PATCH(patchReq("withdrawn"));
    expect(res.status).toBe(200);
    expect(application.status).toBe("withdrawn");
  });
});
