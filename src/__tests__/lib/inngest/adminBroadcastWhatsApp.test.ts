/**
 * @jest-environment node
 */
export {};

jest.mock("@/lib/db/mongoose", () => ({ connectDB: jest.fn().mockResolvedValue(undefined) }));
jest.mock("@/lib/logger", () => ({ __esModule: true, default: { error: jest.fn(), info: jest.fn(), warn: jest.fn() } }));
jest.mock("@/lib/inngest/client", () => ({ inngest: { createFunction: (config: unknown, handler: unknown) => ({ config, handler }), send: jest.fn() } }));
const batch = [{ _id: "u1", email: "a@x.com", name: "A", phone: "+971501234567" }, { _id: "u2", email: "b@x.com", name: "B", phone: "+971501234568" }];
let pages: unknown[][] = [batch, []];
// Every User.find: its query and the projection it asked for. The cursor query
// (no $lte) pages through `pages`; the WhatsApp range query ($lte) gets the batch.
const finds: Array<{ q: Record<string, unknown>; select: string }> = [];
jest.mock("@/models/User", () => ({
  __esModule: true,
  default: {
    find: (q: Record<string, unknown>) => {
      const isRange = Boolean((q._id as { $lte?: unknown } | undefined)?.$lte);
      const pick = (s: string) => {
        finds.push({ q, select: s });
        return { lean: async () => (isRange ? batch : pages.shift() ?? []) };
      };
      return { sort: () => ({ limit: () => ({ select: pick }), select: pick }) };
    },
  },
}));
const insertMany = jest.fn().mockResolvedValue([]);
jest.mock("@/models/Notification", () => ({ __esModule: true, default: { insertMany: (...a: unknown[]) => insertMany(...a) } }));
const sendEmail = jest.fn().mockResolvedValue({ messageId: "m" });
jest.mock("@/lib/communications/email", () => ({ sendEmail: (...a: unknown[]) => sendEmail(...a) }));
jest.mock("@/lib/communications/broadcastAudience", () => ({ broadcastRecipientQuery: () => ({ isActive: true }) }));
const sendWhatsAppToUsers = jest.fn();
jest.mock("@/lib/communications/whatsapp/audienceSend", () => ({ sendWhatsAppToUsers: (...a: unknown[]) => sendWhatsAppToUsers(...a) }));

import { adminBroadcastSender } from "@/lib/inngest/adminBroadcast";

// Like Inngest: a step that succeeded is memoized by name and not run again when
// the function is replayed; a step that threw runs again on the next attempt.
function makeStep() {
  const memo = new Map<string, unknown>();
  const names: string[] = [];
  return {
    names,
    run: async <T,>(name: string, fn: () => Promise<T>): Promise<T> => {
      if (memo.has(name)) return memo.get(name) as T;
      names.push(name);
      const out = await fn();
      memo.set(name, out);
      return out;
    },
  };
}
type Step = ReturnType<typeof makeStep>;
const run = (data: Record<string, unknown>, step: Step = makeStep()) =>
  (adminBroadcastSender as unknown as { handler: (a: { event: { data: unknown }; step: Step }) => Promise<Record<string, number>> }).handler({ event: { data }, step });
const whatsapp = { templateName: "mployedin_admin_announcement", language: "en", params: ["{{firstName}}", "{{message}}"] };

beforeEach(() => {
  jest.clearAllMocks();
  pages = [batch, []];
  finds.length = 0;
  sendWhatsAppToUsers.mockResolvedValue({ sent: 2, failed: 0, skipped: 0 });
});

describe("admin broadcast — registration", () => {
  it("is triggered by the admin/broadcast event the communications route emits (without a trigger Inngest never runs it)", () => {
    const { config } = adminBroadcastSender as unknown as { config: { id: string; triggers?: unknown[] } };
    expect(config.id).toBe("admin-broadcast-sender");
    expect(config.triggers).toEqual([{ event: "admin/broadcast" }]);
  });
});

describe("admin broadcast — WhatsApp leg", () => {
  it("sends the batch through sendWhatsAppToUsers with the template and broadcast id", async () => {
    const res = await run({ title: "Maintenance", message: "Down tonight", targetAll: true, channels: ["in_app", "whatsapp"], whatsapp, broadcastId: "b1" });
    expect(sendWhatsAppToUsers).toHaveBeenCalledWith(batch, whatsapp, { source: "broadcast", category: "system", broadcastId: "b1", tokens: { title: "Maintenance", message: "Down tonight" } });
    expect(res.totalWhatsApp).toBe(2);
    expect(insertMany).toHaveBeenCalledTimes(1);
  });
  it("reads consent and the number fresh from the user, not from the event", async () => {
    await run({ title: "T", message: "M", targetAll: true, channels: ["whatsapp"], whatsapp, broadcastId: "b1" });
    const wa = finds.find((f) => (f.q._id as { $lte?: unknown } | undefined)?.$lte);
    expect(wa?.select.split(/\s+/)).toEqual(expect.arrayContaining(["_id", "phone", "name", "role", "locale", "whatsapp"]));
  });
  it("re-reads exactly the batch's _id range, so the step output carries no phone numbers", async () => {
    const step = makeStep();
    await run({ title: "T", message: "M", targetAll: true, channels: ["in_app", "whatsapp"], whatsapp }, step);
    expect(step.names).toEqual(["batch-0", "batch-0-wa", "batch-1"]);
    const range = finds.find((f) => (f.q._id as { $lte?: unknown } | undefined)?.$lte);
    expect(range?.q).toEqual({ isActive: true, _id: { $lte: "u2" } });
    // The cursor step never projects phone/consent.
    expect(finds[0].select).not.toContain("phone");
  });
  it("gives the second batch's WhatsApp step the range after the first batch's last id", async () => {
    const second = [{ _id: "u3", name: "C", phone: "+971501234569" }];
    pages = [batch, second, []];
    await run({ title: "T", message: "M", targetAll: true, channels: ["whatsapp"], whatsapp });
    const ranges = finds.filter((f) => (f.q._id as { $lte?: unknown } | undefined)?.$lte).map((f) => f.q._id);
    expect(ranges).toEqual([{ $lte: "u2" }, { $gt: "u2", $lte: "u3" }]);
  });
  it("does nothing on WhatsApp when the channel is not selected", async () => {
    const step = makeStep();
    await run({ title: "T", message: "M", targetAll: true, channels: ["in_app", "email"] }, step);
    expect(sendWhatsAppToUsers).not.toHaveBeenCalled();
    expect(step.names.some((n) => n.endsWith("-wa"))).toBe(false);
    expect(finds.every((f) => !f.select.includes("phone"))).toBe(true);
  });
  it("does nothing on WhatsApp when the channel is selected but no template came with the event", async () => {
    const res = await run({ title: "T", message: "M", targetAll: true, channels: ["in_app", "whatsapp"] });
    expect(sendWhatsAppToUsers).not.toHaveBeenCalled();
    expect(res.totalWhatsApp).toBe(0);
  });
  it("passes a zero-variable template through untouched", async () => {
    const hello = { templateName: "hello_world", language: "en_US", params: [] as string[] };
    await run({ title: "T", message: "M", targetAll: true, channels: ["whatsapp"], whatsapp: hello, broadcastId: "b2" });
    expect(sendWhatsAppToUsers).toHaveBeenCalledWith(batch, hello, expect.objectContaining({ broadcastId: "b2" }));
  });

  it("retries only the WhatsApp step when it throws: in-app rows and emails are not sent twice", async () => {
    sendWhatsAppToUsers.mockRejectedValueOnce(new Error("preference lookup failed"));
    const step = makeStep();
    const data = { title: "T", message: "M", targetAll: true, channels: ["in_app", "email", "whatsapp"], whatsapp, broadcastId: "b3" };
    await expect(run(data, step)).rejects.toThrow("preference lookup failed");
    // Inngest replays the function; memoized steps return their stored output.
    pages = [[]]; // batch-0 is memoized; the cursor step after it finds nobody
    const res = await run(data, step);
    expect(insertMany).toHaveBeenCalledTimes(1);
    expect(sendEmail).toHaveBeenCalledTimes(2);
    expect(sendWhatsAppToUsers).toHaveBeenCalledTimes(2);
    expect(res.totalWhatsApp).toBe(2);
  });

  it("sums sent, failed and skipped WhatsApp counts across batches", async () => {
    pages = [batch, [{ _id: "u3", name: "C", phone: "+971501234569" }], []];
    sendWhatsAppToUsers
      .mockResolvedValueOnce({ sent: 1, failed: 1, skipped: 0 })
      .mockResolvedValueOnce({ sent: 0, failed: 0, skipped: 1 });
    const res = await run({ title: "T", message: "M", targetAll: true, channels: ["whatsapp"], whatsapp, broadcastId: "b4" });
    expect(res).toEqual(expect.objectContaining({ totalWhatsApp: 1, totalWhatsAppFailed: 1, totalWhatsAppSkipped: 1, batches: 2 }));
    const logger = (await import("@/lib/logger")).default;
    expect(logger.info).toHaveBeenCalledWith(expect.objectContaining({ totalWhatsApp: 1, totalWhatsAppFailed: 1, totalWhatsAppSkipped: 1 }), expect.any(String));
  });
});
