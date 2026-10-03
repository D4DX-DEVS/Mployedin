/**
 * @jest-environment node
 *
 * The dedup step looked for a Notification with the same user, type and title
 * from the last five minutes. notify() writes exactly that row before it emits
 * the event, so from 2026-04-17 every run found its own row and stopped before
 * email, WhatsApp and push. The step now ignores the row it was started for
 * (and any later one), and only an identical notification — same type, title,
 * message and link — counts as a duplicate.
 *
 * Notification.findOne is backed by an in-memory collection here, so the query
 * the step builds is evaluated rather than stubbed out. A separate test casts
 * that same filter through the real Notification model.
 */
import mongoose from "mongoose";

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/logger", () => ({ __esModule: true, default: { error: jest.fn(), info: jest.fn(), warn: jest.fn() } }));
jest.mock("@/lib/inngest/client", () => ({
  inngest: { createFunction: (config: unknown, handler: unknown) => ({ config, handler }), send: jest.fn().mockResolvedValue(undefined) },
}));
jest.mock("@/models/SystemConfig", () => ({
  getSystemConfig: jest.fn().mockResolvedValue({ globalDefaults: { maintenanceMode: false } }),
  getUserOverride: jest.fn().mockResolvedValue(null),
}));

interface Row { _id: string; userId: string; type: string; title: string; body: string; actionUrl?: string; createdAt: Date }
let rows: Row[] = [];
const queries: Array<Record<string, unknown>> = [];

/** Evaluates the operators the dedup query may use; anything else fails the test loudly. */
function matches(row: Row, query: Record<string, unknown>): boolean {
  return Object.entries(query).every(([field, condition]) => {
    const value = (row as unknown as Record<string, unknown>)[field];
    // { field: null } matches a missing field too, as it does in MongoDB.
    if (condition === null) return value === undefined || value === null;
    if (condition && typeof condition === "object" && !(condition instanceof Date)) {
      return Object.entries(condition as Record<string, unknown>).every(([op, operand]) => {
        if (op === "$gte") return value instanceof Date && value.getTime() >= (operand as Date).getTime();
        if (op === "$lt") return value !== undefined && String(value) < String(operand);
        if (op === "$ne") return String(value) !== String(operand);
        throw new Error(`matcher does not support ${op}`);
      });
    }
    return value !== undefined && String(value) === String(condition);
  });
}

jest.mock("@/models/Notification", () => ({
  __esModule: true,
  default: {
    findOne: (query: Record<string, unknown>) => {
      queries.push(query);
      return { lean: async () => rows.find((row) => matches(row, query)) ?? null };
    },
  },
}));
const recipient = { name: "Sara Ali", email: "sara@example.com", role: "job_seeker", locale: "en" };
jest.mock("@/models/User", () => ({
  __esModule: true,
  default: { findById: () => ({ select: () => ({ lean: async () => recipient }) }) },
}));
jest.mock("@/models/NotificationPreference", () => ({
  getOrCreatePreferences: async () => ({
    toObject: () => ({ unsubscribedAll: false, categories: { applications: { enabled: true, channels: ["in_app", "email", "whatsapp"] } } }),
  }),
  typeToCategory: () => "applications",
}));
const sendEmail = jest.fn().mockResolvedValue({ messageId: "m" });
jest.mock("@/lib/communications/email", () => ({ sendEmail: (...a: unknown[]) => sendEmail(...a) }));
jest.mock("@/lib/communications/unsubscribeLink", () => ({ unsubscribeUrl: () => "https://x/unsub", notificationSettingsPath: () => "/settings" }));
let pushEnabled = false;
const sendPush = jest.fn();
jest.mock("@/lib/push", () => ({ isPushEnabled: () => pushEnabled, sendPushToUser: (...a: unknown[]) => sendPush(...a) }));
const deliver = jest.fn();
jest.mock("@/lib/communications/whatsapp/notificationDelivery", () => ({ deliverNotificationWhatsApp: (...a: unknown[]) => deliver(...a) }));

import { notificationOrchestrator } from "@/lib/inngest/notificationOrchestrator";

const step = { run: async <T,>(_name: string, fn: () => Promise<T>) => fn() };
const run = (data: Record<string, unknown>) =>
  (notificationOrchestrator as unknown as {
    handler: (arg: { event: { data: unknown }; step: typeof step }) => Promise<{ delivered?: string[]; skipped?: boolean; reason?: string }>;
  }).handler({ event: { data }, step });

// notify() writes a row before it emits, and the dedup only counts rows with a
// smaller _id than the run's own. Within one server an ObjectId grows with
// creation order; across servers it is only ordered to the second.
const FIRST = "650000000000000000000001";
const SECOND = "650000000000000000000002";

const notification = {
  userId: "651000000000000000000001",
  type: "application_status_update",
  title: "Application Status Updated",
  message: 'Your application for "Nurse" has been moved to: SHORTLISTED.',
  link: "/job-seeker/applications",
};
const event = (notificationId: string, overrides: Record<string, unknown> = {}) => ({
  ...notification,
  notificationId,
  sendEmail: true,
  sendWhatsApp: true,
  ...overrides,
});
/** The row notify() wrote for an event — body and actionUrl are how message and link are stored. */
const row = (_id: string, overrides: Partial<Row> = {}): Row => ({
  _id,
  userId: notification.userId,
  type: notification.type,
  title: notification.title,
  body: notification.message,
  actionUrl: notification.link,
  createdAt: new Date(Date.now() - 60_000),
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  rows = [];
  queries.length = 0;
  pushEnabled = false;
  deliver.mockResolvedValue({ status: "sent", messageId: "wamid.1", via: "template" });
});

describe("orchestrator dedup", () => {
  it("delivers when the only match is the row the run was started for", async () => {
    rows = [row(FIRST)];
    const res = await run(event(FIRST));
    expect(res.skipped).toBeUndefined();
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(deliver).toHaveBeenCalledTimes(1);
    expect(res.delivered).toEqual(["in_app", "email", "whatsapp"]);
  });

  it("skips a second identical event inside the five-minute window", async () => {
    rows = [row(FIRST), row(SECOND)];
    const res = await run(event(SECOND));
    expect(res).toEqual({ skipped: true, reason: "duplicate within 5 min window" });
    expect(sendEmail).not.toHaveBeenCalled();
    expect(deliver).not.toHaveBeenCalled();
  });

  it("still delivers the first of two identical events when both rows already exist", async () => {
    // Excluding only the run's own row would make each run see the other and
    // drop both; only the earlier row may silence the later one.
    rows = [row(FIRST), row(SECOND)];
    const res = await run(event(FIRST));
    expect(res.skipped).toBeUndefined();
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("delivers a second update that shares the title but not the message", async () => {
    rows = [row(FIRST, { body: 'Your application for "Welder" has been moved to: INTERVIEW.' }), row(SECOND)];
    const res = await run(event(SECOND));
    expect(res.skipped).toBeUndefined();
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("delivers when an otherwise identical notification points somewhere else", async () => {
    rows = [row(FIRST, { actionUrl: "/job-seeker/interviews" }), row(SECOND)];
    const res = await run(event(SECOND));
    expect(res.skipped).toBeUndefined();
  });

  it("ignores an identical notification older than five minutes", async () => {
    rows = [row(FIRST, { createdAt: new Date(Date.now() - 6 * 60_000) }), row(SECOND)];
    const res = await run(event(SECOND));
    expect(res.skipped).toBeUndefined();
  });

  it("matches on message and link, and on no link when the event has none", async () => {
    rows = [row(FIRST, { actionUrl: undefined })];
    await run(event(FIRST, { link: undefined }));
    expect(queries[0]).toEqual(
      expect.objectContaining({ userId: notification.userId, type: notification.type, title: notification.title, body: notification.message, actionUrl: null }),
    );

    queries.length = 0;
    await run(event(FIRST));
    expect(queries[0]).toEqual(expect.objectContaining({ actionUrl: notification.link }));
  });

  it("does not count an earlier identical row that has a link against an event that has none", async () => {
    rows = [row(FIRST), row(SECOND, { actionUrl: undefined })];
    const res = await run(event(SECOND, { link: undefined }));
    expect(res.skipped).toBeUndefined();
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("still skips a link-less event when the earlier identical row has no link either", async () => {
    rows = [row(FIRST, { actionUrl: undefined }), row(SECOND, { actionUrl: undefined })];
    const res = await run(event(SECOND, { link: undefined }));
    expect(res).toEqual({ skipped: true, reason: "duplicate within 5 min window" });
  });

  it("falls back to the query without an id bound for a legacy event that has no notificationId", async () => {
    // Events already queued when this shipped carry no notificationId. They
    // behave as before: the run's own row matches, so it is skipped.
    const legacy = { ...notification, sendEmail: true, sendWhatsApp: true };
    rows = [row(FIRST)];
    const res = await run(legacy);
    expect(queries[0]).not.toHaveProperty("_id");
    expect(queries[0]).toEqual(
      expect.objectContaining({ userId: notification.userId, type: notification.type, title: notification.title, body: notification.message, actionUrl: notification.link }),
    );
    expect(res).toEqual({ skipped: true, reason: "duplicate within 5 min window" });

    rows = [];
    expect((await run(legacy)).skipped).toBeUndefined();
  });
});

describe("the dedup filter against the real Notification model", () => {
  // The in-memory collection above compares strings. MongoDB compares types, and
  // the event carries userId and notificationId as strings, so the filter only
  // finds anything if Mongoose casts them to ObjectIds.
  const RealNotification = (jest.requireActual("@/models/Notification") as { default: mongoose.Model<unknown> }).default;

  it("casts userId and the _id bound to ObjectIds and keeps the window a Date", async () => {
    rows = [row(SECOND)];
    await run(event(SECOND));

    const cast = RealNotification.findOne(queries[0]).cast(RealNotification) as {
      userId: unknown;
      _id: { $lt: unknown };
      createdAt: { $gte: unknown };
      title: unknown;
      body: unknown;
      actionUrl: unknown;
    };
    expect(cast.userId).toBeInstanceOf(mongoose.Types.ObjectId);
    expect(String(cast.userId)).toBe(notification.userId);
    expect(cast._id.$lt).toBeInstanceOf(mongoose.Types.ObjectId);
    expect(String(cast._id.$lt)).toBe(SECOND);
    expect(cast.createdAt.$gte).toBeInstanceOf(Date);
    expect(cast.title).toBe(notification.title);
    expect(cast.body).toBe(notification.message);
    expect(cast.actionUrl).toBe(notification.link);
  });

  it("keeps a link-less event's null link through the cast", async () => {
    rows = [row(SECOND, { actionUrl: undefined })];
    await run(event(SECOND, { link: undefined }));
    const cast = RealNotification.findOne(queries[0]).cast(RealNotification) as { actionUrl: unknown };
    expect(cast.actionUrl).toBeNull();
  });
});

describe("orchestrator channel flags", () => {
  it("a push-only event sends no email and no WhatsApp message, only push", async () => {
    // notify({ sendEmail: false, sendPush: true }) emits sendEmail false and no
    // sendWhatsApp. The push step depends only on isPushEnabled() and the
    // category, so it runs; the other two steps need their own flag.
    pushEnabled = true;
    rows = [row(FIRST)];
    const res = await run(event(FIRST, { sendEmail: false, sendWhatsApp: undefined }));
    expect(sendEmail).not.toHaveBeenCalled();
    expect(deliver).not.toHaveBeenCalled();
    // The push link carries the recipient's locale (notificationOrchestratorLinks.test.ts).
    expect(sendPush).toHaveBeenCalledWith(
      notification.userId,
      expect.objectContaining({ title: notification.title, body: notification.message, link: "/en/job-seeker/applications" }),
    );
    expect(res.delivered).toEqual(["in_app", "push"]);
  });
});
