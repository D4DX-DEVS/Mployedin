/**
 * @jest-environment node
 *
 * notify() stores links without a locale ("/job-seeker/interviews"), and the
 * orchestrator put that raw link in the email button and the push payload. A
 * link with no locale makes src/proxy.ts read its first path segment as the
 * locale, so a signed-out recipient who clicked it looped on
 * /job-seeker/login. Email and push now carry the recipient's locale, through
 * the same helper the notification bell uses (localizeActionUrl): it adds the
 * locale to a bare path and swaps a leading /en or /ar for the recipient's.
 * Dedup keeps matching the link as stored.
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
const dedupQueries: Array<Record<string, unknown>> = [];
jest.mock("@/models/Notification", () => ({
  __esModule: true,
  default: {
    findOne: (query: Record<string, unknown>) => {
      dedupQueries.push(query);
      return { lean: async () => null };
    },
  },
}));
let recipient: { name: string; email: string; role: string; locale?: string } | null = null;
jest.mock("@/models/User", () => ({
  __esModule: true,
  default: { findById: () => ({ select: () => ({ lean: async () => recipient }) }) },
}));
jest.mock("@/models/NotificationPreference", () => ({
  getOrCreatePreferences: async () => ({
    toObject: () => ({ unsubscribedAll: false, categories: { interviews: { enabled: true, channels: ["in_app", "email", "whatsapp"] } } }),
  }),
  typeToCategory: () => "interviews",
}));
const sendEmail = jest.fn().mockResolvedValue({ messageId: "m" });
jest.mock("@/lib/communications/email", () => ({ sendEmail: (...a: unknown[]) => sendEmail(...a) }));
jest.mock("@/lib/communications/unsubscribeLink", () => ({ unsubscribeUrl: () => null, notificationSettingsPath: () => "/settings" }));
const sendPush = jest.fn();
jest.mock("@/lib/push", () => ({ isPushEnabled: () => true, sendPushToUser: (...a: unknown[]) => sendPush(...a) }));
jest.mock("@/lib/communications/whatsapp/notificationDelivery", () => ({ deliverNotificationWhatsApp: jest.fn() }));

import { notificationOrchestrator } from "@/lib/inngest/notificationOrchestrator";

const step = { run: async <T,>(_name: string, fn: () => Promise<T>) => fn() };
const run = (data: Record<string, unknown>) =>
  (notificationOrchestrator as unknown as {
    handler: (arg: { event: { data: unknown }; step: typeof step }) => Promise<unknown>;
  }).handler({ event: { data }, step });

const BASE_URL = "https://app.example.test";
const event = (link: string | undefined) => ({
  userId: "651000000000000000000001",
  type: "interview_scheduled",
  title: "Interview Scheduled",
  message: "Your interview is scheduled.",
  link,
  sendEmail: true,
  sendWhatsApp: false,
  notificationId: "650000000000000000000001",
});
const emailHtml = () => (sendEmail.mock.calls[0][0] as { html: string }).html;
const buttonHref = () => /href="([^"]*)"[^>]*>View Details</.exec(emailHtml())?.[1];
const pushLink = () => (sendPush.mock.calls[0][1] as { link?: string }).link;

const savedBaseUrl = process.env.NEXT_PUBLIC_APP_URL;
beforeAll(() => { process.env.NEXT_PUBLIC_APP_URL = BASE_URL; });
afterAll(() => {
  if (savedBaseUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
  else process.env.NEXT_PUBLIC_APP_URL = savedBaseUrl;
});
beforeEach(() => {
  jest.clearAllMocks();
  dedupQueries.length = 0;
  recipient = { name: "Sara Ali", email: "sara@example.com", role: "job_seeker", locale: "en" };
});

describe("links in the email and the push payload carry the recipient's locale", () => {
  it("adds the locale to a bare path, in both the email button and the push link", async () => {
    await run(event("/job-seeker/interviews"));
    expect(buttonHref()).toBe(`${BASE_URL}/en/job-seeker/interviews`);
    expect(pushLink()).toBe("/en/job-seeker/interviews");
  });

  it("uses an Arabic recipient's locale for a bare path", async () => {
    recipient = { ...recipient!, locale: "ar" };
    await run(event("/job-seeker/interviews"));
    expect(buttonHref()).toBe(`${BASE_URL}/ar/job-seeker/interviews`);
    expect(pushLink()).toBe("/ar/job-seeker/interviews");
  });

  it("keeps the query string of a bare path", async () => {
    recipient = { ...recipient!, locale: "ar" };
    await run(event("/employer/settings?tab=notifications"));
    expect(buttonHref()).toBe(`${BASE_URL}/ar/employer/settings?tab=notifications`);
    expect(pushLink()).toBe("/ar/employer/settings?tab=notifications");
  });

  it("swaps a stored /en/ prefix for an Arabic recipient's locale, as localizeActionUrl does", async () => {
    recipient = { ...recipient!, locale: "ar" };
    await run(event("/en/job-seeker/interviews"));
    expect(buttonHref()).toBe(`${BASE_URL}/ar/job-seeker/interviews`);
    expect(pushLink()).toBe("/ar/job-seeker/interviews");
  });

  it("swaps a stored /ar/ prefix for an English recipient's locale, never stacking them", async () => {
    await run(event("/ar/job-seeker/interviews"));
    expect(buttonHref()).toBe(`${BASE_URL}/en/job-seeker/interviews`);
    expect(pushLink()).toBe("/en/job-seeker/interviews");
  });

  it("leaves a link already in the recipient's locale as it is", async () => {
    await run(event("/en/job-seeker/interviews"));
    expect(buttonHref()).toBe(`${BASE_URL}/en/job-seeker/interviews`);
    expect(pushLink()).toBe("/en/job-seeker/interviews");
  });

  it("falls back to English for a recipient with no stored locale", async () => {
    recipient = { name: "Sara Ali", email: "sara@example.com", role: "job_seeker" };
    await run(event("/job-seeker/interviews"));
    expect(buttonHref()).toBe(`${BASE_URL}/en/job-seeker/interviews`);
    expect(pushLink()).toBe("/en/job-seeker/interviews");
  });

  it("localizes the push link when the recipient record is gone and no email can be sent", async () => {
    recipient = null;
    await run(event("/job-seeker/interviews"));
    expect(sendEmail).not.toHaveBeenCalled();
    expect(pushLink()).toBe("/en/job-seeker/interviews");
  });

  // C10: the link is built on the server, but it is escaped like every other value in the HTML anyway.
  it("escapes the link in the button's href, so a quote in it cannot end the attribute", async () => {
    await run(event('/job-seeker/interviews?x="><script>alert(1)</script>'));
    const html = emailHtml();
    expect(html).toContain(`href="${BASE_URL}/en/job-seeker/interviews?x=&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;"`);
    expect(html).not.toContain("<script>");
  });

  it("sends no button and no push link for a notification without a link", async () => {
    await run(event(undefined));
    expect(emailHtml()).not.toContain("View Details");
    expect(pushLink()).toBeUndefined();
  });

  it("still matches the link as stored when it looks for a duplicate", async () => {
    // The row notify() wrote holds the raw link; localizing the query would never match it.
    recipient = { ...recipient!, locale: "ar" };
    await run(event("/job-seeker/interviews"));
    expect(dedupQueries[0]).toEqual(expect.objectContaining({ actionUrl: "/job-seeker/interviews" }));
  });
});
