/**
 * @jest-environment node
 *
 * `notifyInterviewScheduled` baked the interview time with a literal
 * `timeZone: "Asia/Dubai"`. The in-app copy is re-rendered client-side (so it
 * followed the reader's browser), but the email and WhatsApp bodies are the
 * stored string — so those two channels contradicted the app for anyone
 * outside the Gulf. The stored string must be in the recipient's zone and must
 * name it.
 */

jest.mock("@/lib/db/mongoose", () => ({
  connectDB: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/models/Notification", () => ({
  __esModule: true,
  default: { create: jest.fn().mockResolvedValue({}) },
}));

jest.mock("@/lib/inngest/client", () => ({
  inngest: { send: jest.fn().mockResolvedValue(undefined) },
}));

jest.mock("@/lib/logger", () => ({
  __esModule: true,
  default: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

jest.mock("@/lib/notifications/recipientZone", () => ({
  __esModule: true,
  FALLBACK_TIME_ZONE: "Asia/Dubai",
  resolveRecipientTimeZone: jest.fn(),
}));

import { notifyInterviewScheduled } from "@/lib/notifications/trigger";

// 06:00 UTC = 10:00 Dubai = 07:00 London (BST) = 11:30 Kolkata.
const SCHEDULED_AT = new Date("2026-09-21T06:00:00Z");

async function messageFor(timeZone: string): Promise<string> {
  const { resolveRecipientTimeZone } = await import("@/lib/notifications/recipientZone");
  (resolveRecipientTimeZone as jest.Mock).mockResolvedValue(timeZone);

  const Notification = (await import("@/models/Notification")).default as unknown as {
    create: jest.Mock;
  };
  Notification.create.mockClear();

  await notifyInterviewScheduled("user_1", "React Developer", SCHEDULED_AT, "Dubai office", "iv_1");

  return Notification.create.mock.calls[0][0].body as string;
}

describe("notifyInterviewScheduled", () => {
  beforeEach(() => jest.clearAllMocks());

  it("states the time in the recipient's zone, not Dubai's", async () => {
    const body = await messageFor("Europe/London");
    expect(body).toMatch(/7:00|07:00/);
    expect(body).not.toMatch(/10:00/);
  });

  it("gives a Gulf recipient the Gulf time", async () => {
    expect(await messageFor("Asia/Dubai")).toMatch(/10:00/);
  });

  it("names the zone so the time is unambiguous", async () => {
    expect(await messageFor("Asia/Kolkata")).toContain("GMT+5:30");
    expect(await messageFor("Asia/Kolkata")).toMatch(/11:30/);
  });

  it("still carries the raw instant for clients that re-render it", async () => {
    const { resolveRecipientTimeZone } = await import("@/lib/notifications/recipientZone");
    (resolveRecipientTimeZone as jest.Mock).mockResolvedValue("Europe/London");
    const Notification = (await import("@/models/Notification")).default as unknown as {
      create: jest.Mock;
    };
    Notification.create.mockClear();

    await notifyInterviewScheduled("user_1", "React Developer", SCHEDULED_AT, "Dubai office", "iv_1");

    const meta = Notification.create.mock.calls[0][0].meta as {
      params: { dateIso: string; timeZone: string };
    };
    expect(meta.params.dateIso).toBe(SCHEDULED_AT.toISOString());
    expect(meta.params.timeZone).toBe("Europe/London");
  });
});
