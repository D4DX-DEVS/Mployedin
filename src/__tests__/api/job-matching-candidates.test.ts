/**
 * @jest-environment node
 *
 * GET /api/jobs/[id]/matching-candidates — the database's talent pool ranked
 * for one job. An agent may source only for employers assigned to them (or a
 * job they posted); area visibility is not enough, because the next step is
 * inviting people on the employer's behalf. An employer sees the list for its
 * own jobs only (the Suitable profiles tab). A super agent sees it for jobs in
 * their book only — the territory/team restriction is enforced here, not in
 * the page — and is told per candidate whether they may open the profile.
 */
import { NextRequest, NextResponse } from "next/server";

const AGENT_USER = "64a000000000000000000001";
const AGENT_ID = "64a000000000000000000002";
const EMPLOYER_ID = "64a000000000000000000003";
const OTHER_EMPLOYER = "64a000000000000000000004";
const JOB_ID = "64a000000000000000000010";

let role = "agent";
jest.mock("@/lib/db/mongoose", () => ({ __esModule: true, connectDB: jest.fn().mockResolvedValue(undefined), default: jest.fn() }));
jest.mock("@/lib/security/rateLimit", () => ({
  checkRateLimitDual: jest.fn().mockResolvedValue({ allowed: true, resetAt: 0 }),
  RATE_LIMIT_CONFIGS: { api: {} },
}));
jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: (req: NextRequest, ctx: unknown, params?: Record<string, string>) => Promise<Response>) =>
    async (req: NextRequest, context?: { params: Promise<Record<string, string>> }) => {
      const params = context ? await context.params : {};
      try {
        return await handler(req, { userId: AGENT_USER, role, locale: "en" }, params);
      } catch (err) {
        if (err instanceof NextResponse) return err;
        throw err;
      }
    },
}));
let book: { employerIds: string[]; agentIds: string[] } | null = null;
jest.mock("@/lib/auth/agentRestrictions", () => ({ getSuperAgentBook: jest.fn(async () => book) }));
let viewableIds: string[] = [];
const seekersSuperAgentCanView = jest.fn(async (_userId: string, _seekers: unknown[]) => new Set(viewableIds));
jest.mock("@/lib/jobSeeker/staffAccess", () => ({
  seekersSuperAgentCanView: (userId: string, seekers: unknown[]) => seekersSuperAgentCanView(userId, seekers),
}));

const lean = (value: unknown) => {
  const c: Record<string, unknown> = {};
  c.select = () => c;
  c.lean = async () => value;
  return c;
};

let jobDoc: Record<string, unknown> | null;
jest.mock("@/models/Job", () => ({ __esModule: true, default: { findOne: jest.fn(() => lean(jobDoc)) } }));
let employerDoc: { _id: string } | null = null;
jest.mock("@/models/Employer", () => ({ __esModule: true, Employer: { findOne: jest.fn(() => lean(employerDoc)) } }));
const seekerFind = jest.fn((filter: { _id: { $in: string[] } }) => lean(filter._id.$in.map((id) => ({ _id: id }))));
jest.mock("@/models/JobSeeker", () => ({ __esModule: true, default: { find: (f: { _id: { $in: string[] } }) => seekerFind(f) } }));
let assigned: string[] = [];
jest.mock("@/models/Agent", () => ({
  __esModule: true,
  default: { findOne: jest.fn(() => lean({ _id: AGENT_ID, assignedEmployerIds: assigned })) },
}));
let invitedIds: string[] = [];
jest.mock("@/lib/jobs/jobInvites", () => ({ invitedSeekerIds: jest.fn(async () => new Set(invitedIds)) }));

const candidate = (id: string, score: number) => ({
  jobSeekerId: id,
  name: `Seeker ${id}`,
  score,
  breakdown: { skills: score, role: 50, experience: 100, overall: score },
  matchedSkills: [],
  missingSkills: [],
  requirementsStatus: "met",
  unmetRequirements: [],
  preferenceMismatch: null,
});
const matchTalentPoolForJob = jest.fn();
jest.mock("@/lib/matching/talentPoolMatches", () => ({ matchTalentPoolForJob: (...a: unknown[]) => matchTalentPoolForJob(...a) }));

import { GET } from "@/app/api/jobs/[id]/matching-candidates/route";

function get(query = "") {
  return GET(new NextRequest(`http://localhost/api/jobs/${JOB_ID}/matching-candidates${query}`), {
    params: Promise.resolve({ id: JOB_ID }),
  } as never);
}

beforeEach(() => {
  matchTalentPoolForJob.mockReset();
  role = "agent";
  assigned = [EMPLOYER_ID];
  invitedIds = [];
  book = null;
  viewableIds = [];
  employerDoc = null;
  seekersSuperAgentCanView.mockClear();
  seekerFind.mockClear();
  jobDoc = { _id: JOB_ID, employerId: EMPLOYER_ID, agentId: null, title: "Staff Nurse", status: "active" };
  matchTalentPoolForJob.mockResolvedValue({
    candidates: Array.from({ length: 12 }, (_, i) => candidate(`s${i + 1}`, 90 - i)),
    poolSize: 40,
    alreadyApplied: 3,
    scoredAt: "2026-10-01T00:00:00.000Z",
  });
});

it("returns the ranked page in the list contract, with invited flags", async () => {
  invitedIds = ["s2"];
  const res = await get("?page=1&pageSize=10");
  expect(res.status).toBe(200);
  const body = await res.json();
  expect(body).toMatchObject({ page: 1, pageSize: 10, total: 12, totalPages: 2, poolSize: 40, alreadyApplied: 3 });
  expect(body.data).toHaveLength(10);
  expect(body.data[0]).toMatchObject({ jobSeekerId: "s1", invited: false });
  expect(body.data[1]).toMatchObject({ jobSeekerId: "s2", invited: true });
  // No skills on the job: the empty state can say only titles were matched.
  expect(body.job).toEqual({ _id: JOB_ID, title: "Staff Nurse", status: "active", listsSkills: false });
});

it("serves the second page", async () => {
  const body = await (await get("?page=2&pageSize=10")).json();
  expect(body.data.map((c: { jobSeekerId: string }) => c.jobSeekerId)).toEqual(["s11", "s12"]);
});

it("refuses an agent whose assignment does not include the job's employer", async () => {
  assigned = [OTHER_EMPLOYER];
  const res = await get();
  expect(res.status).toBe(403);
  expect(matchTalentPoolForJob).not.toHaveBeenCalled();
});

it("lets an agent source for a job they posted even without the assignment", async () => {
  assigned = [];
  jobDoc = { ...jobDoc!, agentId: AGENT_ID };
  expect((await get()).status).toBe(200);
});

it("does not tell an agent about profile access — that flag is the super agent's", async () => {
  const body = await (await get()).json();
  expect(body.data[0]).not.toHaveProperty("canViewProfile");
  expect(seekersSuperAgentCanView).not.toHaveBeenCalled();
});

describe("employer — Suitable profiles tab", () => {
  beforeEach(() => {
    role = "employer";
  });

  it("lists candidates for the employer's own job", async () => {
    employerDoc = { _id: EMPLOYER_ID };
    const res = await get();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toHaveLength(10);
    expect(body.data[0]).not.toHaveProperty("canViewProfile");
  });

  it("refuses another company's job without running the match", async () => {
    employerDoc = { _id: OTHER_EMPLOYER };
    expect((await get()).status).toBe(403);
    expect(matchTalentPoolForJob).not.toHaveBeenCalled();
  });

  it("refuses an employer account with no company profile", async () => {
    employerDoc = null;
    expect((await get()).status).toBe(403);
  });
});

describe("super agent — jobs in their book only", () => {
  const OTHER_AGENT = "64a000000000000000000005";
  beforeEach(() => {
    role = "super_agent";
  });

  it("lists candidates for a book employer's job, flagging the profiles they may open", async () => {
    book = { employerIds: [EMPLOYER_ID], agentIds: [] };
    viewableIds = ["s1", "s3"];
    const res = await get("?page=1&pageSize=10");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.slice(0, 3).map((c: { canViewProfile: boolean }) => c.canViewProfile)).toEqual([true, false, true]);
    // Only the page shown is checked, not the whole pool.
    expect(seekerFind.mock.calls[0][0]._id.$in).toHaveLength(10);
    expect(seekersSuperAgentCanView).toHaveBeenCalledWith(AGENT_USER, expect.any(Array));
  });

  it("lists candidates for a job posted by an agent in their scope", async () => {
    book = { employerIds: [], agentIds: [AGENT_ID] };
    jobDoc = { ...jobDoc!, agentId: AGENT_ID };
    expect((await get()).status).toBe(200);
  });

  it("refuses a job outside their team and territory", async () => {
    book = { employerIds: [OTHER_EMPLOYER], agentIds: [OTHER_AGENT] };
    jobDoc = { ...jobDoc!, agentId: AGENT_ID };
    expect((await get()).status).toBe(403);
    expect(matchTalentPoolForJob).not.toHaveBeenCalled();
  });

  it("refuses a super agent with no profile or scope", async () => {
    book = null;
    expect((await get()).status).toBe(403);
  });

  it("skips the profile lookup on an empty page", async () => {
    book = { employerIds: [EMPLOYER_ID], agentIds: [] };
    matchTalentPoolForJob.mockResolvedValue({ candidates: [], poolSize: 0, alreadyApplied: 0, scoredAt: "2026-10-01T00:00:00.000Z" });
    const body = await (await get()).json();
    expect(body.data).toEqual([]);
    expect(seekerFind).not.toHaveBeenCalled();
  });
});

it("lets an admin source for any job (the admin Find candidates page)", async () => {
  role = "admin";
  assigned = [];
  const res = await get();
  expect(res.status).toBe(200);
  expect((await res.json()).data[0]).not.toHaveProperty("canViewProfile");
});

it("refuses job seekers", async () => {
  role = "job_seeker";
  expect((await get()).status).toBe(403);
});

it("rejects a page size outside 10/25/50/100", async () => {
  expect((await get("?pageSize=500")).status).toBe(400);
});

it("404s a missing job", async () => {
  jobDoc = null;
  expect((await get()).status).toBe(404);
});
