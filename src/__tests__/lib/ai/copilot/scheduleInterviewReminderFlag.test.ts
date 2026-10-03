/**
 * @jest-environment node
 *
 * The copilot's schedule_interview tool creates an Interview and notifies the
 * candidate ("Interview Scheduled", email on). The hourly reminder cron sends
 * its "24 hour" reminder, with the same text, to every interview less than 24 h
 * away that is not marked reminded, so a slot booked inside that window (plus one
 * cron interval) has to be created already marked or it is announced twice.
 */
import { scheduleInterviewTool } from "@/lib/ai/copilot/tools/employer";
import type { CopilotToolContext } from "@/lib/ai/copilot/types";

const EMPLOYER_USER = "64b000000000000000000001";
const EMPLOYER_ID = "64b000000000000000000002";
const JOB_ID = "64b000000000000000000010";
const APP_ID = "64b000000000000000000030";
const SEEKER_ID = "64b000000000000000000040";
const HOUR = 3_600_000;

const ctx = { userId: EMPLOYER_USER, role: "employer", locale: "en", permissionMode: "role_default" } as unknown as CopilotToolContext;

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/notifications/trigger", () => ({
  notifyStatusChange: jest.fn(),
  notifyRejected: jest.fn(),
  notifyInterviewSelected: jest.fn(),
  notifyInterviewScheduled: jest.fn(() => Promise.resolve(undefined)),
}));
jest.mock("@/models/Job", () => ({ __esModule: true, default: {} }));
jest.mock("@/models/JobSeeker", () => ({
  __esModule: true,
  default: {
    findById: () => {
      const c: Record<string, unknown> = {};
      c.select = () => c;
      c.lean = async () => ({ _id: SEEKER_ID, userId: "64b000000000000000000041" });
      return c;
    },
  },
}));
jest.mock("@/models/Employer", () => ({
  __esModule: true,
  Employer: {
    findOne: () => {
      const c: Record<string, unknown> = {};
      c.select = () => c;
      c.lean = async () => ({ _id: EMPLOYER_ID, userId: EMPLOYER_USER, companyName: "Test Corp" });
      return c;
    },
  },
}));
const application = () => ({
  _id: APP_ID,
  jobId: { _id: JOB_ID, title: "Nurse", employerId: EMPLOYER_ID },
  jobSeekerId: SEEKER_ID,
  agentId: null,
  status: "applied",
  statusHistory: [] as unknown[],
  interviewIds: [] as unknown[],
  save: jest.fn().mockResolvedValue(undefined),
});
jest.mock("@/models/Application", () => ({
  __esModule: true,
  default: { findById: () => ({ populate: async () => application() }) },
}));
const interviewCreate = jest.fn();
jest.mock("@/models/Interview", () => ({
  __esModule: true,
  default: { create: (...a: unknown[]) => interviewCreate(...a) },
}));

beforeEach(() => {
  jest.clearAllMocks();
  interviewCreate.mockResolvedValue({ _id: "64b000000000000000000050" });
});

const book = async (hoursAhead: number) => {
  const result = await scheduleInterviewTool.execute(
    { applicationId: APP_ID, scheduledAt: new Date(Date.now() + hoursAhead * HOUR).toISOString() },
    ctx,
  );
  expect(result.ok).toBe(true);
  return interviewCreate.mock.calls[0][0] as { reminderSent?: boolean };
};

describe("schedule_interview reminder flag", () => {
  it("marks an interview booked 3 hours ahead as already reminded", async () => {
    expect((await book(3)).reminderSent).toBe(true);
  });

  it("marks an interview booked 24.5 hours ahead as already reminded", async () => {
    expect((await book(24.5)).reminderSent).toBe(true);
  });

  it("leaves an interview booked 3 days ahead for the 24 hour reminder", async () => {
    expect((await book(72)).reminderSent).toBe(false);
  });
});
