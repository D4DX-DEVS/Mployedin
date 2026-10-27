/**
 * @jest-environment node
 *
 * The send-email step returned early when the recipient had no email address —
 * or did not exist at all — and the run then reported "email" as delivered
 * anyway. On 2026-10-27 the orchestrator was running against a different
 * database from the app that wrote the notifications, could not find the
 * recipients, sent nothing, and every run still read `delivered: ["in_app",
 * "email"]`. A skipped email must say it was skipped, and why.
 */
jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
const warn = jest.fn();
jest.mock("@/lib/logger", () => ({
  __esModule: true,
  default: { error: jest.fn(), info: jest.fn(), warn: (...a: unknown[]) => warn(...a) },
}));
jest.mock("@/lib/inngest/client", () => ({
  inngest: { createFunction: (config: unknown, handler: unknown) => ({ config, handler }), send: jest.fn() },
}));
jest.mock("@/models/SystemConfig", () => ({
  getSystemConfig: jest.fn().mockResolvedValue({ globalDefaults: { maintenanceMode: false } }),
  getUserOverride: jest.fn().mockResolvedValue(null),
}));
jest.mock("@/models/Notification", () => ({
  __esModule: true,
  default: { findOne: () => ({ lean: async () => null }) },
}));
let recipient: Record<string, unknown> | null = null;
jest.mock("@/models/User", () => ({
  __esModule: true,
  default: { findById: () => ({ select: () => ({ lean: async () => recipient }) }) },
}));
jest.mock("@/models/NotificationPreference", () => ({
  getOrCreatePreferences: async () => ({
    toObject: () => ({ unsubscribedAll: false, categories: { system: { enabled: true, channels: ["in_app", "email"] } } }),
  }),
  typeToCategory: () => "system",
}));
const sendEmail = jest.fn().mockResolvedValue({ messageId: "m" });
jest.mock("@/lib/communications/email", () => ({ sendEmail: (...a: unknown[]) => sendEmail(...a) }));
jest.mock("@/lib/communications/unsubscribeLink", () => ({ unsubscribeUrl: () => "https://x/unsub", notificationSettingsPath: () => "/settings" }));
jest.mock("@/lib/push", () => ({ isPushEnabled: () => false, sendPushToUser: jest.fn() }));
jest.mock("@/lib/communications/whatsapp/notificationDelivery", () => ({ deliverNotificationWhatsApp: jest.fn() }));

import { notificationOrchestrator } from "@/lib/inngest/notificationOrchestrator";

type Result = { delivered?: string[]; skipped_channels?: string[]; reason?: string };
const step = { run: async <T,>(_name: string, fn: () => Promise<T>) => fn() };
const run = (data: Record<string, unknown>) =>
  (notificationOrchestrator as unknown as {
    handler: (arg: { event: { data: unknown }; step: typeof step }) => Promise<Result>;
  }).handler({ event: { data }, step });

const event = {
  userId: "69f475c1b8871ed92f45b1c3",
  type: "system",
  title: "Subscription expiring tomorrow",
  message: "Your plan renews tomorrow.",
  link: "/employer/billing",
  notificationId: "6ae0000000000000000000a1",
  sendEmail: true,
  sendWhatsApp: false,
};

beforeEach(() => {
  jest.clearAllMocks();
  recipient = { name: "Sara Ali", email: "sara@example.org", role: "employer", locale: "en" };
});

describe("orchestrator email outcome", () => {
  it("reports email delivered when it was sent", async () => {
    const res = await run(event);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(res.delivered).toEqual(["in_app", "email"]);
  });

  it("does not claim email when the recipient does not exist", async () => {
    recipient = null;
    const res = await run(event);
    expect(sendEmail).not.toHaveBeenCalled();
    expect(res.delivered).toEqual(["in_app"]);
    expect(res.skipped_channels).toEqual(["email"]);
    expect(res.reason).toBe("recipient not found");
    // A missing recipient means this run can't see the user who was notified —
    // worth a warning, because that is what a split database looks like.
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ userId: event.userId }),
      expect.stringContaining("recipient not found"),
    );
  });

  it("does not claim email when the recipient has no address", async () => {
    recipient = { name: "No Mail", role: "employer", locale: "en" };
    const res = await run(event);
    expect(sendEmail).not.toHaveBeenCalled();
    expect(res.delivered).toEqual(["in_app"]);
    expect(res.skipped_channels).toEqual(["email"]);
    expect(res.reason).toBe("no email address");
  });

  it("leaves the result unchanged when email was never asked for", async () => {
    const res = await run({ ...event, sendEmail: false });
    expect(sendEmail).not.toHaveBeenCalled();
    expect(res).toEqual({ delivered: ["in_app"], type: "system", userId: event.userId });
  });
});
