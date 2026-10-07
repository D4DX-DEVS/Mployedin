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
jest.mock("@/lib/auth/agentRestrictions", () => ({
  getSuperAgentScope: jest.fn().mockResolvedValue(null),
  getSuperAgentBook: jest.fn().mockResolvedValue(null),
  // Not assigned to the employer and not covering its region.
  agentCanSeeEmployer: jest.fn().mockResolvedValue(false),
}));

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

function post(scheduledAt: string = new Date(Date.now() + 86_400_000).toISOString()) {
  return POST(
    new NextRequest(`http://localhost/api/interviews/${PREV}/next-round`, {
      method: "POST",
      body: JSON.stringify({ scheduledAt, type: "video" }),
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

/**
 * The hourly cron sends its "24 hour" reminder, whose text is the booking notice,
 * to every interview less than 24 h away that is not marked reminded. A next
 * round booked inside that window (plus one cron interval) gets the booking
 * notice from the route and would get it again within the hour.
 */
describe("the reminder flag of a booked next round", () => {
  const HOUR = 3_600_000;
  const book = async (hoursAhead: number) => {
    callerEmployer = OWNER_EMP;
    currentCtx = { userId: "6", role: "employer", locale: "en" };
    const res = await post(new Date(Date.now() + hoursAhead * HOUR).toISOString());
    expect(res.status).toBe(201);
    return interviewCreate.mock.calls[0][0] as { reminderSent: boolean };
  };

  it("marks a round booked 3 hours ahead as already reminded", async () => {
    expect((await book(3)).reminderSent).toBe(true);
  });

  it("marks a round booked 24.5 hours ahead as already reminded", async () => {
    expect((await book(24.5)).reminderSent).toBe(true);
  });

  it("leaves a round booked 3 days ahead for the 24 hour reminder", async () => {
    expect((await book(72)).reminderSent).toBe(false);
  });
});

/**
 * Review follow-up to QA EMP-007 (2026-10-06): the next-round modal says a link
 * like "meet.google.com/abc" is fine, but this route still demanded a full URL
 * (and took "javascript:"). Same rule as scheduling now.
 */
describe("the next round's meeting link", () => {
  const postLink = (meetLink: string) =>
    POST(
      new NextRequest(`http://localhost/api/interviews/${PREV}/next-round`, {
        method: "POST",
        body: JSON.stringify({ scheduledAt: new Date(Date.now() + 86_400_000).toISOString(), type: "video", meetLink }),
        headers: { "content-type": "application/json" },
      }),
      { params: Promise.resolve({ id: PREV }) } as never,
    );

  beforeEach(() => {
    callerEmployer = OWNER_EMP;
    currentCtx = { userId: "6", role: "employer", locale: "en" };
  });

  it("accepts a link typed without https:// and stores it with it", async () => {
    expect((await postLink("meet.google.com/abc-defg-hij")).status).toBeLessThan(300);
    expect(interviewCreate.mock.calls.at(-1)?.[0]).toMatchObject({ meetLink: "https://meet.google.com/abc-defg-hij" });
  });

  it("refuses a javascript: link", async () => {
    // validateBody throws its 400; the real withAuth turns that into the response.
    const res = await postLink("javascript:alert(1)").catch((thrown: unknown) => thrown as Response);
    expect(res.status).toBe(400);
    expect(interviewCreate).not.toHaveBeenCalled();
  });
});
