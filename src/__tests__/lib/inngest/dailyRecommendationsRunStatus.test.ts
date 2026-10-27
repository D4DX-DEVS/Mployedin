/**
 * @jest-environment node
 *
 * Issue #11: no job-alert email reached a seeker from 2026-09-23 on. Inngest
 * Cloud kept firing this function once a day at 09:00 UTC — the schedule it was
 * last synced with — while the code mails only seekers whose own clock reads
 * 9am. For a Gulf and Indian audience 09:00 UTC is midday, so every run found
 * nobody due, and because the function recorded its status only when an admin
 * had switched it off, Admin → Cron Jobs never showed a single run.
 *
 * These tests pin the producer's side of the fix: every run is recorded, a
 * run that arrives long after the previous one is flagged, and neither of
 * those can stop a digest from going out.
 */
const send = jest.fn(async () => ({ ids: ["evt"] }));
const updateCronRunStatus = jest.fn(async (..._a: unknown[]) => undefined);
const getSystemConfig = jest.fn(async (): Promise<unknown> => ({ cronJobs: { dailyRecommendations: {} } }));
const isCronEnabled = jest.fn(async () => true);
const recommendJobsFor = jest.fn(async (..._a: unknown[]) => ({
  jobs: [
    {
      id: "j1",
      title: "Site Engineer",
      company: "Beta Industries",
      location: "Muscat, Oman",
      score: 88,
      breakdown: { matchedSkills: ["AutoCAD"] },
    },
  ],
  bestScore: 88,
  threshold: 80,
  considered: 1,
  limitingFactor: null,
}));
const warn = jest.fn();

/** A Mongoose-style query: chainable, resolved by `.lean()`. */
function query<T>(value: T) {
  const q: Record<string, unknown> = {};
  for (const m of ["select", "populate", "sort", "limit"]) q[m] = () => q;
  q.lean = () => Promise.resolve(value);
  return q;
}

const seekerUser = { _id: "u1" };
const seekerDoc = { _id: "s1", userId: "u1", currentLocation: "Muscat, Oman" };

jest.mock("@/lib/inngest/client", () => ({
  inngest: {
    createFunction: (config: unknown, handler: unknown) => ({ config, handler }),
    send: (...a: unknown[]) => send(...(a as [])),
  },
}));
jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn(async () => undefined) }));
jest.mock("@/lib/logger", () => ({
  __esModule: true,
  default: { error: jest.fn(), info: jest.fn(), warn: (...a: unknown[]) => warn(...a) },
}));
jest.mock("@/lib/logs/logStore", () => ({ mirrorLogWrites: jest.fn(async () => undefined) }));
jest.mock("@/models/User", () => ({
  __esModule: true,
  default: {
    find: () => query([seekerUser]),
    findById: () => query({ name: "Ilyas", email: "seeker@mployedin.test.invalid", locale: "en" }),
  },
}));
jest.mock("@/models/Job", () => ({ __esModule: true, default: { find: () => query([{ id: "j1" }]) } }));
jest.mock("@/models/JobSeeker", () => ({ __esModule: true, default: { find: () => query([seekerDoc]) } }));
jest.mock("@/models/Application", () => ({ __esModule: true, default: { find: () => query([]) } }));
jest.mock("@/models/ProfileView", () => ({
  __esModule: true,
  default: { find: () => query([]), updateMany: jest.fn(async () => undefined) },
}));
jest.mock("@/models/NotificationPreference", () => ({
  __esModule: true,
  default: { find: () => query([]), findOneAndUpdate: () => query(null) },
}));
jest.mock("@/lib/matchScore", () => ({
  seekerProfileFromDoc: (d: unknown) => d,
  profileSignalCount: () => 5,
  MIN_PROFILE_SIGNALS: 2,
  SEEKER_MATCH_FIELDS: "",
}));
jest.mock("@/lib/matching/recommend", () => ({
  recommendJobsFor: (...a: unknown[]) => recommendJobsFor(...a),
  toCandidateJob: (j: unknown) => j,
  JOB_MATCH_FIELDS: "",
}));
jest.mock("@/lib/matching/skillVectors", () => ({ prepareSkillVectors: jest.fn(async () => ({})) }));
jest.mock("@/lib/matching/recommendationLog", () => ({
  markRecommended: jest.fn(async () => undefined),
  alreadyRecommendedJobIds: jest.fn(async () => new Set()),
}));
jest.mock("@/lib/matching/jevVerdictStore", () => ({ mongoJevVerdictStore: {} }));
jest.mock("@/lib/effectiveSeekerProfile", () => ({
  loadConfirmedSkills: jest.fn(async () => new Map()),
  withConfirmedSkills: (p: unknown) => p,
}));
jest.mock("@/lib/communications/email", () => ({ isUndeliverableAddress: () => false }));
jest.mock("@/lib/jobSeeker/profileCompleteness", () => ({
  profileCompletenessScore: () => 50,
  PROFILE_COMPLETENESS_FIELDS: "",
}));
jest.mock("@/lib/notifications/trigger", () => ({ notify: jest.fn(async () => undefined) }));
jest.mock("@/models/SystemConfig", () => ({
  isCronEnabled: () => isCronEnabled(),
  updateCronRunStatus: (...a: unknown[]) => updateCronRunStatus(...a),
  getSystemConfig: () => getSystemConfig(),
  resolveMatchThreshold: async () => 80,
  isAiRerankEnabled: async () => false,
  resolveDefaultDigestCadence: async () => "weekly",
}));

import { dailyRecommendationsCron } from "@/lib/inngest/dailyRecommendations";
import { ADMIN_DISABLED_SKIP_MESSAGE } from "@/lib/inngest/cronDrift";

const fn = dailyRecommendationsCron as unknown as {
  config: { id: string; triggers: Array<{ cron: string }> };
  handler: (ctx: { step: { run: (name: string, f: () => unknown) => unknown } }) => Promise<Record<string, unknown>>;
};
const step = { run: async (_name: string, f: () => unknown) => f() };

// 09:00 in Muscat (UTC+4) — the seeker's own send hour.
const MUSCAT_NINE_AM = new Date("2026-10-27T05:00:00Z");
// The once-a-day trigger Inngest was still firing: 13:00 in Muscat.
const STALE_TRIGGER_TIME = new Date("2026-10-27T09:00:00Z");

const at = (when: Date) => jest.setSystemTime(when);
const hoursBefore = (when: Date, h: number) => new Date(when.getTime() - h * 3600e3);
const runStatusCalls = () =>
  updateCronRunStatus.mock.calls.filter(([key]) => key === "dailyRecommendations") as Array<[string, string, string]>;

beforeAll(() => jest.useFakeTimers({ doNotFake: ["nextTick", "setImmediate", "queueMicrotask"] }));
afterAll(() => jest.useRealTimers());
beforeEach(() => {
  jest.clearAllMocks();
  isCronEnabled.mockResolvedValue(true);
  getSystemConfig.mockResolvedValue({
    cronJobs: { dailyRecommendations: { lastRunAt: hoursBefore(MUSCAT_NINE_AM, 1), lastRunStatus: "success" } },
  });
});

describe("daily-job-recommendations run status", () => {
  it("declares the hourly trigger the 9am-local gate depends on", () => {
    expect(fn.config.triggers).toEqual([{ cron: "0 * * * *" }]);
  });

  it("mails a Gulf seeker at their own 9am and records the run", async () => {
    at(MUSCAT_NINE_AM);
    const result = await fn.handler({ step });

    expect(result).toMatchObject({ processed: 1, emitted: 1 });
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ name: "notification/daily-digest" }));
    expect(runStatusCalls()).toEqual([["dailyRecommendations", "success", expect.stringContaining("1 digest")]]);
  });

  it("records a run that found nobody due — the run that used to leave no trace", async () => {
    at(STALE_TRIGGER_TIME);
    getSystemConfig.mockResolvedValue({
      cronJobs: { dailyRecommendations: { lastRunAt: hoursBefore(STALE_TRIGGER_TIME, 1), lastRunStatus: "success" } },
    });

    const result = await fn.handler({ step });

    expect(result).toMatchObject({ processed: 0 });
    expect(send).not.toHaveBeenCalled();
    expect(runStatusCalls()).toEqual([["dailyRecommendations", "success", expect.stringMatching(/no seekers due/i)]]);
  });

  it("flags a run that arrives a day after the previous one, and still sends", async () => {
    at(MUSCAT_NINE_AM);
    getSystemConfig.mockResolvedValue({
      cronJobs: {
        dailyRecommendations: { lastRunAt: hoursBefore(MUSCAT_NINE_AM, 24), lastRunStatus: "success", lastRunMessage: "Processed 2" },
      },
    });

    const result = await fn.handler({ step });

    expect(result).toMatchObject({ emitted: 1 });
    expect(send).toHaveBeenCalledTimes(1);
    const [[, status, message]] = runStatusCalls();
    expect(status).toBe("error");
    expect(message).toMatch(/resync/i);
    expect(message).toContain("1 digest");
    expect(warn).toHaveBeenCalled();
  });

  it("does not flag the first run after an admin re-enables the job", async () => {
    at(MUSCAT_NINE_AM);
    getSystemConfig.mockResolvedValue({
      cronJobs: {
        dailyRecommendations: { lastRunAt: hoursBefore(MUSCAT_NINE_AM, 72), lastRunStatus: "success", lastRunMessage: ADMIN_DISABLED_SKIP_MESSAGE },
      },
    });

    await fn.handler({ step });

    expect(runStatusCalls()[0][1]).toBe("success");
  });

  it("keeps sending when the run status cannot be written", async () => {
    at(MUSCAT_NINE_AM);
    updateCronRunStatus.mockRejectedValueOnce(new Error("writes blocked"));

    await expect(fn.handler({ step })).resolves.toMatchObject({ emitted: 1 });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("keeps sending when the previous run cannot be read", async () => {
    at(MUSCAT_NINE_AM);
    getSystemConfig.mockRejectedValueOnce(new Error("config unreadable"));

    await expect(fn.handler({ step })).resolves.toMatchObject({ emitted: 1 });
    expect(runStatusCalls()[0][1]).toBe("success");
  });

  it("still records an admin skip with the message the drift check recognises", async () => {
    at(MUSCAT_NINE_AM);
    isCronEnabled.mockResolvedValue(false);

    await expect(fn.handler({ step })).resolves.toMatchObject({ skipped: true });
    expect(runStatusCalls()).toEqual([["dailyRecommendations", "success", ADMIN_DISABLED_SKIP_MESSAGE]]);
    expect(send).not.toHaveBeenCalled();
  });
});
