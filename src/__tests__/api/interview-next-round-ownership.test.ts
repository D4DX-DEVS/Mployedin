/**
 * @jest-environment node
 *
 * POST /api/interviews/[id]/next-round checked only that the previous round was
 * completed + passed, so any caller holding interviews:create could book a
 * round on ANOTHER company's candidate — flipping that application to
 * interview_scheduled and emailing the candidate (audit 2026-09-24, SEC-05).
 * It now runs the same ownership guard as /api/interviews/[id].
 */
import { NextRequest } from "next/server";

const PREV = "aaaaaaaaaaaaaaaaaaaaaaaa";
const JOB = "bbbbbbbbbbbbbbbbbbbbbbbb";
const OWNER_EMP = "cccccccccccccccccccccccc";
const OTHER_EMP = "dddddddddddddddddddddddd";

let currentCtx: Record<string, unknown> = {};
jest.mock("@/lib/auth/withAuth", () => ({
  withAuth:
    (h: (req: NextRequest, ctx: unknown, params?: Record<string, string>) => Promise<Response>) =>
    async (req: NextRequest, rc?: { params?: Promise<Record<string, string>> }) =>
      h(req, currentCtx, rc?.params ? await rc.params : undefined),
}));
jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/audit/log", () => ({ logActivity: jest.fn(), actorFromCtx: jest.fn(() => ({})) }));
jest.mock("@/lib/notifications/trigger", () => ({ notify: jest.fn() }));
jest.mock("@/lib/auth/agentRestrictions", () => ({ getSuperAgentScope: jest.fn().mockResolvedValue(null) }));

const interviewCreate = jest.fn();
jest.mock("@/models/Interview", () => ({
  __esModule: true,
  default: {
    findById: () => ({
      lean: () =>
        Promise.resolve({
          _id: PREV,
          applicationId: "eeeeeeeeeeeeeeeeeeeeeeee",
          jobId: JOB,
          jobSeekerId: "ffffffffffffffffffffffff",
          employerId: OWNER_EMP,
          status: "completed",
          outcome: "passed",
          interviewRound: 1,
        }),
    }),
    create: (...a: unknown[]) => {
      interviewCreate(...a);
      return Promise.resolve({ _id: "111111111111111111111111" });
    },
  },
}));
const applicationUpdate = jest.fn().mockResolvedValue({});
jest.mock("@/models/Application", () => ({
  __esModule: true,
  default: { findByIdAndUpdate: (...a: unknown[]) => applicationUpdate(...a) },
}));
jest.mock("@/models/Job", () => ({
  __esModule: true,
  default: {
    findById: () => ({
      select: () => ({ lean: () => Promise.resolve({ _id: JOB, employerId: OWNER_EMP, agentId: null, title: "Role" }) }),
    }),
  },
}));
jest.mock("@/models/JobSeeker", () => ({
  __esModule: true,
  default: {
    findById: () => ({ select: () => ({ lean: () => Promise.resolve(null) }) }),
    findOne: () => ({ select: () => ({ lean: () => Promise.resolve(null) }) }),
  },
}));
let callerEmployer = OTHER_EMP;
jest.mock("@/models/Employer", () => ({
  Employer: { findOne: () => ({ select: () => ({ lean: () => Promise.resolve({ _id: callerEmployer }) }) }) },
}));
jest.mock("@/models/Agent", () => ({
  __esModule: true,
  default: { findOne: () => ({ select: () => ({ lean: () => Promise.resolve({ _id: "2", assignedEmployerIds: [] }) }) }) },
}));

import { POST } from "@/app/api/interviews/[id]/next-round/route";

function post() {
  return POST(
    new NextRequest(`http://localhost/api/interviews/${PREV}/next-round`, {
      method: "POST",
      body: JSON.stringify({ scheduledAt: new Date(Date.now() + 86_400_000).toISOString(), type: "video" }),
      headers: { "content-type": "application/json" },
    }),
    { params: Promise.resolve({ id: PREV }) } as never,
  );
}

beforeEach(() => {
  interviewCreate.mockClear();
  applicationUpdate.mockClear();
});

it("refuses an employer who does not own the interview's job", async () => {
  callerEmployer = OTHER_EMP;
  currentCtx = { userId: "3", role: "employer", locale: "en" };
  const res = await post();
  expect(res.status).toBe(403);
  expect(interviewCreate).not.toHaveBeenCalled();
  expect(applicationUpdate).not.toHaveBeenCalled();
});

it("refuses an agent with no link to the employer", async () => {
  currentCtx = { userId: "4", role: "agent", locale: "en" };
  expect((await post()).status).toBe(403);
  expect(interviewCreate).not.toHaveBeenCalled();
});

it("refuses the candidate — scheduling is the employer side's job", async () => {
  currentCtx = { userId: "5", role: "job_seeker", locale: "en" };
  expect((await post()).status).toBe(403);
});

it("lets the owning employer schedule the next round", async () => {
  callerEmployer = OWNER_EMP;
  currentCtx = { userId: "6", role: "employer", locale: "en" };
  const res = await post();
  expect(res.status).toBeLessThan(300);
  expect(interviewCreate).toHaveBeenCalled();
});
