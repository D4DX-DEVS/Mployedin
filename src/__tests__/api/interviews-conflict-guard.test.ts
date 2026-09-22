/**
 * @jest-environment node
 *
 * Double-booking protection used to live *inside* `if (settings.instantBooking)`.
 * A candidate who switched instant booking OFF therefore lost the guard
 * entirely — the opposite of what that toggle means. Legacy seeker docs
 * predating the field read as `undefined` and were unguarded too.
 *
 * Overlap is a data-integrity rule, not a preference: it must hold whatever
 * the toggle says. The *availability window* checks (which weekdays, which
 * hours) are the actual instant-booking feature and stay gated.
 */
import { NextRequest } from "next/server";

const EMPLOYER_USER = "64b000000000000000000001";
const EMPLOYER_ID = "64b000000000000000000002";
const APP_ID = "64b000000000000000000030";
const SEEKER_ID = "64b000000000000000000040";
const JOB_ID = "64b000000000000000000010";

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));

jest.mock("@/lib/auth/withAuth", () => ({
  withAuth: (handler: (req: NextRequest, ctx: unknown) => Promise<Response>) =>
    (req: NextRequest) =>
      handler(req, { userId: EMPLOYER_USER, role: "employer", locale: "en" }),
}));

jest.mock("@/lib/audit/log", () => ({
  logActivity: jest.fn(() => Promise.resolve(undefined)),
  actorFromCtx: () => ({}),
}));

jest.mock("@/lib/notifications/trigger", () => ({
  notifyInterviewScheduled: jest.fn(() => Promise.resolve(undefined)),
}));

jest.mock("@/lib/logger", () => ({
  __esModule: true,
  default: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

function chain<T>(result: T) {
  const c: Record<string, jest.Mock> = {};
  for (const m of ["populate", "sort", "skip", "limit", "select"]) c[m] = jest.fn(() => c);
  c.lean = jest.fn(async () => result);
  return c;
}

jest.mock("@/models/Application", () => ({
  __esModule: true,
  default: { findById: jest.fn(), findByIdAndUpdate: jest.fn(async () => ({})) },
}));
jest.mock("@/models/JobSeeker", () => ({ __esModule: true, default: { findById: jest.fn() } }));
jest.mock("@/models/Interview", () => ({
  __esModule: true,
  default: { find: jest.fn(), findOne: jest.fn(), create: jest.fn() },
}));
jest.mock("@/models/Job", () => ({ __esModule: true, default: {} }));
jest.mock("@/models/Employer", () => ({
  Employer: { findOne: jest.fn(), findById: jest.fn() },
}));

const SCHEDULED_AT = "2026-10-05T06:00:00.000Z";

async function post(seekerSettings: Record<string, unknown>, conflict: unknown) {
  const Application = (await import("@/models/Application")).default as never as {
    findById: jest.Mock;
  };
  const JobSeeker = (await import("@/models/JobSeeker")).default as never as { findById: jest.Mock };
  const Interview = (await import("@/models/Interview")).default as never as {
    find: jest.Mock;
    findOne: jest.Mock;
    create: jest.Mock;
  };
  const { Employer } = (await import("@/models/Employer")) as never as {
    Employer: { findOne: jest.Mock; findById: jest.Mock };
  };

  Application.findById.mockReturnValue(
    chain({ _id: APP_ID, jobId: { _id: JOB_ID, title: "Accountant" }, jobSeekerId: SEEKER_ID, employerId: EMPLOYER_ID }),
  );
  JobSeeker.findById.mockReturnValue(chain({ settings: seekerSettings, userId: "u1" }));
  Employer.findOne.mockReturnValue(chain({ _id: EMPLOYER_ID }));
  Employer.findById.mockReturnValue(chain({ agentId: null }));

  // The overlap probe loads candidate rows with `find`; `findOne` is only the
  // duplicate-round guard, which must stay empty so a 409 can only come from
  // the overlap rule under test.
  Interview.find.mockReturnValue(chain(conflict ? [conflict] : []));
  Interview.findOne.mockReturnValue(chain(null));
  Interview.create.mockResolvedValue({ _id: "iv_new" });

  const { POST } = await import("@/app/api/interviews/route");
  const req = new NextRequest("http://localhost/api/interviews", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ applicationId: APP_ID, type: "video", scheduledAt: SCHEDULED_AT, duration: 30 }),
  });
  const res = await POST(req, { params: Promise.resolve({}) } as never);
  const payload = res.status === 201 ? {} : await res.clone().json();
  return { res, Interview, error: (payload as { error?: string }).error ?? "" };
}

const OVERLAPPING = { _id: "iv_existing", scheduledAt: new Date(SCHEDULED_AT) };

describe("POST /api/interviews double-booking guard", () => {
  beforeEach(() => jest.clearAllMocks());

  it("rejects an overlapping slot when instant booking is ON", async () => {
    const { res, error } = await post({ instantBooking: true, timezone: "Asia/Dubai" }, OVERLAPPING);
    expect(res.status).toBe(409);
    expect(error).toMatch(/conflicts with an existing interview/i);
  });

  it("rejects an overlapping slot when instant booking is OFF", async () => {
    const { res, Interview, error } = await post({ instantBooking: false, timezone: "Asia/Dubai" }, OVERLAPPING);
    expect(res.status).toBe(409);
    expect(error).toMatch(/conflicts with an existing interview/i);
    expect(Interview.create).not.toHaveBeenCalled();
  });

  it("rejects an overlapping slot for a legacy seeker with no settings at all", async () => {
    const { res, Interview, error } = await post({}, OVERLAPPING);
    expect(res.status).toBe(409);
    expect(error).toMatch(/conflicts with an existing interview/i);
    expect(Interview.create).not.toHaveBeenCalled();
  });

  it("still books when nothing overlaps and instant booking is OFF", async () => {
    const { res, Interview } = await post({ instantBooking: false }, null);
    expect(res.status).toBe(201);
    expect(Interview.create).toHaveBeenCalled();
  });

  it("leaves the availability-window rules gated behind instant booking", async () => {
    // Sunday-only availability; the request is a Monday. With instant booking
    // OFF the employer proposes and the candidate confirms, so the window is
    // not enforced — only the overlap rule is.
    const { res } = await post(
      { instantBooking: false, weeklyAvailability: ["Sun"], timezone: "Asia/Dubai" },
      null,
    );
    expect(res.status).toBe(201);
  });
});
