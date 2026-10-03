/**
 * @jest-environment node
 *
 * schedule_interview tells the candidate their interview is booked. Application.jobSeekerId
 * is the JobSeeker *document* id; notifications are stored per *user*, so passing it straight
 * through wrote the notice (and its email / WhatsApp / push copies) to a user that does not
 * exist and the candidate never heard. The tool has to resolve the JobSeeker's userId first,
 * and stay quiet when none resolves.
 */
import { scheduleInterviewTool } from "@/lib/ai/copilot/tools/employer";
import type { CopilotToolContext } from "@/lib/ai/copilot/types";

const EMPLOYER_USER = "64b000000000000000000001";
const EMPLOYER_ID = "64b000000000000000000002";
const JOB_ID = "64b000000000000000000010";
const APP_ID = "64b000000000000000000030";
const SEEKER_DOC_ID = "64b000000000000000000040";
const SEEKER_USER_ID = "64b000000000000000000041";
const INTERVIEW_ID = "64b000000000000000000050";
const HOUR = 3_600_000;

const ctx = { userId: EMPLOYER_USER, role: "employer", locale: "en", permissionMode: "role_default" } as unknown as CopilotToolContext;

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
const mockWarn = jest.fn();
jest.mock("@/lib/logger", () => ({
  __esModule: true,
  default: { warn: (...a: unknown[]) => mockWarn(...a), info: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));
const mockNotifyScheduled = jest.fn((..._a: unknown[]) => Promise.resolve(undefined));
jest.mock("@/lib/notifications/trigger", () => ({
  notifyStatusChange: jest.fn(),
  notifyRejected: jest.fn(),
  notifyInterviewSelected: jest.fn(),
  notifyInterviewScheduled: (...a: unknown[]) => mockNotifyScheduled(...a),
}));
jest.mock("@/models/Job", () => ({ __esModule: true, default: {} }));

// What the JobSeeker lookup resolves to; each test sets it.
let seekerDoc: { _id?: string; userId?: string | null } | null = null;
const seekerFindById = jest.fn((_id: unknown) => {
  const c: Record<string, unknown> = {};
  c.select = () => c;
  c.lean = async () => seekerDoc;
  return c;
});
jest.mock("@/models/JobSeeker", () => ({
  __esModule: true,
  default: { findById: (id: unknown) => seekerFindById(id) },
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
  jobSeekerId: SEEKER_DOC_ID,
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
  seekerDoc = null;
  interviewCreate.mockResolvedValue({ _id: INTERVIEW_ID });
});

const book = () =>
  scheduleInterviewTool.execute({ applicationId: APP_ID, scheduledAt: new Date(Date.now() + 72 * HOUR).toISOString() }, ctx);

describe("schedule_interview candidate notification target", () => {
  it("notifies the JobSeeker's user id, not the JobSeeker document id", async () => {
    seekerDoc = { _id: SEEKER_DOC_ID, userId: SEEKER_USER_ID };

    const result = await book();

    expect(result.ok).toBe(true);
    expect(seekerFindById).toHaveBeenCalledWith(SEEKER_DOC_ID);
    expect(mockNotifyScheduled).toHaveBeenCalledTimes(1);
    const [recipient, jobTitle, , , interviewId] = mockNotifyScheduled.mock.calls[0];
    expect(recipient).toBe(SEEKER_USER_ID);
    expect(recipient).not.toBe(SEEKER_DOC_ID);
    expect(jobTitle).toBe("Nurse");
    expect(interviewId).toBe(INTERVIEW_ID);
  });

  it("does not notify anyone when the JobSeeker no longer exists, and still books the interview", async () => {
    seekerDoc = null;

    const result = await book();

    expect(result.ok).toBe(true);
    expect(result.data).toEqual({ interviewId: INTERVIEW_ID });
    expect(mockNotifyScheduled).not.toHaveBeenCalled();
  });

  it("does not notify anyone when the JobSeeker has no user id", async () => {
    seekerDoc = { _id: SEEKER_DOC_ID, userId: null };

    const result = await book();

    expect(result.ok).toBe(true);
    expect(mockNotifyScheduled).not.toHaveBeenCalled();
  });

  it("still reports the interview as booked when the JobSeeker lookup itself fails", async () => {
    seekerFindById.mockImplementationOnce(() => {
      throw new Error("db down");
    });

    const result = await book();

    expect(result.ok).toBe(true);
    expect(mockNotifyScheduled).not.toHaveBeenCalled();
  });

  // C5: an outage must not read as missing data. The lookup error is logged as such, by name and message, with no
  // id but the application's, and the "no user to notify" line is not written.
  it("logs a failed lookup as a failure, with the error name and message and only the application id", async () => {
    seekerFindById.mockImplementationOnce(() => {
      throw Object.assign(new Error("connection pool was cleared"), { name: "MongoNetworkError" });
    });

    const result = await book();

    expect(result.ok).toBe(true);
    expect(mockWarn).toHaveBeenCalledTimes(1);
    const [fields, message] = mockWarn.mock.calls[0] as [Record<string, unknown>, string];
    expect(fields).toEqual({ applicationId: APP_ID, errorName: "MongoNetworkError", errorMessage: "connection pool was cleared" });
    expect(message).toMatch(/could not look up/i);
    expect(message).not.toMatch(/no user to notify/);
    expect(JSON.stringify(mockWarn.mock.calls[0])).not.toContain(SEEKER_DOC_ID);
  });

  it("logs a warning with only the application id when no user id resolves", async () => {
    seekerDoc = null;

    await book();

    expect(mockWarn).toHaveBeenCalledTimes(1);
    const logged = JSON.stringify(mockWarn.mock.calls[0]);
    expect(logged).toContain(APP_ID);
    expect(logged).not.toContain(SEEKER_DOC_ID);
    expect(logged).not.toContain("Nurse");
  });
});
