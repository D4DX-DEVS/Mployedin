/**
 * @jest-environment node
 *
 * Rejecting, withdrawing or moving a candidate past interviewing cancels the
 * interview slots they still hold in the future. The row became `cancelled`,
 * but the candidate was never told: the calendar invitation they accepted
 * stayed in their calendar. Cancelling by hand (PATCH /api/interviews/[id])
 * sends a calendar CANCEL with a bumped SEQUENCE; the automatic cancel must
 * do the same.
 */
const APP_ID = "650000000000000000000901";
const FUTURE_IV = "650000000000000000000902";
const NOW = new Date("2026-10-12T10:00:00Z");

const calls: string[] = [];
const updateMany = jest.fn(async (filter: Record<string, unknown>) => {
  calls.push(`updateMany:${(filter.scheduledAt as Record<string, unknown>)?.$gt ? "future" : "past"}`);
  return { modifiedCount: 1 };
});
let futureOpen: Array<{ _id: string }> = [];
const find = jest.fn(() => ({ select: () => ({ lean: async () => futureOpen }) }));

jest.mock("@/models/Interview", () => ({
  __esModule: true,
  default: {
    updateMany: (...a: [Record<string, unknown>]) => updateMany(...a),
    find: (...a: unknown[]) => (find as jest.Mock)(...a),
  },
}));
jest.mock("@/lib/logger", () => ({ __esModule: true, default: { error: jest.fn(), warn: jest.fn(), info: jest.fn() } }));
const sendInterviewInvite = jest.fn(async (id: string) => {
  calls.push(`invite:${id}`);
  return true;
});
jest.mock("@/lib/interviews/sendInvite", () => ({
  sendInterviewInvite: (...a: [string]) => sendInterviewInvite(...a),
}));

const flush = () => new Promise((r) => setImmediate(r));

beforeEach(() => {
  jest.clearAllMocks();
  calls.length = 0;
  futureOpen = [{ _id: FUTURE_IV }];
});

describe("closeOpenInterviewsForAdvance", () => {
  it("cancels a future slot with a bumped calendar sequence", async () => {
    const { closeOpenInterviewsForAdvance } = await import("@/lib/hiring/closeOpenInterviews");
    await closeOpenInterviewsForAdvance(APP_ID, { now: NOW });

    const cancel = updateMany.mock.calls.find(([f]) => (f.scheduledAt as Record<string, unknown>)?.$gt);
    expect(cancel).toBeDefined();
    expect(cancel?.[0]).toMatchObject({ applicationId: APP_ID, status: { $in: ["scheduled", "confirmed"] } });
    expect((cancel as unknown as unknown[])[1]).toEqual({ $set: { status: "cancelled" }, $inc: { icsSequence: 1 } });
  });

  it("sends the candidate a calendar cancellation once the slot is cancelled", async () => {
    const { closeOpenInterviewsForAdvance } = await import("@/lib/hiring/closeOpenInterviews");
    await closeOpenInterviewsForAdvance(APP_ID, { now: NOW, locale: "ar" });
    await flush();

    expect(sendInterviewInvite).toHaveBeenCalledWith(FUTURE_IV, "ar");
    // The invite reloads the row, so it must read it after the cancel saved.
    expect(calls.indexOf(`invite:${FUTURE_IV}`)).toBeGreaterThan(calls.indexOf("updateMany:future"));
  });

  it("marks a past slot completed and sends nothing when no future slot is open", async () => {
    futureOpen = [];
    const { closeOpenInterviewsForAdvance } = await import("@/lib/hiring/closeOpenInterviews");
    const summary = await closeOpenInterviewsForAdvance(APP_ID, { now: NOW });
    await flush();

    const past = updateMany.mock.calls.find(([f]) => (f.scheduledAt as Record<string, unknown>)?.$lte);
    expect((past as unknown as unknown[])[1]).toEqual({ $set: { status: "completed" } });
    expect(updateMany.mock.calls.some(([f]) => (f.scheduledAt as Record<string, unknown>)?.$gt)).toBe(false);
    expect(sendInterviewInvite).not.toHaveBeenCalled();
    expect(summary).toEqual({ completed: 1, cancelled: 0 });
  });

  it("does not fail the stage change when the cancellation mail fails", async () => {
    sendInterviewInvite.mockRejectedValueOnce(new Error("smtp down"));
    const { closeOpenInterviewsForAdvance } = await import("@/lib/hiring/closeOpenInterviews");

    await expect(closeOpenInterviewsForAdvance(APP_ID, { now: NOW })).resolves.toEqual({ completed: 1, cancelled: 1 });
    await flush();
  });
});
