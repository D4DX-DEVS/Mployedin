/**
 * @jest-environment node
 *
 * Bulk stage moves skipped the guards a single move has (audit FUNC-010):
 *  - a move back to an earlier stage over a booked interview: the single PATCH
 *    answers 409 so the person sees the interview; bulk moved them anyway and
 *    left the interview open. Decision (owner, 2026-10-12): skip those
 *    candidates, move the rest, and report who was skipped.
 *  - a bulk rejection needed no reason; every other rejection path records one.
 */
import { NextRequest } from "next/server";

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (h: (req: NextRequest, ctx: unknown) => Promise<Response>) => (req: NextRequest) =>
    h(req, { userId: "650000000000000000000001", role: "admin", locale: "en" }),
}));
jest.mock("@/lib/security/rateLimit", () => ({
  checkRateLimit: jest.fn(async () => ({ allowed: true })),
  RATE_LIMIT_CONFIGS: { bulk: {} },
}));
jest.mock("@/lib/audit/log", () => ({ logActivity: jest.fn().mockResolvedValue(undefined), actorFromCtx: () => ({}) }));
jest.mock("@/lib/logger", () => ({ __esModule: true, default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock("@/lib/notifications/trigger", () => ({
  notify: jest.fn().mockResolvedValue(undefined),
  notifyRejected: jest.fn().mockResolvedValue(undefined),
  notifyStatusChange: jest.fn().mockResolvedValue(undefined),
  notifyOfferMade: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/lib/communications/email", () => ({
  sendEmail: jest.fn().mockResolvedValue({ messageId: "m" }),
  EmailTemplates: { statusUpdate: () => ({ subject: "s", html: "<p>h</p>" }) },
}));
jest.mock("@/models/CommTemplate", () => ({ __esModule: true, default: { findById: jest.fn() } }));
jest.mock("@/models/Employer", () => ({
  __esModule: true,
  Employer: { find: jest.fn(() => ({ select: () => ({ lean: async () => [] }) })), findOne: jest.fn(), findById: jest.fn() },
}));
jest.mock("@/models/Agent", () => ({ __esModule: true, default: { findOne: jest.fn() } }));
jest.mock("@/lib/auth/agentRestrictions", () => ({ getSuperAgentEmployerIds: jest.fn(async () => []) }));
const closeOpenInterviewsForAdvance = jest.fn().mockResolvedValue({ completed: 0, cancelled: 0 });
jest.mock("@/lib/hiring/closeOpenInterviews", () => ({
  closesOpenInterviews: jest.requireActual("@/lib/hiring/closeOpenInterviews").closesOpenInterviews,
  closeOpenInterviewsForAdvance: (...a: unknown[]) => closeOpenInterviewsForAdvance(...a),
}));

const A = "650000000000000000000101"; // interviewing, holds a booked interview
const B = "650000000000000000000102"; // interviewing, no interview booked
const C = "650000000000000000000103"; // at offer, holds an interview

type App = { _id: string; status: string; employerId: string; jobSeekerId: unknown; jobId: unknown; statusHistory: unknown[]; save: jest.Mock };
let apps: App[];
const mkApp = (_id: string, status: string): App => ({
  _id,
  status,
  employerId: "650000000000000000000200",
  jobSeekerId: { userId: { _id: "650000000000000000000300", email: "x@example.com" }, fullName: "Sara" },
  jobId: { title: "Nurse" },
  statusHistory: [],
  save: jest.fn().mockResolvedValue(undefined),
});
jest.mock("@/models/Application", () => ({
  __esModule: true,
  default: { find: jest.fn(() => ({ select: () => ({ populate: () => ({ populate: () => Promise.resolve(apps) }) }) })) },
}));

let heldBy: string[] = [];
const interviewFind = jest.fn((query: { applicationId: { $in: string[] }; status: { $in: string[] } }) => ({
  select: () => ({
    lean: async () =>
      heldBy
        .filter((id) => query.applicationId.$in.map(String).includes(id))
        .map((id) => ({ applicationId: id })),
  }),
}));
jest.mock("@/models/Interview", () => ({ __esModule: true, default: { find: (q: never) => interviewFind(q) } }));

import { POST as _POST } from "@/app/api/applications/bulk/route";
import { bulkActionSchema } from "@/lib/validators/applications";
const POST = _POST as unknown as (req: NextRequest) => Promise<Response>;

const bulk = (body: Record<string, unknown>) =>
  POST(new NextRequest("http://localhost/api/applications/bulk", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }));

beforeEach(() => {
  jest.clearAllMocks();
  apps = [mkApp(A, "interview_scheduled"), mkApp(B, "interview_scheduled"), mkApp(C, "offer")];
  heldBy = [A, C];
});

describe("bulk move back over a booked interview", () => {
  it("skips candidates holding one, moves the rest, and says who was skipped", async () => {
    const res = await bulk({ applicationIds: [A, B, C], action: "move_stage", params: { targetStage: "shortlisted", notifyCandidate: false } });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toMatchObject({ processed: 1, total: 3, skippedOpenInterview: [A, C] });
    expect(apps.map((a) => a.status)).toEqual(["interview_scheduled", "shortlisted", "offer"]);
    expect(apps[0].save).not.toHaveBeenCalled();
    expect(apps[2].save).not.toHaveBeenCalled();
  });

  it("only looks for interviews when the move is backwards", async () => {
    const res = await bulk({ applicationIds: [A, B], action: "move_stage", params: { targetStage: "offer", notifyCandidate: false } });

    expect((await res.json()).skippedOpenInterview).toBeUndefined();
    expect(interviewFind).not.toHaveBeenCalled();
    expect(apps.slice(0, 2).map((a) => a.status)).toEqual(["offer", "offer"]);
  });

  it("a rejection is not a move back: everyone is rejected and their slots settled", async () => {
    const res = await bulk({ applicationIds: [A, B, C], action: "reject", params: { rejectionReason: "Role filled", notifyCandidate: false } });

    expect((await res.json()).processed).toBe(3);
    expect(closeOpenInterviewsForAdvance).toHaveBeenCalledTimes(3);
  });
});

describe("bulk rejection reason", () => {
  it("is required", () => {
    expect(bulkActionSchema.safeParse({ applicationIds: [A], action: "reject" }).success).toBe(false);
    expect(bulkActionSchema.safeParse({ applicationIds: [A], action: "reject", params: { rejectionReason: "   " } }).success).toBe(false);
    expect(bulkActionSchema.safeParse({ applicationIds: [A], action: "reject", params: { rejectionReason: "Role filled" } }).success).toBe(true);
  });

  it("is not asked for other actions", () => {
    expect(bulkActionSchema.safeParse({ applicationIds: [A], action: "move_stage", params: { targetStage: "shortlisted" } }).success).toBe(true);
  });
});
