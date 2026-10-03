/**
 * @jest-environment node
 *
 * Which transactional helpers ask the orchestrator for a WhatsApp delivery
 * (spec §5). Application received, status change, interview scheduled,
 * interview selected, offer made and commission paid go out on WhatsApp;
 * rejections deliberately stay email-only.
 */

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/models/Notification", () => ({ __esModule: true, default: { create: jest.fn().mockResolvedValue({}) } }));
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
  notifyApplicationReceived,
  notifyCommissionPaid,
  notifyInterviewScheduled,
  notifyInterviewSelected,
  notifyOfferMade,
  notifyRejected,
  notifyStatusChange,
} from "@/lib/notifications/trigger";

async function sentEvent(): Promise<{ sendEmail?: boolean; sendWhatsApp?: boolean }> {
  const { inngest } = (await import("@/lib/inngest/client")) as unknown as { inngest: { send: jest.Mock } };
  expect(inngest.send).toHaveBeenCalledTimes(1);
  return inngest.send.mock.calls[0][0].data;
}

beforeEach(() => jest.clearAllMocks());

describe("notify helpers that go out on WhatsApp", () => {
  it.each([
    ["notifyApplicationReceived", () => notifyApplicationReceived("u1", "Sara", "Nurse", "Acme", "a1")],
    ["notifyStatusChange", () => notifyStatusChange("u1", "Nurse", "shortlisted", "a1")],
    ["notifyInterviewScheduled", () => notifyInterviewScheduled("u1", "Nurse", new Date("2026-10-05T06:00:00Z"), "Dubai office", "i1")],
    ["notifyInterviewSelected", () => notifyInterviewSelected("u1", "Nurse", "Acme", "a1")],
    ["notifyOfferMade", () => notifyOfferMade("u1", "Nurse", "Acme", "a1")],
    ["notifyCommissionPaid", () => notifyCommissionPaid("u1", "agent", 500, "AED", "REF-1")],
  ])("%s asks for email and WhatsApp", async (_name, call) => {
    await call();
    expect(await sentEvent()).toEqual(expect.objectContaining({ sendEmail: true, sendWhatsApp: true }));
  });

  it("notifyRejected stays email-only", async () => {
    await notifyRejected("u1", "Nurse", "a1");
    const data = await sentEvent();
    expect(data.sendEmail).toBe(true);
    expect(data.sendWhatsApp).toBeFalsy();
  });
});
