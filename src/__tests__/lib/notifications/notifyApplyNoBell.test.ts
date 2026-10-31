/**
 * @jest-environment node
 *
 * Client check 2026-10-30: a seeker who applied found "Application Received"
 * in their own bell — news of what they had just done. The confirmation still
 * goes by email and WhatsApp; only the bell row is dropped.
 */

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/models/Notification", () => ({ __esModule: true, default: { create: jest.fn().mockResolvedValue({ _id: "n1" }) } }));
jest.mock("@/lib/inngest/client", () => ({ inngest: { send: jest.fn().mockResolvedValue(undefined) } }));
jest.mock("@/lib/logger", () => ({
  __esModule: true,
  default: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

import { notify, notifyApplicationReceived } from "@/lib/notifications/trigger";

async function mocks() {
  const Notification = (await import("@/models/Notification")).default as unknown as { create: jest.Mock };
  const { inngest } = (await import("@/lib/inngest/client")) as unknown as { inngest: { send: jest.Mock } };
  return { create: Notification.create, send: inngest.send };
}

beforeEach(() => jest.clearAllMocks());

it("confirms an application by email and WhatsApp without a bell row", async () => {
  const { create, send } = await mocks();
  await notifyApplicationReceived("651000000000000000000001", "", "Driver", "Acme", "app1");
  expect(create).not.toHaveBeenCalled();
  expect(send).toHaveBeenCalledTimes(1);
  expect(send.mock.calls[0][0].data).toMatchObject({ type: "application_received", sendEmail: true, sendWhatsApp: true, notificationId: undefined });
});

it("still writes the bell row for every other notification", async () => {
  const { create, send } = await mocks();
  await notify({ userId: "651000000000000000000001", type: "system", title: "t", message: "m", sendEmail: true });
  expect(create).toHaveBeenCalledTimes(1);
  expect(send.mock.calls[0][0].data.notificationId).toBe("n1");
});
