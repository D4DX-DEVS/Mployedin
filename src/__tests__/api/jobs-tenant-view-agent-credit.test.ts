/**
 * @jest-environment node
 *
 * Regression cover for T9 (CONSOLIDATED-AUDIT.md §2.2).
 *
 * Inside tenant view withAuth swaps ctx.userId/ctx.role to the employer, so
 * createHandler took the `ctx.role === "employer"` path and had no idea which
 * agent was actually posting. agentId then fell through to the employer's
 * default agent, or to autoAssignAgent()'s workload/placement/city score — and
 * agentId is what drives incrementAgentCounter("vacanciesPosted"), the
 * super-agent approval notification and recruitment invoicing, i.e. commission.
 *
 * The seeded E2E data has exactly one agent per employer, so no browser test can
 * tell "credited the acting agent" from "credited the only candidate". These
 * cases give the acting agent a rival on purpose.
 */

import { NextRequest } from "next/server";
import type { UserRole } from "@/models/User";

const ACTING_AGENT_ID = "aaaaaaaaaaaaaaaaaaaaaaaa";
const ACTING_AGENT_USER_ID = "aaaaaaaaaaaaaaaaaaaaaaab";
const DEFAULT_AGENT_ID = "bbbbbbbbbbbbbbbbbbbbbbbb";
const AUTO_ASSIGNED_AGENT_ID = "cccccccccccccccccccccccc";
const EMPLOYER_ID = "dddddddddddddddddddddddd";
const EMPLOYER_USER_ID = "ddddddddddddddddddddddde";

jest.mock("@/lib/db/mongoose", () => ({
  __esModule: true,
  default: jest.fn().mockResolvedValue(undefined),
  connectDB: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/audit/log", () => ({
  logActivity: jest.fn().mockResolvedValue(undefined),
  actorFromCtx: jest.fn(() => ({ actorId: "x", actorRole: "agent" })),
}));

jest.mock("@/lib/security/sanitize", () => ({
  sanitizeHtml: (v: string) => v,
  escapeRegex: (v: string) => v,
}));

jest.mock("@/lib/security/rateLimit", () => ({
  checkRateLimitDual: jest.fn().mockResolvedValue({ allowed: true }),
  RATE_LIMIT_CONFIGS: { jobCreate: {} },
}));

jest.mock("@/lib/validators", () => ({
  validateBody: jest.fn(async (req: NextRequest) => req.json()),
}));

jest.mock("@/lib/validators/jobs", () => ({ jobCreateSchema: {} }));

const autoAssignAgent = jest.fn();
jest.mock("@/lib/agents/autoAssign", () => ({
  autoAssignAgent: (...a: unknown[]) => autoAssignAgent(...a),
}));

// Employer profile carries a *default* agent that is NOT the one acting.
const employerFindOneLean = jest.fn();
jest.mock("@/models/Employer", () => ({
  __esModule: true,
  default: { findOne: () => ({ select: () => ({ lean: employerFindOneLean }) }) },
  Employer: { findOne: () => ({ select: () => ({ lean: employerFindOneLean }) }) },
}));

const agentFindOneLean = jest.fn();
const agentFindByIdLean = jest.fn();
jest.mock("@/models/Agent", () => ({
  __esModule: true,
  default: {
    findOne: () => ({ select: () => ({ lean: agentFindOneLean }) }),
    findById: () => ({ select: () => ({ lean: agentFindByIdLean }) }),
  },
}));

// Capture what the Job document was constructed with — that is the assertion.
let capturedJob: Record<string, unknown> = {};
jest.mock("@/models/Job", () => ({
  __esModule: true,
  default: class {
    _id = "eeeeeeeeeeeeeeeeeeeeeeee";
    save = jest.fn().mockResolvedValue(undefined);
    constructor(doc: Record<string, unknown>) {
      capturedJob = doc;
    }
  },
}));

jest.mock("@/models/Application", () => ({ __esModule: true, default: {} }));
jest.mock("@/models/CompanyUser", () => ({ __esModule: true, default: {} }));
jest.mock("@/models/SuperAgent", () => ({ __esModule: true, default: {} }));

jest.mock("@/lib/agentPerformance", () => ({ incrementAgentCounter: jest.fn() }));
jest.mock("@/lib/notifications/trigger", () => ({
  getSuperAgentUserId: jest.fn().mockResolvedValue(null),
  notifySuperAgentNewJob: jest.fn(),
}));

function postReq(body: Record<string, unknown> = {}) {
  return new NextRequest("http://localhost/api/jobs", {
    method: "POST",
    body: JSON.stringify({
      title: "Backend Engineer",
      description: "desc",
      location: { country: "IN", city: "Mumbai", isRemote: false },
      employmentType: "full_time",
      ...body,
    }),
    headers: { "content-type": "application/json" },
  });
}

// ctx as withAuth builds it inside tenant view: userId/role are the EMPLOYER's,
// the real human lives in tenantView.
function tenantCtx(actorRole: UserRole, actorId = ACTING_AGENT_USER_ID) {
  return {
    userId: EMPLOYER_USER_ID,
    role: "employer" as const,
    locale: "en",
    tenantView: { actorId, actorRole, employerId: EMPLOYER_ID },
  };
}

describe("T9 — job credit inside tenant view", () => {
  beforeEach(() => {
    capturedJob = {};
    jest.clearAllMocks();
    autoAssignAgent.mockResolvedValue(AUTO_ASSIGNED_AGENT_ID);
    agentFindByIdLean.mockResolvedValue(null);
    employerFindOneLean.mockResolvedValue({
      _id: EMPLOYER_ID,
      agentId: DEFAULT_AGENT_ID,
      verifiedAt: new Date(),
    });
    agentFindOneLean.mockResolvedValue({
      _id: ACTING_AGENT_ID,
      assignedEmployerIds: [EMPLOYER_ID],
    });
  });

  it("credits the agent who is actually posting, not the employer's default agent", async () => {
    const { createHandler } = await import("@/app/api/jobs/handlers");
    await createHandler(postReq(), tenantCtx("agent"));

    expect(capturedJob.agentId).toBe(ACTING_AGENT_ID);
    expect(capturedJob.agentId).not.toBe(DEFAULT_AGENT_ID);
    expect(autoAssignAgent).not.toHaveBeenCalled();
  });

  it("falls back to the employer's default agent when the actor is not assigned to them", async () => {
    agentFindOneLean.mockResolvedValue({ _id: ACTING_AGENT_ID, assignedEmployerIds: [] });

    const { createHandler } = await import("@/app/api/jobs/handlers");
    await createHandler(postReq(), tenantCtx("agent"));

    expect(capturedJob.agentId).toBe(DEFAULT_AGENT_ID);
  });

  it("still honours an explicitly chosen agent over the acting one", async () => {
    agentFindByIdLean.mockResolvedValue({ assignedEmployerIds: [EMPLOYER_ID] });

    const { createHandler } = await import("@/app/api/jobs/handlers");
    await createHandler(postReq({ agentId: DEFAULT_AGENT_ID }), tenantCtx("agent"));

    expect(capturedJob.agentId).toBe(DEFAULT_AGENT_ID);
  });

  it("leaves a non-agent actor (admin support view) on the existing resolution", async () => {
    const { createHandler } = await import("@/app/api/jobs/handlers");
    await createHandler(postReq(), tenantCtx("admin", "ffffffffffffffffffffffff"));

    expect(capturedJob.agentId).toBe(DEFAULT_AGENT_ID);
  });

  it("T8 — an admin posting inside an employer's account keeps auto-approval", async () => {
    const { createHandler } = await import("@/app/api/jobs/handlers");
    await createHandler(postReq(), tenantCtx("admin", "ffffffffffffffffffffffff"));

    // ctx.role is "employer" here; the approval decision must follow the real human.
    expect(capturedJob["poster.approvalStatus"]).toBe("approved");
    expect(capturedJob.status).toBe("active");
  });
});
