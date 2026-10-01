/**
 * @jest-environment node
 *
 * GET /api/jobs/[id]/matching-candidates — the database's talent pool ranked
 * for one job. An agent may source only for employers assigned to them (or a
 * job they posted); area visibility is not enough, because the next step is
 * inviting people on the employer's behalf.
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
jest.mock("@/lib/auth/agentRestrictions", () => ({ getSuperAgentEmployerIds: jest.fn().mockResolvedValue([]) }));

const lean = (value: unknown) => {
  const c: Record<string, unknown> = {};
  c.select = () => c;
  c.lean = async () => value;
  return c;
};

let jobDoc: Record<string, unknown> | null;
jest.mock("@/models/Job", () => ({ __esModule: true, default: { findOne: jest.fn(() => lean(jobDoc)) } }));
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
  expect(body.job).toEqual({ _id: JOB_ID, title: "Staff Nurse", status: "active" });
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

it("refuses employers and job seekers", async () => {
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
