/**
 * @jest-environment node
 *
 * Every plan entitlement that has a server surface must be enforced on that
 * surface, not just hidden by the client <FeatureGate>. This suite pins the
 * endpoint → entitlement map: withSubscription is replaced by a spy that tags
 * the wrapped handler, withAuth passes through, and each route module's
 * exports are inspected. A gate that is dropped, or attached to the wrong
 * feature, fails here.
 *
 * Reads deliberately left open (job form, applications board and scorecard
 * history all consume them on every plan) are asserted as ungated so a future
 * change that closes them is a conscious one.
 */

type Check = { type: string; feature: string };
type Tagged = ((...args: unknown[]) => unknown) & { __gate?: Check };

jest.mock("@/lib/subscription/withSubscription", () => ({
  withSubscription: jest.fn((handler: Tagged, check: Check) => {
    const wrapped: Tagged = (...args: unknown[]) => handler(...args);
    wrapped.__gate = check;
    return wrapped;
  }),
}));

jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: jest.fn((handler: unknown) => handler),
}));

jest.mock("@/lib/db/mongoose", () => ({
  __esModule: true,
  default: jest.fn().mockResolvedValue(undefined),
  connectDB: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/audit/log", () => ({
  actorFromCtx: jest.fn(),
  logActivity: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/notifications/trigger", () => ({
  notifyScorecardSubmitted: jest.fn(),
  notify: jest.fn(),
  notifyRejected: jest.fn(),
  notifyStatusChange: jest.fn(),
  notifyOfferMade: jest.fn(),
}));

jest.mock("@/lib/communications/email", () => ({
  sendEmail: jest.fn(),
  EmailTemplates: {},
}));

jest.mock("@/lib/security/rateLimit", () => ({
  checkRateLimit: jest.fn().mockResolvedValue({ allowed: true }),
  RATE_LIMIT_CONFIGS: { bulk: {} },
}));

jest.mock("@/lib/subscription/featureGate", () => ({
  enforceFeatureGate: jest.fn(),
}));

// Only validateBody is stubbed (the bulk body below is deliberately minimal);
// the real commonSchemas must stay, every route's zod schema builds from them.
jest.mock("@/lib/validators", () => ({
  ...jest.requireActual("@/lib/validators"),
  validateBody: jest.fn(async (req: Request) => req.json()),
}));
jest.mock("@/lib/validators/applications", () => ({ bulkActionSchema: {} }));

jest.mock("@/models/Employer", () => ({
  __esModule: true,
  Employer: { findOne: jest.fn(() => ({ select: () => ({ lean: () => Promise.resolve({ _id: "emp1" }) }) })), findById: jest.fn() },
  default: { findOne: jest.fn(), findById: jest.fn() },
}));
jest.mock("@/models/CommTemplate", () => ({ __esModule: true, default: { findById: jest.fn() } }));
// The bulk route resolves the selected applications before it reaches the
// template branch, so the query chain has to yield one in-scope row.
jest.mock("@/models/Application", () => {
  const row = { _id: "a1", employerId: "emp1", status: "applied", statusHistory: [], jobSeekerId: { userId: {} }, jobId: {} };
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.populate = () => chain;
  chain.then = (resolve: (v: unknown[]) => void) => resolve([row]);
  return { __esModule: true, default: { find: jest.fn(() => chain) } };
});
jest.mock("@/models/JobSeeker", () => ({ __esModule: true, default: {} }));
jest.mock("@/models/Agent", () => ({ __esModule: true, default: {} }));
jest.mock("@/lib/auth/agentRestrictions", () => ({
  getSuperAgentEmployerIds: jest.fn(),
  getScopedEmployerIds: jest.fn(),
}));

const gateOf = (fn: unknown): string | undefined => (fn as Tagged).__gate?.feature;

async function load(path: string) {
  return import(path) as Promise<Record<string, Tagged>>;
}

describe("commTemplates", () => {
  test("every template CRUD handler is gated", async () => {
    const list = await load("@/app/api/employers/comm-templates/route");
    expect(gateOf(list.GET)).toBe("commTemplates");
    expect(gateOf(list.POST)).toBe("commTemplates");

    const one = await load("@/app/api/employers/comm-templates/[id]/route");
    expect(gateOf(one.GET)).toBe("commTemplates");
    expect(gateOf(one.PATCH)).toBe("commTemplates");
    expect(gateOf(one.DELETE)).toBe("commTemplates");
  });

  test("applying a template in a bulk send is gated inline and its verdict is returned", async () => {
    const { enforceFeatureGate } = jest.requireMock("@/lib/subscription/featureGate") as { enforceFeatureGate: jest.Mock };
    const { NextResponse, NextRequest } = await import("next/server");
    const denied = NextResponse.json({ error: "FEATURE_DISABLED" }, { status: 403 });
    enforceFeatureGate.mockResolvedValueOnce(denied);

    const { POST } = await load("@/app/api/applications/bulk/route");
    const req = new NextRequest("http://localhost/api/applications/bulk", {
      method: "POST",
      body: JSON.stringify({ applicationIds: ["a1"], action: "send_message", params: { templateId: "tpl1" } }),
      headers: { "content-type": "application/json" },
    });
    const res = (await POST(req, { userId: "u1", role: "employer", locale: "en" })) as Response;

    expect(enforceFeatureGate).toHaveBeenCalledWith("u1", "employer", { type: "toggle", feature: "commTemplates" });
    expect(res.status).toBe(403);
  });

  test("a bulk send without a template does not touch the gate", async () => {
    const { enforceFeatureGate } = jest.requireMock("@/lib/subscription/featureGate") as { enforceFeatureGate: jest.Mock };
    enforceFeatureGate.mockClear();
    const { NextRequest } = await import("next/server");

    const { POST } = await load("@/app/api/applications/bulk/route");
    const req = new NextRequest("http://localhost/api/applications/bulk", {
      method: "POST",
      body: JSON.stringify({ applicationIds: ["a1"], action: "send_message", params: { messageContent: "hi" } }),
      headers: { "content-type": "application/json" },
    });
    // Past the gate the handler hits unmocked models; that throw is irrelevant here.
    await (POST(req, { userId: "u1", role: "employer", locale: "en" }) as Promise<unknown>).catch(() => undefined);

    expect(enforceFeatureGate).not.toHaveBeenCalled();
  });
});

describe("matchingWeightCustomization", () => {
  test("writes are gated, reads stay open for the job form", async () => {
    const weights = await load("@/app/api/employers/matching-weights/route");
    expect(gateOf(weights.PATCH)).toBe("matchingWeightCustomization");
    expect(gateOf(weights.GET)).toBeUndefined();

    const templates = await load("@/app/api/employers/matching-weight-templates/route");
    expect(gateOf(templates.POST)).toBe("matchingWeightCustomization");
    expect(gateOf(templates.GET)).toBeUndefined();

    const template = await load("@/app/api/employers/matching-weight-templates/[id]/route");
    expect(gateOf(template.PATCH)).toBe("matchingWeightCustomization");
    expect(gateOf(template.DELETE)).toBe("matchingWeightCustomization");
    expect(gateOf(template.GET)).toBeUndefined();

    const perJob = await load("@/app/api/jobs/[id]/matching-weights/route");
    expect(gateOf(perJob.PATCH)).toBe("matchingWeightCustomization");
    expect(gateOf(perJob.GET)).toBeUndefined();
  });
});

describe("workflowCustomization", () => {
  test("writes are gated, reads stay open for the applications board", async () => {
    const workflow = await load("@/app/api/employers/workflow/route");
    expect(gateOf(workflow.PATCH)).toBe("workflowCustomization");
    expect(gateOf(workflow.GET)).toBeUndefined();

    const templates = await load("@/app/api/employers/workflow-templates/route");
    expect(gateOf(templates.POST)).toBe("workflowCustomization");
    expect(gateOf(templates.GET)).toBeUndefined();

    const template = await load("@/app/api/employers/workflow-templates/[id]/route");
    expect(gateOf(template.PATCH)).toBe("workflowCustomization");
    expect(gateOf(template.DELETE)).toBe("workflowCustomization");
    expect(gateOf(template.GET)).toBeUndefined();

    const perJob = await load("@/app/api/jobs/[id]/workflow/route");
    expect(gateOf(perJob.PATCH)).toBe("workflowCustomization");
    expect(gateOf(perJob.GET)).toBeUndefined();
  });
});

describe("scorecardEvaluations", () => {
  test("submitting and editing evaluations is gated; history reads stay open", async () => {
    const list = await load("@/app/api/scorecards/route");
    expect(gateOf(list.POST)).toBe("scorecardEvaluations");
    expect(gateOf(list.GET)).toBeUndefined();

    const one = await load("@/app/api/scorecards/[id]/route");
    expect(gateOf(one.PATCH)).toBe("scorecardEvaluations");
    expect(gateOf(one.GET)).toBeUndefined();

    const interview = await load("@/app/api/interviews/[id]/scorecard/route");
    expect(gateOf(interview.POST)).toBe("scorecardEvaluations");
    expect(gateOf(interview.GET)).toBeUndefined();

    const consensus = await load("@/app/api/scorecards/consensus/route");
    expect(gateOf(consensus.GET)).toBeUndefined();
  });
});

describe("brandedCompanyPage", () => {
  test("building and editing the page is gated; reading it is not", async () => {
    const pages = await load("@/app/api/career-pages/route");
    expect(gateOf(pages.POST)).toBe("brandedCompanyPage");
    expect(gateOf(pages.PATCH)).toBe("brandedCompanyPage");
    expect(gateOf(pages.GET)).toBeUndefined();
  });
});
