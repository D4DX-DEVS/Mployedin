/**
 * @jest-environment node
 *
 * Behavioural cover for the server-side entitlement gates, one representative
 * endpoint per entitlement, driven through the real withAuth + withSubscription
 * stack with the enforcement flag ON. The client <FeatureGate> is not in the
 * loop at all — every request here is a direct API call, which is exactly the
 * bypass the server has to hold against.
 *
 * Per entitlement:
 *   allowed plan · disallowed plan · no subscription · expired subscription ·
 *   unauthorized role · direct-call bypass with a disallowed plan · staff bypass
 */

import { NextRequest } from "next/server";

jest.mock("@/lib/db/mongoose", () => ({
  __esModule: true,
  default: jest.fn().mockResolvedValue(undefined),
  connectDB: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/auth/config", () => ({ auth: jest.fn() }));

jest.mock("@/lib/subscription/enforcementFlag", () => ({
  isSubscriptionEnforcementEnabled: jest.fn().mockResolvedValue(true),
  clearSubscriptionEnforcementCache: jest.fn(),
}));

jest.mock("@/lib/subscription/gracePeriod", () => ({
  isInGracePeriod: jest.fn().mockResolvedValue(false),
  getGracePeriodEmployerLimits: jest.fn(),
  getGracePeriodJobSeekerLimits: jest.fn(),
}));

jest.mock("@/lib/audit/log", () => ({
  actorFromCtx: jest.fn((ctx: { userId: string; role: string }) => ({ userId: ctx.userId, role: ctx.role })),
  logActivity: jest.fn().mockResolvedValue(undefined),
}));

const subscriptionFindOne = jest.fn();
jest.mock("@/models/Subscription", () => ({
  __esModule: true,
  default: {
    findOne: jest.fn((...args: unknown[]) => subscriptionFindOne(...args)),
    findOneAndUpdate: jest.fn(),
    updateOne: jest.fn(),
  },
}));

const employerFindOneLean = jest.fn();
const employerFindOneAndUpdate = jest.fn();
jest.mock("@/models/Employer", () => {
  const model = {
    findOne: jest.fn(() => ({
      select: () => ({ lean: employerFindOneLean }),
      lean: employerFindOneLean,
    })),
    findOneAndUpdate: jest.fn((...args: unknown[]) => employerFindOneAndUpdate(...args)),
  };
  return { __esModule: true, Employer: model, default: model };
});

const commTemplateCreate = jest.fn();
jest.mock("@/models/CommTemplate", () => ({
  __esModule: true,
  default: { create: jest.fn((payload: unknown) => commTemplateCreate(payload)) },
}));

const scorecardFindById = jest.fn();
jest.mock("@/models/Scorecard", () => ({
  __esModule: true,
  default: { findById: jest.fn((...args: unknown[]) => scorecardFindById(...args)) },
}));

const careerPageFindOne = jest.fn();
jest.mock("@/models/CareerPage", () => ({
  __esModule: true,
  default: { findOne: jest.fn((...args: unknown[]) => careerPageFindOne(...args)) },
}));

 
const { auth } = require("@/lib/auth/config") as { auth: jest.Mock };

const ROUTE_CTX = { params: Promise.resolve({}) };
const EMPLOYER_ID = "507f1f77bcf86cd799439021";
const SCORECARD_ID = "507f1f77bcf86cd799439031";

const session = (role: string, id = "u1") => ({ user: { id, role, locale: "en" } });

/** An active subscription whose plan grants the listed toggles. */
function activeSubWith(limits: Record<string, unknown>) {
  return {
    _id: "sub1",
    userId: "u1",
    targetRole: "employer",
    status: "active",
    planSnapshot: { name: "Test", tier: 1, employerLimits: limits },
    usage: {},
  };
}

/** Subscription.findOne is called with { status: "active" } — an expired row never matches. */
function seedSubscription(sub: Record<string, unknown> | null) {
  subscriptionFindOne.mockImplementation((filter: { status?: string }) =>
    Promise.resolve(sub && filter?.status === "active" && sub.status === "active" ? sub : null),
  );
}

interface Scenario {
  entitlement: string;
  method: string;
  path: string;
  body: Record<string, unknown>;
  /** A plan that includes the entitlement. */
  allowed: Record<string, unknown>;
  /** A plan that does not. */
  disallowed: Record<string, unknown>;
  /** Route module + export. */
  route: () => Promise<Record<string, unknown>>;
  exportName: string;
  /** Model state that lets the real handler succeed once the gate passes. */
  arrange: () => void;
  successStatus: number;
}

const SCENARIOS: Scenario[] = [
  {
    entitlement: "commTemplates",
    method: "POST",
    path: "/api/employers/comm-templates",
    body: { name: "Regret", type: "rejection", subject: "Thanks", body: "We went another way." },
    allowed: { commTemplates: true },
    disallowed: { commTemplates: false },
    route: () => import("@/app/api/employers/comm-templates/route"),
    exportName: "POST",
    arrange: () => {
      employerFindOneLean.mockResolvedValue({ _id: EMPLOYER_ID });
      commTemplateCreate.mockImplementation(async (p: Record<string, unknown>) => ({ _id: "tpl1", ...p }));
    },
    successStatus: 201,
  },
  {
    entitlement: "matchingWeightCustomization",
    method: "PATCH",
    path: "/api/employers/matching-weights",
    body: { weights: { skills: 40, experience: 30, location: 30 } },
    allowed: { matchingWeightCustomization: true },
    disallowed: { matchingWeightCustomization: false },
    route: () => import("@/app/api/employers/matching-weights/route"),
    exportName: "PATCH",
    arrange: () => {
      employerFindOneAndUpdate.mockResolvedValue({});
    },
    successStatus: 200,
  },
  {
    entitlement: "workflowCustomization",
    method: "PATCH",
    path: "/api/employers/workflow",
    body: {
      stages: [{ id: "applied", label: "Applied", enabled: true, autoProgress: false, order: 0 }],
      settings: { aiAutoScreen: true, notifyOnStageChange: true, autoRejectBelow: 40 },
    },
    allowed: { workflowCustomization: true },
    disallowed: { workflowCustomization: false },
    route: () => import("@/app/api/employers/workflow/route"),
    exportName: "PATCH",
    arrange: () => {
      employerFindOneAndUpdate.mockResolvedValue({});
    },
    successStatus: 200,
  },
  {
    entitlement: "scorecardEvaluations",
    method: "PATCH",
    path: `/api/scorecards/${SCORECARD_ID}`,
    body: { recommendation: "yes" },
    allowed: { scorecardEvaluations: true },
    disallowed: { scorecardEvaluations: false },
    route: () => import("@/app/api/scorecards/[id]/route"),
    exportName: "PATCH",
    arrange: () => {
      employerFindOneLean.mockResolvedValue({ _id: EMPLOYER_ID });
      scorecardFindById.mockResolvedValue({
        _id: SCORECARD_ID,
        employerId: EMPLOYER_ID,
        scores: {},
        save: jest.fn().mockResolvedValue(undefined),
      });
    },
    successStatus: 200,
  },
  {
    entitlement: "brandedCompanyPage",
    method: "PATCH",
    path: "/api/career-pages",
    body: { title: "Careers at Acme" },
    allowed: { brandedCompanyPage: true },
    disallowed: { brandedCompanyPage: false },
    route: () => import("@/app/api/career-pages/route"),
    exportName: "PATCH",
    arrange: () => {
      employerFindOneLean.mockResolvedValue({ _id: EMPLOYER_ID, companyName: "Acme" });
      careerPageFindOne.mockResolvedValue({
        _id: "page1",
        employerId: EMPLOYER_ID,
        theme: {},
        save: jest.fn().mockResolvedValue(undefined),
      });
    },
    successStatus: 200,
  },
];

function requestFor(s: Scenario) {
  return new NextRequest(`http://localhost:3888${s.path}`, {
    method: s.method,
    body: JSON.stringify(s.body),
    headers: { "content-type": "application/json" },
  });
}

async function call(s: Scenario) {
  const mod = await s.route();
  const params = s.path.includes(SCORECARD_ID) ? { params: Promise.resolve({ id: SCORECARD_ID }) } : ROUTE_CTX;
  type Handler = (req: NextRequest, ctx: unknown) => Promise<Response>;
  return (mod[s.exportName] as Handler)(requestFor(s), params);
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe.each(SCENARIOS)("$entitlement — $method $path", (s) => {
  beforeEach(() => {
    s.arrange();
  });

  test("allowed plan reaches the handler", async () => {
    auth.mockResolvedValue(session("employer"));
    seedSubscription(activeSubWith(s.allowed));
    const res = await call(s);
    expect(res.status).toBe(s.successStatus);
  });

  test("disallowed plan is refused with FEATURE_DISABLED", async () => {
    auth.mockResolvedValue(session("employer"));
    seedSubscription(activeSubWith(s.disallowed));
    const res = await call(s);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toBe("FEATURE_DISABLED");
    expect(body.feature).toBe(s.entitlement);
  });

  test("no subscription (past grace) is refused with SUBSCRIPTION_REQUIRED", async () => {
    auth.mockResolvedValue(session("employer"));
    seedSubscription(null);
    const res = await call(s);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("SUBSCRIPTION_REQUIRED");
  });

  test("expired subscription is refused even though its plan included the feature", async () => {
    auth.mockResolvedValue(session("employer"));
    seedSubscription({ ...activeSubWith(s.allowed), status: "expired" });
    const res = await call(s);
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("SUBSCRIPTION_REQUIRED");
  });

  test("unauthorized role is refused and the handler never runs", async () => {
    // A job seeker is stopped by the permission matrix on employer-resource
    // routes, and by the role check inside the handler on the rest — either
    // way the subscription is irrelevant: even an "allowed" plan gets a 403.
    auth.mockResolvedValue(session("job_seeker", "js1"));
    seedSubscription(activeSubWith(s.allowed));
    const res = await call(s);
    expect(res.status).toBe(403);
    expect(commTemplateCreate).not.toHaveBeenCalled();
    expect(employerFindOneAndUpdate).not.toHaveBeenCalled();
  });

  test("direct API call with the UI gate bypassed still fails on a disallowed plan", async () => {
    // No <FeatureGate> in this test at all — this *is* the bypass attempt.
    auth.mockResolvedValue(session("employer"));
    seedSubscription(activeSubWith(s.disallowed));
    const res = await call(s);
    expect(res.status).toBe(403);
    // and the handler's side effects never ran
    expect(commTemplateCreate).not.toHaveBeenCalled();
    expect(employerFindOneAndUpdate).not.toHaveBeenCalled();
  });

  // Staff roles are not subscription customers (SUBSCRIPTION-MODULE-GUIDE §6.2):
  // the gate never consults a subscription for them. Whether the handler then
  // accepts the call is the permission matrix's decision, not the plan's.
  test.each(["admin", "super_agent", "agent"])("%s is never subscription-gated", async (role) => {
    auth.mockResolvedValue(session(role, `${role}1`));
    seedSubscription(null);
    await call(s);
    expect(subscriptionFindOne).not.toHaveBeenCalled();
  });
});
