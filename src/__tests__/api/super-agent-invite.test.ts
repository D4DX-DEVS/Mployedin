/**
 * @jest-environment node
 *
 * POST /api/super-agent/invite — a super agent invites a matched candidate to
 * apply. Only super agents, and only for a job in their book (a book
 * employer's job, or one posted by an agent in their scope): the team and
 * territory restriction is decided here on the server, not by what the page
 * offers. Consent, duplicates and the send rate are the shared invite rules.
 */
import { NextRequest, NextResponse } from "next/server";

const USER = "64a000000000000000000001";
const BOOK_AGENT = "64a000000000000000000002";
const EMPLOYER_ID = "64a000000000000000000003";
const OTHER_EMPLOYER = "64a000000000000000000004";
const OTHER_AGENT = "64a000000000000000000005";
const JOB_ID = "64a000000000000000000010";
const SEEKER_ID = "64a000000000000000000020";
const SEEKER_USER = "64a000000000000000000021";

let role = "super_agent";
jest.mock("@/lib/db/mongoose", () => ({ __esModule: true, connectDB: jest.fn().mockResolvedValue(undefined), default: jest.fn() }));
const logActivity = jest.fn().mockResolvedValue(undefined);
jest.mock("@/lib/audit/log", () => ({ logActivity: (...a: unknown[]) => logActivity(...a), actorFromCtx: () => ({}) }));
const notify = jest.fn().mockResolvedValue(undefined);
jest.mock("@/lib/notifications/trigger", () => ({ notify: (...a: unknown[]) => notify(...a) }));
jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: (req: NextRequest, ctx: unknown) => Promise<Response>) => async (req: NextRequest) => {
    try {
      return await handler(req, { userId: USER, role, locale: "en" });
    } catch (err) {
      if (err instanceof NextResponse) return err;
      throw err;
    }
  },
}));
let book: { employerIds: string[]; agentIds: string[] } | null = null;
jest.mock("@/lib/auth/agentRestrictions", () => ({ getSuperAgentBook: jest.fn(async () => book) }));

const lean = (value: unknown) => {
  const c: Record<string, unknown> = {};
  c.select = () => c;
  c.lean = async () => value;
  return c;
};

let jobDoc: Record<string, unknown> | null;
const jobFindById = jest.fn(() => lean(jobDoc));
jest.mock("@/models/Job", () => ({ __esModule: true, default: { findById: () => jobFindById() } }));
jest.mock("@/models/Employer", () => {
  const model = { findById: jest.fn(() => lean({ _id: EMPLOYER_ID, companyName: "Gulf Care Clinic" })) };
  return { __esModule: true, Employer: model, default: model };
});
jest.mock("@/models/Agent", () => ({ __esModule: true, default: { findOne: jest.fn(() => lean(null)) } }));
let seekerDoc: Record<string, unknown> | null;
jest.mock("@/models/JobSeeker", () => ({ __esModule: true, default: { findById: jest.fn(() => lean(seekerDoc)) } }));
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
jest.mock("@/lib/security/rateLimit", () => ({
  checkRateLimitDual: jest.fn(async () => ({ allowed: rateAllowed, resetAt: Date.now() + 30_000 })),
}));

import { POST } from "@/app/api/super-agent/invite/route";

function post(body: Record<string, unknown> = { jobSeekerId: SEEKER_ID, jobId: JOB_ID, message: "Your ICU years fit this well." }) {
  return POST(
    new NextRequest("http://localhost/api/super-agent/invite", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    {} as never,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  role = "super_agent";
  book = { employerIds: [EMPLOYER_ID], agentIds: [BOOK_AGENT] };
  applied = false;
  alreadyInvited = false;
  rateAllowed = true;
  seekerDoc = { _id: SEEKER_ID, userId: SEEKER_USER, profileVisibility: "visible" };
  jobDoc = { _id: JOB_ID, title: "Staff Nurse", employerId: EMPLOYER_ID, agentId: null, status: "active" };
});

describe("who may invite", () => {
  it("invites for a book employer's job, in the employer's name", async () => {
    const res = await post();
    expect(res.status).toBe(200);
    expect(claimJobInvite).toHaveBeenCalledWith({ jobId: JOB_ID, jobSeekerId: SEEKER_ID, invitedBy: USER, invitedByRole: "super_agent" });
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: SEEKER_USER,
        type: "application_invite",
        sendEmail: true,
        message: expect.stringContaining("Gulf Care Clinic would like you to apply for \"Staff Nurse\""),
        link: `/en/job-seeker/jobs/${JOB_ID}`,
      }),
    );
    expect(logActivity).toHaveBeenCalledWith(expect.objectContaining({ action: "candidate.invite", resourceId: JOB_ID }));
  });

  it("invites for a job posted by an agent in their scope", async () => {
    book = { employerIds: [], agentIds: [BOOK_AGENT] };
    jobDoc = { ...jobDoc!, employerId: OTHER_EMPLOYER, agentId: BOOK_AGENT };
    expect((await post()).status).toBe(200);
  });

  it("refuses a job outside their team and territory, before anything is claimed or sent", async () => {
    book = { employerIds: [OTHER_EMPLOYER], agentIds: [OTHER_AGENT] };
    jobDoc = { ...jobDoc!, agentId: BOOK_AGENT };
    expect((await post()).status).toBe(403);
    expect(claimJobInvite).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it("refuses a super agent with no profile or scope", async () => {
    book = null;
    expect((await post()).status).toBe(403);
    expect(notify).not.toHaveBeenCalled();
  });

  it.each(["agent", "employer", "admin", "job_seeker"])("refuses %s — they have their own invite route or none", async (other) => {
    role = other;
    expect((await post()).status).toBe(403);
    expect(jobFindById).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it("answers a missing job the same way as a job outside the book", async () => {
    jobDoc = null;
    expect((await post()).status).toBe(403);
  });
});

describe("who may be invited", () => {
  it("refuses a candidate who does not allow employers to find them", async () => {
    seekerDoc = { ...seekerDoc!, profileVisibility: "hidden" };
    expect((await post()).status).toBe(400);
    expect(claimJobInvite).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
  });

  it("404s a candidate who does not exist", async () => {
    seekerDoc = null;
    expect((await post()).status).toBe(404);
  });

  it("refuses a candidate who already applied", async () => {
    applied = true;
    expect((await post()).status).toBe(409);
    expect(notify).not.toHaveBeenCalled();
  });

  it("does not invite the same candidate to the same job twice, whoever sent the first", async () => {
    alreadyInvited = true;
    expect((await post()).status).toBe(409);
    expect(notify).not.toHaveBeenCalled();
  });

  it("refuses an unpublished job", async () => {
    jobDoc = { ...jobDoc!, status: "paused" };
    expect((await post()).status).toBe(400);
    expect(notify).not.toHaveBeenCalled();
  });
});

describe("failure handling", () => {
  it("releases the claim and reports 502 when the notification cannot be sent", async () => {
    notify.mockRejectedValueOnce(new Error("smtp down"));
    const res = await post();
    expect(res.status).toBe(502);
    expect(releaseJobInvite).toHaveBeenCalledWith("claim1");
    expect(logActivity).not.toHaveBeenCalled();
  });

  it("caps the send rate before looking anything up", async () => {
    rateAllowed = false;
    const res = await post();
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBeTruthy();
    expect(jobFindById).not.toHaveBeenCalled();
  });

  it("rejects a malformed body", async () => {
    expect((await post({ jobSeekerId: "nope", jobId: JOB_ID })).status).toBe(400);
    expect(notify).not.toHaveBeenCalled();
  });
});
