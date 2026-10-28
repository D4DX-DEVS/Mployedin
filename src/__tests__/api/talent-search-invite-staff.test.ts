/**
 * @jest-environment node
 *
 * POST /api/employer/talent-search/invite — now also used by agents from the
 * "matching candidates" list. An agent invites for an assigned employer's
 * job; one invite per candidate per job, whoever sends it.
 */
import { NextRequest, NextResponse } from "next/server";

const USER = "64a000000000000000000001";
const AGENT_ID = "64a000000000000000000002";
const EMPLOYER_ID = "64a000000000000000000003";
const OTHER_EMPLOYER = "64a000000000000000000004";
const JOB_ID = "64a000000000000000000010";
const SEEKER_ID = "64a000000000000000000020";
const SEEKER_USER = "64a000000000000000000021";

let role = "agent";
let senderLocale = "en";
jest.mock("@/lib/db/mongoose", () => ({ __esModule: true, connectDB: jest.fn().mockResolvedValue(undefined), default: jest.fn() }));
const logActivity = jest.fn().mockResolvedValue(undefined);
jest.mock("@/lib/audit/log", () => ({ logActivity: (...a: unknown[]) => logActivity(...a), actorFromCtx: () => ({}) }));
const notify = jest.fn().mockResolvedValue(undefined);
jest.mock("@/lib/notifications/trigger", () => ({ notify: (...a: unknown[]) => notify(...a) }));
jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: (req: NextRequest, ctx: unknown) => Promise<Response>) => async (req: NextRequest) => {
    try {
      return await handler(req, { userId: USER, role, locale: senderLocale });
    } catch (err) {
      if (err instanceof NextResponse) return err;
      throw err;
    }
  },
}));
jest.mock("@/lib/auth/agentRestrictions", () => ({ getSuperAgentBook: jest.fn().mockResolvedValue(null) }));

const lean = (value: unknown) => {
  const c: Record<string, unknown> = {};
  c.select = () => c;
  c.lean = async () => value;
  return c;
};

let jobDoc: Record<string, unknown>;
jest.mock("@/models/Job", () => ({ __esModule: true, default: { findById: jest.fn(() => lean(jobDoc)) } }));
let ownEmployer: Record<string, unknown> | null = null;
jest.mock("@/models/Employer", () => {
  const model = {
    findOne: jest.fn(() => lean(ownEmployer)),
    findById: jest.fn(() => lean({ _id: EMPLOYER_ID, companyName: "Gulf Care Clinic" })),
  };
  return { __esModule: true, Employer: model, default: model };
});
let assigned: string[] = [];
jest.mock("@/models/Agent", () => ({
  __esModule: true,
  default: { findOne: jest.fn(() => lean({ _id: AGENT_ID, assignedEmployerIds: assigned })) },
}));
let seekerVisibility = "visible";
jest.mock("@/models/JobSeeker", () => ({
  __esModule: true,
  default: { findById: jest.fn(() => lean({ _id: SEEKER_ID, userId: SEEKER_USER, profileVisibility: seekerVisibility })) },
}));
let applied = false;
jest.mock("@/models/Application", () => ({ __esModule: true, default: { exists: jest.fn(async () => applied) } }));
let alreadyInvited = false;
const claimJobInvite = jest.fn(async () => (alreadyInvited ? null : "claim1"));
const releaseJobInvite = jest.fn(async () => undefined);
jest.mock("@/lib/jobs/jobInvites", () => ({
  claimJobInvite: (...a: unknown[]) => claimJobInvite(...(a as [])),
  releaseJobInvite: (...a: unknown[]) => releaseJobInvite(...(a as [])),
}));
let rateAllowed = true;
jest.mock("@/lib/security/rateLimit", () => ({ checkRateLimitDual: jest.fn(async () => ({ allowed: rateAllowed, resetAt: Date.now() + 30_000 })) }));

import { POST } from "@/app/api/employer/talent-search/invite/route";

function post() {
  return POST(
    new NextRequest("http://localhost/api/employer/talent-search/invite", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jobSeekerId: SEEKER_ID, jobId: JOB_ID, message: "Your ICU years fit this well." }),
    }),
    {} as never,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  role = "agent";
  senderLocale = "en";
  assigned = [EMPLOYER_ID];
  ownEmployer = null;
  applied = false;
  alreadyInvited = false;
  seekerVisibility = "visible";
  rateAllowed = true;
  jobDoc = { _id: JOB_ID, title: "Staff Nurse", employerId: EMPLOYER_ID, agentId: null, status: "active" };
});

it("lets an agent invite for an assigned employer's job, in the employer's name", async () => {
  const res = await post();
  expect(res.status).toBe(200);
  expect(notify).toHaveBeenCalledWith(
    expect.objectContaining({
      userId: SEEKER_USER,
      type: "application_invite",
      message: expect.stringContaining("Gulf Care Clinic would like you to apply for \"Staff Nurse\""),
      link: `/job-seeker/jobs/${JOB_ID}`,
    }),
  );
  expect(logActivity).toHaveBeenCalledWith(expect.objectContaining({ action: "candidate.invite", resourceId: JOB_ID }));
});

// Rollout check 2026-10-28: an agent working in Arabic invited an English-
// speaking candidate; the stored link carried the agent's /ar/ and the text
// was English only. The candidate's own language must decide both.
it("leaves the language to the candidate, not the sender", async () => {
  senderLocale = "ar";
  expect((await post()).status).toBe(200);
  expect(notify).toHaveBeenCalledWith(
    expect.objectContaining({
      link: `/job-seeker/jobs/${JOB_ID}`,
      titleKey: "applicationInviteTitle",
      bodyKey: "applicationInviteBodyWithMessage",
      params: { companyName: "Gulf Care Clinic", jobTitle: "Staff Nurse", message: "Your ICU years fit this well." },
    }),
  );
});

it("refuses an agent who is not assigned to the job's employer", async () => {
  assigned = [OTHER_EMPLOYER];
  expect((await post()).status).toBe(403);
  expect(notify).not.toHaveBeenCalled();
});

it("does not invite the same candidate to the same job twice", async () => {
  alreadyInvited = true;
  const res = await post();
  expect(res.status).toBe(409);
  expect(claimJobInvite).toHaveBeenCalledWith({ jobId: JOB_ID, jobSeekerId: SEEKER_ID, invitedBy: USER, invitedByRole: "agent" });
  expect(notify).not.toHaveBeenCalled();
});

it("claims the invite before sending, and releases it when the notification fails", async () => {
  notify.mockRejectedValueOnce(new Error("smtp down"));
  const res = await post();
  expect(res.status).toBe(502);
  expect(claimJobInvite.mock.invocationCallOrder[0]).toBeLessThan(notify.mock.invocationCallOrder[0]);
  expect(releaseJobInvite).toHaveBeenCalledWith("claim1");
  expect(logActivity).not.toHaveBeenCalled();
});

it("answers a missing job the same way as someone else's job", async () => {
  const Job = jest.requireMock("@/models/Job").default as { findById: jest.Mock };
  Job.findById.mockReturnValueOnce(lean(null));
  expect((await post()).status).toBe(403);
});

it("still refuses a candidate who already applied", async () => {
  applied = true;
  expect((await post()).status).toBe(409);
});

it("keeps the employer rule: their own job only", async () => {
  role = "employer";
  ownEmployer = { _id: OTHER_EMPLOYER, companyName: "Someone Else" };
  expect((await post()).status).toBe(403);
  ownEmployer = { _id: EMPLOYER_ID, companyName: "Gulf Care Clinic" };
  expect((await post()).status).toBe(200);
});

it("refuses an inactive job", async () => {
  jobDoc = { ...jobDoc, status: "draft" };
  expect((await post()).status).toBe(400);
});

it("lets an admin invite for any job, in the job's employer's name", async () => {
  role = "admin";
  assigned = [];
  expect((await post()).status).toBe(200);
  expect(notify).toHaveBeenCalledWith(expect.objectContaining({ metadata: expect.objectContaining({ companyName: "Gulf Care Clinic" }) }));
  expect(claimJobInvite).toHaveBeenCalledWith(expect.objectContaining({ invitedByRole: "admin" }));
});

describe("employer — Suitable profiles tab", () => {
  beforeEach(() => {
    role = "employer";
    ownEmployer = { _id: EMPLOYER_ID, companyName: "Gulf Care Clinic" };
  });

  it("sends the invite in the company's own name, as an in-app notification plus email", async () => {
    expect((await post()).status).toBe(200);
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ sendEmail: true, metadata: expect.objectContaining({ companyName: "Gulf Care Clinic" }) }),
    );
    expect(claimJobInvite).toHaveBeenCalledWith(expect.objectContaining({ invitedByRole: "employer" }));
  });

  it("refuses a candidate who does not allow employers to find them", async () => {
    seekerVisibility = "hidden";
    expect((await post()).status).toBe(400);
    expect(notify).not.toHaveBeenCalled();
  });

  it("does not invite a candidate an agent already invited to the same job", async () => {
    alreadyInvited = true;
    expect((await post()).status).toBe(409);
    expect(notify).not.toHaveBeenCalled();
  });

  it("caps the send rate", async () => {
    rateAllowed = false;
    expect((await post()).status).toBe(429);
    expect(notify).not.toHaveBeenCalled();
  });

  it("404s an employer account with no company profile", async () => {
    ownEmployer = null;
    expect((await post()).status).toBe(404);
  });
});
