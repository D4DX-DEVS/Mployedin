/**
 * @jest-environment node
 *
 * Any stage could be picked at any time, so a candidate went Shortlisted →
 * Hired in one click with no offer on record (audit FUNC-006, reproduced live
 * 2026-10-12). Owner decision (2026-10-12): Hired needs an accepted offer.
 * Accepting an offer moves the application to Hired by itself; a manual move
 * to Hired is refused (single move, Copilot) or skipped and reported (bulk)
 * unless an accepted offer is on record.
 */
import { NextRequest } from "next/server";

const USER_ID = "64b300000000000000000001";
const APP_ID = "64b300000000000000000002";
const JOB_ID = "64b300000000000000000003";
const EMPLOYER_ID = "64b300000000000000000004";
const SEEKER_ID = "64b300000000000000000005";
const APP_2 = "64b300000000000000000006";

jest.mock("@/lib/db/mongoose", () => ({ __esModule: true, connectDB: jest.fn().mockResolvedValue(undefined), default: jest.fn() }));
jest.mock("@/lib/audit/log", () => ({ logActivity: jest.fn().mockResolvedValue(undefined), actorFromCtx: () => ({}) }));
jest.mock("@/lib/logger", () => ({ __esModule: true, default: { error: jest.fn(), warn: jest.fn(), info: jest.fn() } }));
jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: (req: NextRequest, ctx: unknown, params?: Record<string, string>) => Promise<Response>) =>
    async (req: NextRequest, context?: { params: Promise<Record<string, string>> }) =>
      handler(req, { userId: USER_ID, role: "employer", locale: "en" }, context ? await context.params : {}),
}));
jest.mock("@/lib/notifications/trigger", () => {
  const resolved = () => jest.fn(() => Promise.resolve(undefined));
  return {
    notify: resolved(), notifyInterviewSelected: resolved(), notifyOfferMade: resolved(),
    notifyRejected: resolved(), notifyStatusChange: resolved(), notifyInterviewScheduled: resolved(),
  };
});
jest.mock("@/lib/communications/email", () => ({
  sendEmail: jest.fn().mockResolvedValue({ messageId: "m" }),
  EmailTemplates: { statusUpdate: () => ({ subject: "s", html: "<p>h</p>" }) },
}));
jest.mock("@/lib/security/rateLimit", () => ({ checkRateLimit: jest.fn(async () => ({ allowed: true })), RATE_LIMIT_CONFIGS: { bulk: {} } }));
jest.mock("@/lib/permissions/team", () => ({ memberMayAccessJob: jest.fn().mockResolvedValue(true) }));
jest.mock("@/lib/hiring/closeOpenInterviews", () => ({
  closesOpenInterviews: () => false,
  closeOpenInterviewsForAdvance: jest.fn().mockResolvedValue({ completed: 0, cancelled: 0 }),
}));
jest.mock("@/models/CommTemplate", () => ({ __esModule: true, default: { findById: jest.fn() } }));
jest.mock("@/models/Agent", () => ({ __esModule: true, default: { findOne: jest.fn() } }));
jest.mock("@/lib/auth/agentRestrictions", () => ({ getSuperAgentEmployerIds: jest.fn(async () => []), getSuperAgentScope: jest.fn() }));

function chain<T>(result: T) {
  const c: Record<string, jest.Mock> = {};
  for (const m of ["populate", "sort", "skip", "limit", "select"]) c[m] = jest.fn(() => c);
  c.lean = jest.fn(async () => result);
  return c;
}

const STAGES = [
  { id: "applied", label: "Applied", phase: "applied" },
  { id: "short", label: "Shortlisted", phase: "shortlisted" },
  { id: "offer", label: "Offer", phase: "offer" },
  { id: "joined", label: "Joined", phase: "hired" },
];
type App = Record<string, unknown> & { statusHistory: unknown[]; save: jest.Mock };
let application: App;
let bulkApps: App[];
const mkApp = (_id: string, status: string): App => ({
  _id,
  status,
  employerId: EMPLOYER_ID,
  jobSeekerId: { _id: SEEKER_ID, userId: { _id: "64b300000000000000000041", email: "x@example.com" }, fullName: "Sara" },
  statusHistory: [],
  jobId: { _id: JOB_ID, employerId: EMPLOYER_ID, title: "Accountant", workflow: { stages: STAGES, template: { name: "t", version: 1, source: "custom" } } },
  save: jest.fn().mockResolvedValue(undefined),
});
jest.mock("@/models/Application", () => ({
  __esModule: true,
  default: {
    findById: jest.fn(() => {
      const p = Promise.resolve(application) as Promise<unknown> & { populate?: () => Promise<unknown> };
      p.populate = () => Promise.resolve(application);
      return p;
    }),
    find: jest.fn(() => ({ select: () => ({ populate: () => ({ populate: () => Promise.resolve(bulkApps) }) }) })),
  },
}));
jest.mock("@/models/Employer", () => {
  const model = {
    findOne: jest.fn(() => chain({ _id: EMPLOYER_ID, userId: USER_ID, companyName: "Acme", workflow: null })),
    find: jest.fn(() => ({ select: () => ({ lean: async () => [] }) })),
    findById: jest.fn(() => chain({ companyName: "Acme" })),
  };
  return { __esModule: true, Employer: model, default: model };
});
jest.mock("@/models/JobSeeker", () => ({
  __esModule: true,
  default: { findOne: jest.fn(() => chain({ _id: SEEKER_ID })), findById: jest.fn(() => chain({ _id: SEEKER_ID, userId: "64b300000000000000000041" })) },
}));
jest.mock("@/models/Interview", () => ({ __esModule: true, default: { findOne: jest.fn(() => chain(null)), find: jest.fn(() => chain([])) } }));

/** Applications holding an accepted offer. */
let accepted: string[] = [];
const offerFind = jest.fn((query: { applicationId: { $in: unknown[] } | unknown; status: string }) => {
  const ids = (query.applicationId as { $in?: unknown[] })?.$in?.map(String) ?? [String(query.applicationId)];
  return chain(accepted.filter((id) => ids.includes(id) && query.status === "accepted").map((id) => ({ applicationId: id })));
});
jest.mock("@/models/Offer", () => ({ __esModule: true, default: { find: (q: never) => offerFind(q) } }));

const req = (url: string, body: unknown) =>
  new NextRequest(`http://localhost${url}`, { method: url.includes("bulk") ? "POST" : "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

async function patch(body: unknown) {
  const { PATCH } = await import("@/app/api/applications/[id]/route");
  return PATCH(req(`/api/applications/${APP_ID}`, body), { params: Promise.resolve({ id: APP_ID }) });
}

beforeEach(() => {
  jest.clearAllMocks();
  accepted = [];
  application = mkApp(APP_ID, "shortlisted");
  bulkApps = [mkApp(APP_ID, "offer"), mkApp(APP_2, "offer")];
});

describe("single move to Hired", () => {
  it("is refused without an accepted offer, and nothing is saved", async () => {
    const res = await patch({ status: "hired" });

    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ code: "OFFER_REQUIRED" });
    expect(application.save).not.toHaveBeenCalled();
    expect(application.status).toBe("shortlisted");
  });

  it("is refused through a workflow stage whose phase is Hired too", async () => {
    const res = await patch({ stageId: "joined" });
    expect(res.status).toBe(409);
    expect(application.save).not.toHaveBeenCalled();
  });

  it("goes through once the candidate has accepted an offer", async () => {
    accepted = [APP_ID];
    application.status = "offer";
    const res = await patch({ status: "hired" });

    expect(res.status).toBe(200);
    expect(application.status).toBe("hired");
  });

  it("leaves other moves alone", async () => {
    const res = await patch({ status: "offer" });
    expect(res.status).toBe(200);
    expect(offerFind).not.toHaveBeenCalled();
  });
});

describe("bulk move to Hired", () => {
  it("moves those with an accepted offer and skips and reports the rest", async () => {
    accepted = [APP_ID];
    const { POST } = await import("@/app/api/applications/bulk/route");
    const res = await (POST as unknown as (r: NextRequest) => Promise<Response>)(
      req("/api/applications/bulk", { applicationIds: [APP_ID, APP_2], action: "move_stage", params: { targetStage: "hired", notifyCandidate: false } }),
    );
    const json = await res.json();

    expect(json).toMatchObject({ processed: 1, total: 2, skippedNoOffer: [APP_2] });
    expect(bulkApps.map((a) => a.status)).toEqual(["hired", "offer"]);
    expect(bulkApps[1].save).not.toHaveBeenCalled();
  });
});

describe("Copilot update_application_status", () => {
  it("won't mark Hired without an accepted offer", async () => {
    const { updateApplicationStatusTool } = await import("@/lib/ai/copilot/tools/employer");
    const result = await updateApplicationStatusTool.execute(
      { applicationId: APP_ID, status: "hired" },
      { userId: USER_ID, role: "employer", locale: "en" } as never,
    );

    expect(result).toMatchObject({ ok: false });
    expect(application.save).not.toHaveBeenCalled();
  });
});
