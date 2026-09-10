/**
 * @jest-environment node
 *
 * The three switches on the seeker's Settings page used to write
 * `JobSeeker.settings.notifications`, which nothing read — turning "Job Match
 * Alerts" off changed nothing. They now read and write the same
 * NotificationPreference categories the delivery orchestrator honours, so there
 * is one answer per category rather than two.
 */
import { NextRequest } from "next/server";

const SEEKER_USER = "64b000000000000000000001";
let role = "job_seeker";
let seekerDoc: Record<string, unknown> | null = null;
let prefDoc: Record<string, unknown> | null = null;

const jobSeekerUpdate = jest.fn(async (..._args: unknown[]) => ({}));
const prefUpdate = jest.fn(async (..._args: unknown[]) => ({}));

jest.mock("@/lib/db/mongoose", () => ({
  __esModule: true,
  default: jest.fn().mockResolvedValue(undefined),
  connectDB: jest.fn().mockResolvedValue(undefined),
}));
jest.mock("@/lib/auth/withAuth", () => ({
  withAuth:
    (handler: (req: NextRequest, ctx: unknown) => Promise<Response>) =>
    (req: NextRequest) =>
      handler(req, { userId: SEEKER_USER, role, locale: "en" }),
}));
jest.mock("@/lib/audit/log", () => ({ logActivity: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/models/JobSeeker", () => ({
  __esModule: true,
  default: {
    findOne: () => ({ select: () => ({ lean: async () => seekerDoc }) }),
    findOneAndUpdate: (...args: unknown[]) => jobSeekerUpdate(...args),
  },
}));
jest.mock("@/models/NotificationPreference", () => ({
  __esModule: true,
  default: {
    findOne: () => ({ select: () => ({ lean: async () => prefDoc }) }),
    updateOne: (...args: unknown[]) => prefUpdate(...args),
  },
}));

async function get() {
  const { GET } = await import("@/app/api/job-seekers/settings/route");
  return GET(new NextRequest("http://localhost:3000/api/job-seekers/settings"), {
    params: Promise.resolve({}),
  } as never);
}

async function patch(body: unknown) {
  const { PATCH } = await import("@/app/api/job-seekers/settings/route");
  return PATCH(
    new NextRequest("http://localhost:3000/api/job-seekers/settings", {
      method: "PATCH",
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
    }),
    { params: Promise.resolve({}) } as never,
  );
}

describe("job seeker settings — notification switches", () => {
  beforeEach(() => {
    role = "job_seeker";
    seekerDoc = { settings: { instantBooking: true } };
    prefDoc = null;
    jobSeekerUpdate.mockClear();
    prefUpdate.mockClear();
  });

  it("reports every switch on when the seeker has no preference document", async () => {
    const body = await (await get()).json();
    expect(body.settings.notifications).toEqual({
      jobMatchAlerts: true,
      applicationSubmitted: true,
      interviewNotifications: true,
    });
  });

  it("reflects the categories the seeker actually disabled", async () => {
    prefDoc = {
      categories: {
        jobs: { enabled: false },
        applications: { enabled: true },
        interviews: { enabled: false },
      },
    };
    const body = await (await get()).json();
    expect(body.settings.notifications).toEqual({
      jobMatchAlerts: false,
      applicationSubmitted: true,
      interviewNotifications: false,
    });
  });

  it("writes a disabled switch onto the notification category", async () => {
    const res = await patch({ settings: { notifications: { jobMatchAlerts: false } } });
    expect(res.status).toBe(200);
    expect(prefUpdate).toHaveBeenCalledWith(
      { userId: SEEKER_USER },
      { $set: { "categories.jobs.enabled": false } },
      { upsert: true },
    );
  });

  it("maps all three switches onto their categories", async () => {
    await patch({
      settings: {
        notifications: {
          jobMatchAlerts: true,
          applicationSubmitted: false,
          interviewNotifications: true,
        },
      },
    });
    expect(prefUpdate).toHaveBeenCalledWith(
      { userId: SEEKER_USER },
      {
        $set: {
          "categories.jobs.enabled": true,
          "categories.applications.enabled": false,
          "categories.interviews.enabled": true,
        },
      },
      { upsert: true },
    );
  });

  it("never leaves a second copy under JobSeeker.settings", async () => {
    await patch({ settings: { notifications: { jobMatchAlerts: false }, instantBooking: false } });
    const update = jobSeekerUpdate.mock.calls[0][1] as { $set: Record<string, unknown> };
    expect(update.$set).toEqual({ "settings.instantBooking": false });
  });

  it("does not touch preferences when the body carries no switches", async () => {
    await patch({ settings: { instantBooking: false } });
    expect(prefUpdate).not.toHaveBeenCalled();
  });
});
