/**
 * @jest-environment node
 *
 * A bulk stage move mails each candidate directly — the employer's own
 * subject and body when they wrote one, the status template otherwise — and
 * also calls the notify helper for the same move. With the orchestrator's dedup
 * fixed, the helper would mail a second copy, so it keeps the in-app row and
 * WhatsApp and leaves the email to the direct one. A rejection has no WhatsApp
 * leg, so it asks for push itself or it would reach the candidate by nothing
 * but the in-app row.
 */
import { NextRequest } from "next/server";

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: (req: NextRequest, ctx: unknown) => Promise<Response>) => async (req: NextRequest) =>
    handler(req, { userId: "admin_user", role: "admin", locale: "en" }),
}));
jest.mock("@/lib/security/rateLimit", () => ({
  checkRateLimit: jest.fn(() => Promise.resolve({ allowed: true, remaining: 10, resetAt: Date.now() + 60000 })),
  RATE_LIMIT_CONFIGS: { bulk: { limit: 5, windowSec: 60 } },
}));
jest.mock("@/lib/validators", () => ({ validateBody: jest.fn(async (req: NextRequest) => req.json()) }));
jest.mock("@/lib/validators/applications", () => ({ bulkActionSchema: {} }));
jest.mock("@/lib/audit/log", () => ({
  logActivity: jest.fn().mockResolvedValue(undefined),
  actorFromCtx: jest.fn(() => ({})),
}));
jest.mock("@/lib/logger", () => ({ __esModule: true, default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock("@/lib/hiring/closeOpenInterviews", () => ({
  advancesPastInterviewing: () => false,
  closeOpenInterviewsForAdvance: jest.fn(),
}));

const notifyRejected = jest.fn().mockResolvedValue(undefined);
const notifyStatusChange = jest.fn().mockResolvedValue(undefined);
const notifyOfferMade = jest.fn().mockResolvedValue(undefined);
jest.mock("@/lib/notifications/trigger", () => ({
  notify: jest.fn().mockResolvedValue(undefined),
  notifyRejected: (...a: unknown[]) => notifyRejected(...a),
  notifyStatusChange: (...a: unknown[]) => notifyStatusChange(...a),
  notifyOfferMade: (...a: unknown[]) => notifyOfferMade(...a),
}));
const sendEmail = jest.fn().mockResolvedValue({ messageId: "m" });
jest.mock("@/lib/communications/email", () => ({
  sendEmail: (...a: unknown[]) => sendEmail(...a),
  EmailTemplates: { statusUpdate: () => ({ subject: "Application Update – Nurse", html: "<p>status</p>" }) },
}));
jest.mock("@/models/CommTemplate", () => ({ __esModule: true, default: { findById: jest.fn() } }));

let app: Record<string, unknown>;
jest.mock("@/models/Application", () => ({
  __esModule: true,
  default: {
    find: jest.fn(() => ({ select: () => ({ populate: () => ({ populate: () => Promise.resolve([app]) }) }) })),
  },
}));
jest.mock("@/models/Employer", () => ({
  __esModule: true,
  Employer: {
    find: jest.fn(() => ({ select: () => ({ lean: async () => [] }) })),
    findOne: jest.fn(),
    findById: jest.fn(),
  },
}));
jest.mock("@/models/Agent", () => ({ __esModule: true, default: { findOne: jest.fn() } }));
jest.mock("@/lib/auth/agentRestrictions", () => ({ getSuperAgentEmployerIds: jest.fn(async () => []) }));

import { POST as _POST } from "@/app/api/applications/bulk/route";

const POST = _POST as unknown as (req: NextRequest) => Promise<Response>;

function bulk(body: Record<string, unknown>) {
  return POST(
    new NextRequest("http://localhost/api/applications/bulk", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ applicationIds: ["app_1"], ...body }),
    }),
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  app = {
    _id: "app_1",
    status: "applied",
    employerId: "emp_1",
    jobSeekerId: { userId: { _id: "seeker_user", email: "sara@example.com", name: "Sara" }, fullName: "Sara Ali" },
    jobId: { title: "Nurse" },
    statusHistory: [],
    save: jest.fn().mockResolvedValue(undefined),
  };
});

describe("bulk stage moves email each candidate once", () => {
  it.each([
    ["a rejection", { action: "reject" }, notifyRejected, ["seeker_user", "Nurse", "app_1", { sendEmail: false, sendPush: true }]],
    ["an offer", { action: "move_stage", params: { targetStage: "offer" } }, notifyOfferMade, ["seeker_user", "Nurse", "MPLOYEDIN", "app_1", { sendEmail: false }]],
    ["any other stage", { action: "move_stage", params: { targetStage: "shortlisted" } }, notifyStatusChange, ["seeker_user", "Nurse", "shortlisted", "app_1", { sendEmail: false }]],
  ])("%s: the direct email goes out and notify() asks for no email copy", async (_label, body, helper, args) => {
    const b = body as { action: string; params?: Record<string, unknown> };
    const res = await bulk({ ...b, params: { ...b.params, notifyCandidate: true } });
    expect(res.status).toBe(200);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "sara@example.com" }));
    expect(helper).toHaveBeenCalledWith(...args);
  });

  it("sends neither when the employer chose not to notify the candidate", async () => {
    await bulk({ action: "reject", params: { notifyCandidate: false } });
    expect(sendEmail).not.toHaveBeenCalled();
    expect(notifyRejected).not.toHaveBeenCalled();
  });
});

// The employer writes the body; the placeholders are filled with values other
// people typed (the candidate's name, a job title). Those values go in as text,
// never as markup: sanitizeHtml keeps links, so it would not catch an <a>.
describe("placeholders in the employer's own email body", () => {
  const NAME = 'Sara <a href="https://evil.example/login">Verify your account</a>';
  beforeEach(() => {
    app.jobSeekerId = { userId: { _id: "seeker_user", email: "sara@example.com", name: "Sara" }, fullName: NAME };
    app.jobId = { title: "Nurse <img src=x>" };
  });

  it("are escaped in a stage-move email", async () => {
    await bulk({ action: "move_stage", params: { targetStage: "shortlisted", notifyCandidate: true, emailSubject: "About {{jobTitle}}", emailBody: "<p>Dear {{candidateName}}, about {{jobTitle}}.</p>" } });
    const { html } = sendEmail.mock.calls[0][0] as { html: string };
    expect(html).not.toMatch(/<a\s|<img/);
    expect(html).toContain("Dear Sara &lt;a href=");
    expect(html).toContain("about Nurse &lt;img src=x&gt;.");
  });

  it("are escaped in a message", async () => {
    await bulk({ action: "send_message", params: { messageContent: "Hello {{candidateName}}" } });
    const { html } = sendEmail.mock.calls[0][0] as { html: string };
    expect(html).not.toMatch(/<a\s/);
    expect(html).toContain("Hello Sara &lt;a href=");
  });
});
