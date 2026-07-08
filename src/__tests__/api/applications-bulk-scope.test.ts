/**
 * @jest-environment node
 */
/**
 * EMPLOYER-FIX-PLAN E2 — bulk application actions must be tenant-scoped for
 * agent / super_agent, not just employer. Previously an agent could pass any
 * application ids ({_id: {$in: ids}} with no employerId filter) and bulk-act
 * on a competitor employer's pipeline.
 */
import { NextRequest } from "next/server";

jest.mock("@/lib/db/mongoose", () => ({
  connectDB: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: Function, _opts: unknown) => {
    return async (req: NextRequest) => handler(req, (req as unknown as { __ctx: unknown }).__ctx);
  },
}));

jest.mock("@/lib/security/rateLimit", () => ({
  checkRateLimit: jest.fn(() => Promise.resolve({ allowed: true, remaining: 10, resetAt: Date.now() + 60000 })),
  RATE_LIMIT_CONFIGS: { bulk: { limit: 5, windowSec: 60 } },
}));

jest.mock("@/lib/validators", () => ({
  validateBody: jest.fn(async (req: NextRequest) => req.json()),
}));
jest.mock("@/lib/validators/applications", () => ({ bulkActionSchema: {} }));

jest.mock("@/lib/audit/log", () => ({
  logActivity: jest.fn().mockResolvedValue(undefined),
  actorFromCtx: jest.fn(() => ({ actorId: "user", actorRole: "agent" })),
}));

jest.mock("@/lib/notifications/trigger", () => ({
  notify: jest.fn().mockResolvedValue(undefined),
  notifyRejected: jest.fn().mockResolvedValue(undefined),
  notifyStatusChange: jest.fn().mockResolvedValue(undefined),
  notifyOfferMade: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/communications/email", () => ({
  sendEmail: jest.fn().mockResolvedValue(undefined),
  EmailTemplates: { statusUpdate: () => ({ subject: "s", html: "h" }) },
}));

jest.mock("@/models/CommTemplate", () => ({
  __esModule: true,
  default: { findById: jest.fn(() => ({ lean: async () => null })) },
}));

const AGENT_ID = "agent_profile_1";
const OWNED_EMPLOYER = "emp_owned";
const OTHER_EMPLOYER = "emp_other";

let allApps: Array<Record<string, unknown>>;

jest.mock("@/models/Application", () => ({
  __esModule: true,
  default: {
    find: jest.fn((query: { _id: { $in: string[] }; employerId?: { $in: string[] } }) => ({
      select: () => ({
        populate: () => ({
          populate: () =>
            Promise.resolve(
              allApps.filter(
                (a) =>
                  query._id.$in.includes(a._id as string) &&
                  (!query.employerId || query.employerId.$in.includes(a.employerId as string))
              )
            ),
        }),
      }),
    })),
  },
}));

jest.mock("@/models/Employer", () => ({
  __esModule: true,
  Employer: {
    findOne: jest.fn(() => ({ select: () => ({ lean: async () => null }) })),
    find: jest.fn(() => ({ select: () => ({ lean: async () => [] }) })),
    findById: jest.fn(() => ({ select: () => ({ lean: async () => null }) })),
  },
}));

jest.mock("@/models/Agent", () => ({
  __esModule: true,
  default: {
    findOne: jest.fn(() => ({
      select: () => ({ lean: async () => ({ _id: AGENT_ID, assignedEmployerIds: [OWNED_EMPLOYER] }) }),
    })),
  },
}));

jest.mock("@/lib/auth/agentRestrictions", () => ({
  getSuperAgentEmployerIds: jest.fn(async () => []),
}));

import { POST as _POST } from "@/app/api/applications/bulk/route";

const POST = _POST as unknown as (req: NextRequest) => Promise<Response>;

function bulkReq(ctx: { userId: string; role: string; locale: string }, body: Record<string, unknown>) {
  const req = new NextRequest("http://localhost:3000/api/applications/bulk", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  (req as unknown as { __ctx: unknown }).__ctx = ctx;
  return req;
}

function makeApp(id: string, employerId: string) {
  return {
    _id: id,
    status: "applied",
    employerId,
    jobSeekerId: null,
    jobId: null,
    statusHistory: [],
    save: jest.fn().mockResolvedValue(undefined),
  };
}

describe("POST /api/applications/bulk — agent tenant scoping", () => {
  beforeEach(() => {
    allApps = [makeApp("app_owned", OWNED_EMPLOYER), makeApp("app_other", OTHER_EMPLOYER)];
  });

  it("403s when an agent includes an application id outside their assigned employers", async () => {
    const res = await POST(
      bulkReq(
        { userId: "u1", role: "agent", locale: "en" },
        { applicationIds: ["app_owned", "app_other"], action: "reject" }
      )
    );
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toMatch(/outside your scope/i);
  });

  it("processes normally when the agent only touches their assigned employer's applications", async () => {
    const res = await POST(
      bulkReq({ userId: "u1", role: "agent", locale: "en" }, { applicationIds: ["app_owned"], action: "reject" })
    );
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.processed).toBe(1);
  });
});
