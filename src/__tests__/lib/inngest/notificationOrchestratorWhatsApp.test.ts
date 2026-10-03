/**
 * @jest-environment node
 *
 * The orchestrator's WhatsApp step delegates every policy decision to
 * deliverNotificationWhatsApp and only reports the channel as delivered on
 * sent/mock.
 */
export {};

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/logger", () => ({ __esModule: true, default: { error: jest.fn(), info: jest.fn(), warn: jest.fn() } }));
jest.mock("@/lib/inngest/client", () => ({
  inngest: { createFunction: (config: unknown, handler: unknown) => ({ config, handler }), send: jest.fn().mockResolvedValue(undefined) },
}));
jest.mock("@/models/SystemConfig", () => ({
  getSystemConfig: jest.fn().mockResolvedValue({ globalDefaults: { maintenanceMode: false } }),
  getUserOverride: jest.fn().mockResolvedValue(null),
}));
jest.mock("@/models/Notification", () => ({ __esModule: true, default: { findOne: () => ({ lean: async () => null }) } }));
// What the load-recipient step selects: copy fields only. Phone and WhatsApp consent stay out of Inngest step output.
const recipient = { name: "Sara Ali", email: "sara@example.com", role: "job_seeker", locale: "en" };
const userSelect = jest.fn();
jest.mock("@/models/User", () => ({
  __esModule: true,
  default: {
    findById: () => ({
      select: (fields: string) => {
        userSelect(fields);
        return { lean: async () => recipient };
      },
    }),
  },
}));
let channels = ["in_app", "email", "whatsapp"];
jest.mock("@/models/NotificationPreference", () => ({
  getOrCreatePreferences: async () => ({ toObject: () => ({ unsubscribedAll: false, categories: { applications: { enabled: true, channels } } }) }),
  typeToCategory: () => "applications",
}));
const sendEmail = jest.fn().mockResolvedValue({ messageId: "m" });
jest.mock("@/lib/communications/email", () => ({ sendEmail: (...a: unknown[]) => sendEmail(...a) }));
jest.mock("@/lib/communications/unsubscribeLink", () => ({ unsubscribeUrl: () => "https://x/unsub", notificationSettingsPath: () => "/settings" }));
jest.mock("@/lib/push", () => ({ isPushEnabled: () => false, sendPushToUser: jest.fn() }));
const deliver = jest.fn();
jest.mock("@/lib/communications/whatsapp/notificationDelivery", () => ({ deliverNotificationWhatsApp: (...a: unknown[]) => deliver(...a) }));

import { notificationOrchestrator } from "@/lib/inngest/notificationOrchestrator";

const step = { run: async <T,>(_name: string, fn: () => Promise<T>) => fn() };
const run = (data: Record<string, unknown>) =>
  (notificationOrchestrator as unknown as { handler: (arg: { event: { data: unknown }; step: typeof step }) => Promise<{ delivered?: string[] }> }).handler({ event: { data }, step });

const params = { jobTitle: "Nurse", status: "shortlisted" };
const base = { userId: "u1", type: "application_status_update", title: "Application update", message: "Shortlisted", sendEmail: false, sendWhatsApp: true, params };

beforeEach(() => { jest.clearAllMocks(); channels = ["in_app", "email", "whatsapp"]; });

describe("orchestrator WhatsApp step", () => {
  it("delegates to deliverNotificationWhatsApp with the recipient and localized copy", async () => {
    deliver.mockResolvedValue({ status: "sent", messageId: "wamid.1", via: "template" });
    const res = await run(base);
    expect(deliver).toHaveBeenCalledWith(expect.objectContaining({ userId: "u1", type: "application_status_update", category: "applications", title: "Application update", message: "Shortlisted", recipient, params }));
    expect(res.delivered).toEqual(["in_app", "whatsapp"]);
  });
  it("reports whatsapp when the send was mocked", async () => {
    deliver.mockResolvedValue({ status: "mock", messageId: "mock-1", via: "template" });
    expect((await run(base)).delivered).toEqual(["in_app", "whatsapp"]);
  });
  it("does not report whatsapp when the delivery was skipped", async () => {
    deliver.mockResolvedValue({ status: "skipped", reason: "daily_cap" });
    expect((await run(base)).delivered).toEqual(["in_app"]);
  });
  it("does not report whatsapp when the send failed", async () => {
    deliver.mockResolvedValue({ status: "failed", reason: "Template paused" });
    expect((await run(base)).delivered).toEqual(["in_app"]);
  });
  it("does not call it when the user has not enabled the channel", async () => {
    channels = ["in_app", "email"];
    await run(base);
    expect(deliver).not.toHaveBeenCalled();
  });
  it("keeps the phone and WhatsApp consent state out of the load-recipient step output (the WhatsApp step re-reads them)", async () => {
    deliver.mockResolvedValue({ status: "sent", messageId: "wamid.1", via: "template" });
    await run(base);
    expect(userSelect).toHaveBeenCalledWith("name email role locale");
    expect(deliver.mock.calls[0][0].recipient).not.toHaveProperty("phone");
    expect(deliver.mock.calls[0][0].recipient).not.toHaveProperty("whatsapp");
  });
  it("does not call it when the notification did not ask for WhatsApp", async () => {
    await run({ ...base, sendWhatsApp: false });
    expect(deliver).not.toHaveBeenCalled();
  });
});
