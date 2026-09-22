/**
 * @jest-environment node
 *
 * Interview notification bodies were built with a literal
 * `timeZone: "Asia/Dubai"`, so every recipient was told the Gulf wall time
 * whatever zone they were in. The recipient's own zone has to win, and the
 * Dubai default only survives as a last resort.
 */

jest.mock("@/lib/db/mongoose", () => ({
  connectDB: jest.fn().mockResolvedValue(undefined),
}));

// The degradation test deliberately throws; keep its warn out of the run output.
jest.mock("@/lib/logger", () => ({
  __esModule: true,
  default: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

const leanMock = (value: unknown) => ({
  select: () => ({ lean: () => Promise.resolve(value) }),
});

jest.mock("@/models/JobSeeker", () => ({
  __esModule: true,
  default: { findOne: jest.fn() },
}));

jest.mock("@/models/NotificationPreference", () => ({
  __esModule: true,
  default: { findOne: jest.fn() },
}));

jest.mock("@/models/Agent", () => ({
  __esModule: true,
  Agent: { findOne: jest.fn() },
}));

jest.mock("@/models/SuperAgent", () => ({
  __esModule: true,
  SuperAgent: { findOne: jest.fn() },
}));

import {
  FALLBACK_TIME_ZONE,
  pickRecipientTimeZone,
  resolveRecipientTimeZone,
} from "@/lib/notifications/recipientZone";

describe("pickRecipientTimeZone", () => {
  it("prefers the zone on the role profile", () => {
    expect(
      pickRecipientTimeZone({ profileTimeZone: "Europe/London", preferenceTimeZone: "Asia/Dubai" }),
    ).toBe("Europe/London");
  });

  it("falls back to the notification preference when the profile has none", () => {
    expect(
      pickRecipientTimeZone({ profileTimeZone: undefined, preferenceTimeZone: "Asia/Kolkata" }),
    ).toBe("Asia/Kolkata");
  });

  it("skips zones this runtime does not recognise", () => {
    expect(
      pickRecipientTimeZone({ profileTimeZone: "Mars/Olympus", preferenceTimeZone: "Asia/Kolkata" }),
    ).toBe("Asia/Kolkata");
    expect(
      pickRecipientTimeZone({ profileTimeZone: "  ", preferenceTimeZone: "  " }),
    ).toBe(FALLBACK_TIME_ZONE);
  });

  it("ends at the documented fallback, never at the server's own zone", () => {
    expect(pickRecipientTimeZone({})).toBe(FALLBACK_TIME_ZONE);
    expect(FALLBACK_TIME_ZONE).toBe("Asia/Dubai");
  });
});

describe("resolveRecipientTimeZone", () => {
  let JobSeeker: { findOne: jest.Mock };
  let NotificationPreference: { findOne: jest.Mock };
  let Agent: { findOne: jest.Mock };
  let SuperAgent: { findOne: jest.Mock };

  beforeEach(async () => {
    jest.clearAllMocks();
    JobSeeker = (await import("@/models/JobSeeker")).default as never;
    NotificationPreference = (await import("@/models/NotificationPreference")).default as never;
    Agent = (await import("@/models/Agent")).Agent as never;
    SuperAgent = (await import("@/models/SuperAgent")).SuperAgent as never;

    JobSeeker.findOne.mockReturnValue(leanMock(null));
    NotificationPreference.findOne.mockReturnValue(leanMock(null));
    Agent.findOne.mockReturnValue(leanMock(null));
    SuperAgent.findOne.mockReturnValue(leanMock(null));
  });

  it("reads a job seeker's scheduling timezone", async () => {
    JobSeeker.findOne.mockReturnValue(leanMock({ settings: { timezone: "Europe/London" } }));
    await expect(resolveRecipientTimeZone("user_1")).resolves.toBe("Europe/London");
  });

  it("reads an agent's timezone when there is no seeker profile", async () => {
    Agent.findOne.mockReturnValue(leanMock({ timezone: "Asia/Karachi" }));
    await expect(resolveRecipientTimeZone("user_2")).resolves.toBe("Asia/Karachi");
  });

  it("reads a super agent's timezone", async () => {
    SuperAgent.findOne.mockReturnValue(leanMock({ timezone: "Asia/Riyadh" }));
    await expect(resolveRecipientTimeZone("user_3")).resolves.toBe("Asia/Riyadh");
  });

  it("uses the notification preference when no profile carries one", async () => {
    NotificationPreference.findOne.mockReturnValue(leanMock({ timezone: "America/New_York" }));
    await expect(resolveRecipientTimeZone("user_4")).resolves.toBe("America/New_York");
  });

  it("returns the fallback when the user has no zone anywhere", async () => {
    await expect(resolveRecipientTimeZone("user_5")).resolves.toBe(FALLBACK_TIME_ZONE);
  });

  it("returns the fallback rather than throwing when a lookup fails", async () => {
    JobSeeker.findOne.mockImplementation(() => {
      throw new Error("connection reset");
    });
    await expect(resolveRecipientTimeZone("user_6")).resolves.toBe(FALLBACK_TIME_ZONE);
  });
});
