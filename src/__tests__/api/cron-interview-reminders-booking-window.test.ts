/**
 * @jest-environment node
 *
 * The hourly reminder cron sends its "24 hour" reminder (the booking notice,
 * "Interview Scheduled") to every interview less than 24 h away that is not
 * marked reminded. An interview booked inside that window is therefore created
 * with reminderSent true, or it would be announced a second time within the
 * hour of its invitation. The 1 hour reminder needs reminderSent true, so it
 * still fires for such an interview.
 *
 * Interview is an in-memory collection here, so the cron's own queries are
 * evaluated rather than stubbed out. Each booking is made "hours ago" and the
 * flag comes from the same rule the booking routes use.
 */
import { NextRequest } from "next/server";
import { isInsideReminderWindow } from "@/lib/interviews/reminderWindow";

jest.mock("@/lib/security/cron-auth", () => ({ verifyCronRequest: () => null }));
jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/logger", () => ({ __esModule: true, default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() } }));
const notify = jest.fn().mockResolvedValue(undefined);
const notifyInterviewScheduled = jest.fn().mockResolvedValue(undefined);
jest.mock("@/lib/notifications/trigger", () => ({
  notify: (...a: unknown[]) => notify(...a),
  notifyInterviewScheduled: (...a: unknown[]) => notifyInterviewScheduled(...a),
}));

interface Doc {
  _id: string;
  jobSeekerId: { userId: { _id: string } };
  jobId: { title: string };
  scheduledAt: Date;
  status: string;
  reminderSent: boolean;
  metadata: Record<string, unknown>;
}
let docs: Doc[] = [];

const valueAt = (doc: unknown, path: string) =>
  path.split(".").reduce<unknown>((v, key) => (v == null ? undefined : (v as Record<string, unknown>)[key]), doc);

/** The operators the cron's queries use; anything else fails the test loudly. */
function matches(doc: Doc, query: Record<string, unknown>): boolean {
  return Object.entries(query).every(([path, condition]) => {
    const value = valueAt(doc, path);
    if (condition && typeof condition === "object" && !(condition instanceof Date)) {
      return Object.entries(condition as Record<string, unknown>).every(([op, operand]) => {
        if (op === "$gte") return (value as Date).getTime() >= (operand as Date).getTime();
        if (op === "$lte") return (value as Date).getTime() <= (operand as Date).getTime();
        if (op === "$in") return (operand as unknown[]).includes(value);
        if (op === "$ne") return value !== operand;
        throw new Error(`matcher does not support ${op}`);
      });
    }
    return value === condition;
  });
}

jest.mock("@/models/Interview", () => ({
  __esModule: true,
  default: {
    find: (query: Record<string, unknown>) => {
      const result = docs.filter((doc) => matches(doc, query));
      const c: Record<string, unknown> = {};
      for (const m of ["limit", "populate", "select"]) c[m] = () => c;
      c.lean = async () => result;
      return c;
    },
    updateOne: async (filter: Record<string, unknown>, update: { $set: Record<string, unknown> }) => {
      const doc = docs.find((d) => matches(d, filter));
      if (!doc) return { modifiedCount: 0 };
      for (const [path, value] of Object.entries(update.$set)) {
        const keys = path.split(".");
        const last = keys.pop() as string;
        const parent = keys.reduce<Record<string, unknown>>((o, k) => o[k] as Record<string, unknown>, doc as unknown as Record<string, unknown>);
        parent[last] = value;
      }
      return { modifiedCount: 1 };
    },
  },
}));

import { GET } from "@/app/api/cron/interview-reminders/route";

const HOUR = 3_600_000;

/**
 * An interview booked `bookedHoursAgo` hours ago for a slot `leadHours` after
 * the booking, flagged the way the booking routes flag it.
 */
function booking(id: string, bookedHoursAgo: number, leadHours: number, flagAtBooking = true): Doc {
  const bookedAt = new Date(Date.now() - bookedHoursAgo * HOUR);
  const scheduledAt = new Date(bookedAt.getTime() + leadHours * HOUR);
  return {
    _id: id,
    jobSeekerId: { userId: { _id: "650000000000000000000031" } },
    jobId: { title: "Nurse" },
    scheduledAt,
    status: "scheduled",
    reminderSent: flagAtBooking ? isInsideReminderWindow(scheduledAt, bookedAt) : false,
    metadata: {},
  };
}

const sweep = () => GET(new NextRequest("http://localhost/api/cron/interview-reminders"));

beforeEach(() => {
  jest.clearAllMocks();
  docs = [];
});

describe("interview reminder cron and the booking-time flag", () => {
  it("does not announce an interview booked 3 hours ahead a second time", async () => {
    docs = [booking("a", 1, 3)]; // booked an hour ago, 2 hours away now
    expect(docs[0].reminderSent).toBe(true);
    await sweep();
    expect(notifyInterviewScheduled).not.toHaveBeenCalled();
  });

  it("would have announced it again if the booking had not marked it", async () => {
    // The control: the same interview without the flag is what the cron used to pick up.
    docs = [booking("a", 1, 3, false)];
    await sweep();
    expect(notifyInterviewScheduled).toHaveBeenCalledTimes(1);
  });

  it("does not announce an interview booked 24.5 hours ahead when the next run reaches it", async () => {
    // The cron runs hourly: 45 minutes after the booking the slot is 23.75 hours
    // away, inside the cron's 24 hour window.
    docs = [booking("a", 0.75, 24.5)];
    expect(docs[0].reminderSent).toBe(true);
    await sweep();
    expect(notifyInterviewScheduled).not.toHaveBeenCalled();
  });

  it("would have announced the 24.5 hour booking if the window stopped at 24 hours", async () => {
    docs = [booking("a", 0.75, 24.5, false)];
    await sweep();
    expect(notifyInterviewScheduled).toHaveBeenCalledTimes(1);
  });

  it("still sends the 1 hour reminder for an interview booked 3 hours ahead", async () => {
    docs = [booking("a", 2.5, 3)]; // booked 2.5 hours ago, 30 minutes away now
    expect(docs[0].reminderSent).toBe(true);
    await sweep();
    expect(notifyInterviewScheduled).not.toHaveBeenCalled();
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ type: "interview_reminder", userId: "650000000000000000000031" }),
    );
  });

  it("leaves an interview booked 3 days ahead for the 24 hour reminder, then the 1 hour one", async () => {
    docs = [booking("a", 49, 72)]; // booked 49 hours ago, 23 hours away now
    expect(docs[0].reminderSent).toBe(false);
    await sweep();
    expect(notifyInterviewScheduled).toHaveBeenCalledTimes(1);
    expect(notify).not.toHaveBeenCalled();
    expect(docs[0].reminderSent).toBe(true);

    // Time passes: with the 24 hour reminder sent it is now within the hour.
    docs[0].scheduledAt = new Date(Date.now() + 30 * 60_000);
    await sweep();
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notifyInterviewScheduled).toHaveBeenCalledTimes(1);
  });
});
