/**
 * @jest-environment node
 *
 * Client report 2026-09-30 (#8): people were notified about what they did
 * themselves — an employer moving a candidate got "Application stage changed".
 * A notification names who acted (`actorId`); the actor is not told, anyone
 * else still is.
 */

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/models/Notification", () => ({ __esModule: true, default: { create: jest.fn().mockResolvedValue({}) } }));
jest.mock("@/lib/inngest/client", () => ({ inngest: { send: jest.fn().mockResolvedValue(undefined) } }));
jest.mock("@/lib/logger", () => ({
  __esModule: true,
  default: { warn: jest.fn(), error: jest.fn(), info: jest.fn(), debug: jest.fn() },
}));

import { notify } from "@/lib/notifications/trigger";

const base = { type: "system" as const, title: "Application stage changed", message: "moved", sendEmail: true };

async function mocks() {
  const Notification = (await import("@/models/Notification")).default as unknown as { create: jest.Mock };
  const { inngest } = (await import("@/lib/inngest/client")) as unknown as { inngest: { send: jest.Mock } };
  return { create: Notification.create, send: inngest.send };
}

beforeEach(() => jest.clearAllMocks());

it("does not tell the person who did it", async () => {
  const { create, send } = await mocks();
  await notify({ ...base, userId: "651000000000000000000001", actorId: "651000000000000000000001" });
  expect(create).not.toHaveBeenCalled();
  expect(send).not.toHaveBeenCalled();
});

it("still tells everyone else — a colleague, agent or admin moved the candidate", async () => {
  const { create, send } = await mocks();
  await notify({ ...base, userId: "651000000000000000000001", actorId: "651000000000000000000002" });
  expect(create).toHaveBeenCalledTimes(1);
  expect(send).toHaveBeenCalledTimes(1);
});

it("behaves as before when no actor is named (system events)", async () => {
  const { create } = await mocks();
  await notify({ ...base, userId: "651000000000000000000001" });
  expect(create).toHaveBeenCalledTimes(1);
});
