/**
 * @jest-environment node
 *
 * What notify() hands the orchestrator.
 *
 * - `notificationId`: the in-app row notify() just wrote, so the orchestrator's
 *   dedup step can tell its own row from a genuine duplicate.
 * - `{ sendEmail: false }`: a caller that already sends its own, richer email
 *   for the event (calendar invitation, employer-written status mail) turns the
 *   orchestrator's email copy off. WhatsApp stays on.
 * - `sendPush`: the event is emitted only when a channel asks for it, and push
 *   rides on the event. A caller with email off and no WhatsApp leg (a bulk
 *   rejection, an interview reschedule or cancellation) asks for push itself.
 */

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/models/Notification", () => ({
  __esModule: true,
  default: { create: jest.fn().mockResolvedValue({ _id: "650000000000000000000009" }) },
}));
jest.mock("@/lib/inngest/client", () => ({ inngest: { send: jest.fn().mockResolvedValue(undefined) } }));
jest.mock("@/lib/logger", () => ({
  __esModule: true,
  default: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));
jest.mock("@/lib/notifications/recipientZone", () => ({
  __esModule: true,
  FALLBACK_TIME_ZONE: "Asia/Dubai",
  resolveRecipientTimeZone: jest.fn().mockResolvedValue("Asia/Dubai"),
}));

import {
  notify,
  notifyApplicationReceived,
  notifyInterviewScheduled,
  notifyOfferMade,
  notifyRejected,
  notifyStatusChange,
} from "@/lib/notifications/trigger";

async function mocks() {
  const Notification = (await import("@/models/Notification")).default as unknown as { create: jest.Mock };
  const { inngest } = (await import("@/lib/inngest/client")) as unknown as { inngest: { send: jest.Mock } };
  return { create: Notification.create, send: inngest.send };
}

beforeEach(() => jest.clearAllMocks());

describe("notify() event", () => {
  it("carries the id of the in-app row it just wrote", async () => {
    const { send } = await mocks();
    await notify({ userId: "u1", type: "system", title: "Hello", message: "World", sendEmail: true });
    expect(send).toHaveBeenCalledWith({
      name: "notification/instant",
      data: expect.objectContaining({ notificationId: "650000000000000000000009", title: "Hello", message: "World" }),
    });
  });
});

describe("push-only notify()", () => {
  const base = { userId: "u1", type: "interview_update" as const, title: "Interview Cancelled", message: "Cancelled." };

  it("emits when only sendPush is set, with email and WhatsApp off", async () => {
    const { create, send } = await mocks();
    await notify({ ...base, sendEmail: false, sendPush: true });
    expect(create).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledTimes(1);
    const data = send.mock.calls[0][0].data;
    expect(data.sendEmail).toBe(false);
    expect(data.sendWhatsApp).toBeFalsy();
  });

  it("still emits nothing when no channel asks for the event", async () => {
    const { create, send } = await mocks();
    await notify({ ...base, sendEmail: false });
    expect(create).toHaveBeenCalledTimes(1);
    expect(send).not.toHaveBeenCalled();
  });
});

describe("helpers whose caller sends its own email", () => {
  it.each([
    ["notifyApplicationReceived", () => notifyApplicationReceived("u1", "", "Nurse", "Acme", "a1", { sendEmail: false })],
    ["notifyStatusChange", () => notifyStatusChange("u1", "Nurse", "shortlisted", "a1", { sendEmail: false })],
    ["notifyOfferMade", () => notifyOfferMade("u1", "Nurse", "Acme", "a1", { sendEmail: false })],
    ["notifyInterviewScheduled", () => notifyInterviewScheduled("u1", "Nurse", new Date("2026-10-05T06:00:00Z"), "Dubai office", "i1", { sendEmail: false })],
  ])("%s keeps the in-app row and WhatsApp but drops the email copy", async (_name, call) => {
    const { create, send } = await mocks();
    await call();
    expect(create).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].data).toEqual(expect.objectContaining({ sendEmail: false, sendWhatsApp: true }));
  });

  it("notifyRejected with email off and no push request writes the in-app row and emits nothing", async () => {
    const { create, send } = await mocks();
    await notifyRejected("u1", "Nurse", "a1", { sendEmail: false });
    expect(create).toHaveBeenCalledTimes(1);
    expect(send).not.toHaveBeenCalled();
  });

  it("notifyRejected with email off and sendPush emits a push-only event (rejections have no WhatsApp leg)", async () => {
    const { create, send } = await mocks();
    await notifyRejected("u1", "Nurse", "a1", { sendEmail: false, sendPush: true });
    expect(create).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledTimes(1);
    const data = send.mock.calls[0][0].data;
    expect(data).toEqual(expect.objectContaining({ userId: "u1", type: "application_status_update", sendEmail: false }));
    expect(data.sendWhatsApp).toBeFalsy();
  });

  it("still emails by default", async () => {
    const { send } = await mocks();
    await notifyStatusChange("u1", "Nurse", "shortlisted", "a1");
    expect(send.mock.calls[0][0].data).toEqual(expect.objectContaining({ sendEmail: true, sendWhatsApp: true }));
  });
});
