/**
 * @jest-environment node
 *
 * POST /api/interviews proved ownership only for employers, so an agent (or a
 * super-agent) could schedule on any applicationId and email that candidate
 * (audit 2026-09-24, SEC-06). Agents/SAs now run the /api/interviews/[id] guard.
 */
import { NextRequest } from "next/server";

const APP = "aaaaaaaaaaaaaaaaaaaaaaaa";
const JOB = "bbbbbbbbbbbbbbbbbbbbbbbb";
const EMP = "cccccccccccccccccccccccc";

let currentCtx: Record<string, unknown> = {};
jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (h: (req: NextRequest, ctx: unknown) => Promise<Response>) => async (req: NextRequest) => h(req, currentCtx),
}));
jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/audit/log", () => ({ logActivity: jest.fn(), actorFromCtx: jest.fn(() => ({})) }));
jest.mock("@/lib/notifications/trigger", () => ({ notifyInterviewScheduled: jest.fn() }));
jest.mock("@/lib/interviews/sendInvite", () => ({ sendInterviewInvite: jest.fn() }));
jest.mock("@/lib/logger", () => ({ __esModule: true, default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
const getSuperAgentBook = jest.fn();
jest.mock("@/lib/auth/agentRestrictions", () => ({
  getSuperAgentBook: (...a: unknown[]) => getSuperAgentBook(...a),
}));
const book = (agentIds: string[], employerIds: string[] = []) => ({ saProfileId: "x", agentIds, employerIds, ownershipMatch: {} });

jest.mock("@/models/Application", () => ({
  __esModule: true,
  default: {
    findById: () => ({
      select: () => ({
        populate: () => ({
          lean: () =>
            Promise.resolve({ _id: APP, jobId: { _id: JOB, title: "Role" }, jobSeekerId: "dddddddddddddddddddddddd", employerId: EMP }),
        }),
      }),
    }),
  },
}));
const interviewCreate = jest.fn();
jest.mock("@/models/Interview", () => ({ __esModule: true, default: { create: (...a: unknown[]) => interviewCreate(...a) } }));
jest.mock("@/models/Job", () => ({
  __esModule: true,
  default: {
    findById: () => ({
      select: () => ({ lean: () => Promise.resolve({ _id: JOB, employerId: EMP, agentId: "eeeeeeeeeeeeeeeeeeeeeeee" }) }),
    }),
  },
}));
const seekerFindById = jest.fn();
jest.mock("@/models/JobSeeker", () => ({
  __esModule: true,
  default: {
    findById: (...a: unknown[]) => {
      seekerFindById(...a);
      return { select: () => ({ lean: () => Promise.resolve(null) }) };
    },
    findOne: () => ({ select: () => ({ lean: () => Promise.resolve(null) }) }),
  },
}));
jest.mock("@/models/Employer", () => ({ Employer: { findOne: jest.fn() } }));
jest.mock("@/models/Agent", () => ({
  __esModule: true,
  default: {
    findOne: () => ({ select: () => ({ lean: () => Promise.resolve({ _id: "ffffffffffffffffffffffff", assignedEmployerIds: [] }) }) }),
  },
}));

import { POST } from "@/app/api/interviews/route";

function post() {
  return POST(
    new NextRequest("http://localhost/api/interviews", {
      method: "POST",
      body: JSON.stringify({
        applicationId: APP,
        type: "video",
        scheduledAt: new Date(Date.now() + 86_400_000).toISOString(),
        duration: 45,
      }),
      headers: { "content-type": "application/json" },
    }),
    {} as never,
  );
}

beforeEach(() => {
  interviewCreate.mockClear();
  seekerFindById.mockClear();
});

it("refuses an agent who neither owns the job nor is assigned to its employer", async () => {
  currentCtx = { userId: "1", role: "agent", locale: "en" };
  const res = await post();
  expect(res.status).toBe(403);
  // Refused before touching the candidate or creating anything.
  expect(seekerFindById).not.toHaveBeenCalled();
  expect(interviewCreate).not.toHaveBeenCalled();
});

it("refuses a super-agent whose team does not include the job's agent", async () => {
  getSuperAgentBook.mockResolvedValue(book(["999999999999999999999999"]));
  currentCtx = { userId: "2", role: "super_agent", locale: "en" };
  expect((await post()).status).toBe(403);
  expect(interviewCreate).not.toHaveBeenCalled();
});

it("refuses a job seeker", async () => {
  currentCtx = { userId: "3", role: "job_seeker", locale: "en" };
  expect((await post()).status).toBe(403);
});

it("lets a super-agent whose team owns the job through the ownership gate", async () => {
  getSuperAgentBook.mockResolvedValue(book(["eeeeeeeeeeeeeeeeeeeeeeee"]));
  currentCtx = { userId: "4", role: "super_agent", locale: "en" };
  await post().catch(() => undefined);
  // Past the gate the handler goes on to read the candidate's availability.
  expect(seekerFindById).toHaveBeenCalled();
});

it("lets a super-agent in through an employer in their book, whoever posted the job", async () => {
  // The job's agentId points outside the team, but the employer is in the SA's
  // book — the jobs pages already count that as theirs.
  getSuperAgentBook.mockResolvedValue(book(["999999999999999999999999"], [EMP]));
  currentCtx = { userId: "5", role: "super_agent", locale: "en" };
  await post().catch(() => undefined);
  expect(seekerFindById).toHaveBeenCalled();
});
