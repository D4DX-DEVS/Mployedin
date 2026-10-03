/**
 * @jest-environment node
 *
 * POST /api/jobs/[id]/apply used to send the seeker its own confirmation
 * ("Application received — <job> at <company>") and also call
 * notifyApplicationReceived with email off. That direct mail was English only,
 * had no link, did not escape its HTML and ignored the seeker's notification
 * preferences and any admin override. The orchestrator copy is localized,
 * linked, escaped and gated by both, and goes to the same signed-in recipient,
 * so the direct mail is gone and notify() keeps email on: one confirmation, the
 * better one.
 */
import { NextRequest } from "next/server";

const JOB = "650000000000000000000010";
const EMP = "650000000000000000000020";
const EMP_USER = "650000000000000000000021";
const SEEKER = "650000000000000000000030";
const SEEKER_USER = "650000000000000000000031";
const APP = "650000000000000000000040";

jest.mock("@/lib/auth/withAuth", () => ({
  withAuth:
    (h: (req: NextRequest, ctx: unknown, params?: Record<string, string>) => Promise<Response>) =>
    (req: NextRequest) =>
      h(req, { userId: SEEKER_USER, role: "job_seeker", locale: "en" }, { id: JOB }),
}));
jest.mock("@/lib/subscription/withSubscription", () => ({ withSubscription: (h: unknown) => h }));
jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/security/rateLimit", () => ({ checkRateLimitDual: jest.fn(async () => ({ allowed: true, resetAt: 0 })) }));
jest.mock("@/lib/audit/log", () => ({ logActivity: jest.fn(), actorFromCtx: jest.fn(() => ({})) }));
jest.mock("@/lib/logger", () => ({ __esModule: true, default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
jest.mock("@/lib/inngest/client", () => ({ inngest: { send: jest.fn().mockResolvedValue(undefined) } }));
jest.mock("@/lib/behaviorSignals", () => ({ computeBehaviorSignals: () => ({ signals: {}, score: 0 }) }));
const sendEmail = jest.fn().mockResolvedValue({ messageId: "m" });
jest.mock("@/lib/communications/email", () => ({ sendEmail: (...a: unknown[]) => sendEmail(...a) }));
const notifyApplicationReceived = jest.fn().mockResolvedValue(undefined);
jest.mock("@/lib/notifications/trigger", () => ({
  notifyApplicationReceived: (...a: unknown[]) => notifyApplicationReceived(...a),
}));

/** What the job, the seeker profile and the employer's user hold; the escaping test swaps in markup. */
const stored = { jobTitle: "Nurse", seekerName: "Sara Ali", employerName: "HR" };

function chain<T>(result: T) {
  const c: Record<string, unknown> = {};
  c.select = () => c;
  c.lean = async () => result;
  return c;
}

jest.mock("@/models/Job", () => ({
  __esModule: true,
  default: {
    findOne: () => chain({ _id: JOB, title: stored.jobTitle, employerId: EMP, status: "active", screeningQuestions: [], applicantIds: [] }),
    updateOne: jest.fn().mockResolvedValue({}),
  },
}));
jest.mock("@/models/JobSeeker", () => ({
  __esModule: true,
  default: { findOne: () => chain({ _id: SEEKER, fullName: stored.seekerName, documents: [] }) },
}));
jest.mock("@/models/User", () => ({
  __esModule: true,
  default: {
    findById: (id: string) =>
      chain(id === SEEKER_USER ? { email: "sara@example.com", name: "Sara" } : { email: "hr@acme.example.com", name: stored.employerName }),
  },
}));
jest.mock("@/models/Application", () => ({
  __esModule: true,
  default: { findOne: () => chain(null), create: jest.fn(async () => ({ _id: APP })) },
}));
jest.mock("@/models/Employer", () => ({
  __esModule: true,
  default: { findById: () => chain({ companyName: "Acme", userId: EMP_USER, notificationPrefs: {} }) },
}));
jest.mock("@/models/ActivityEvent", () => ({
  ActivityEvent: { create: jest.fn().mockResolvedValue({}) },
  ACTIVITY_PRIORITY: { application_update: 1 },
}));

import { POST as _POST } from "@/app/api/jobs/[id]/apply/route";

const POST = _POST as unknown as (req: NextRequest) => Promise<Response>;

const apply = () => POST(new NextRequest(`http://localhost/api/jobs/${JOB}/apply`, { method: "POST" }));

beforeEach(() => {
  jest.clearAllMocks();
  Object.assign(stored, { jobTitle: "Nurse", seekerName: "Sara Ali", employerName: "HR" });
});

describe("easy-apply confirmation", () => {
  it("sends the seeker no direct confirmation email", async () => {
    const res = await apply();
    expect(res.status).toBe(201);
    expect(sendEmail).not.toHaveBeenCalledWith(expect.objectContaining({ to: "sara@example.com" }));
  });

  it("leaves the seeker's email to notify(), with email on", async () => {
    await apply();
    // No options argument: sendEmail defaults to on, so the orchestrator mails
    // the localized, linked copy (subject to the seeker's preferences).
    expect(notifyApplicationReceived).toHaveBeenCalledTimes(1);
    expect(notifyApplicationReceived).toHaveBeenCalledWith(SEEKER_USER, "", "Nurse", "Acme", APP);
  });

  // The seeker types their own name and the employer's inbox renders it: markup in it must arrive as text.
  it("escapes the applicant's name, the job title and the employer's name in the employer's email", async () => {
    stored.seekerName = 'Sara <a href="https://evil.example/login">Verify your account</a>';
    stored.jobTitle = "Nurse <img src=x onerror=alert(1)>";
    stored.employerName = "HR <b>Team</b>";
    await apply();
    const { html } = sendEmail.mock.calls[0][0] as { html: string };
    expect(html).not.toMatch(/<a\s|<img|<b>/);
    expect(html).toContain("<strong>Sara &lt;a href=&quot;https://evil.example/login&quot;&gt;Verify your account&lt;/a&gt;</strong>");
    expect(html).toContain("<strong>Nurse &lt;img src=x onerror=alert(1)&gt;</strong>");
    expect(html).toContain("Hi HR &lt;b&gt;Team&lt;/b&gt;,");
  });

  it("still alerts the employer by direct email", async () => {
    await apply();
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "hr@acme.example.com", subject: "New applicant for Nurse — Sara Ali" }),
    );
  });
});
