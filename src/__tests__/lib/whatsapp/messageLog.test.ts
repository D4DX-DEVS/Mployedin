/**
 * @jest-environment node
 */
jest.mock("@/lib/logger", () => ({ __esModule: true, default: { error: jest.fn(), info: jest.fn(), warn: jest.fn() } }));
import logger from "@/lib/logger";
import { WhatsAppMessageLog, WHATSAPP_MESSAGE_STATUSES, WHATSAPP_SOURCES, logWhatsAppDelivery } from "@/models/WhatsAppMessageLog";

describe("the exported status and source lists", () => {
  it("are the values the schema accepts, so a route filtering on them cannot drift from the model", () => {
    expect(WhatsAppMessageLog.schema.path("status").options.enum).toEqual([...WHATSAPP_MESSAGE_STATUSES]);
    expect(WhatsAppMessageLog.schema.path("source").options.enum).toEqual([...WHATSAPP_SOURCES]);
    expect([...WHATSAPP_MESSAGE_STATUSES].sort()).toEqual(["delivered", "failed", "mock", "read", "sent", "skipped"]);
    expect([...WHATSAPP_SOURCES].sort()).toEqual(["auto_reply", "broadcast", "orchestrator", "schedule", "test"]);
  });
});

describe("logWhatsAppDelivery", () => {
  afterEach(() => jest.restoreAllMocks());

  it("writes one row with a sentAt timestamp", async () => {
    const create = jest.spyOn(WhatsAppMessageLog, "create").mockResolvedValue({} as never);
    await logWhatsAppDelivery({ to: "+971501234567", kind: "text", source: "test", category: "system", status: "mock" });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ to: "+971501234567", status: "mock", sentAt: expect.any(Date) }));
  });

  it("swallows a write failure so a logged send is never reported as failed", async () => {
    const consoleError = jest.spyOn(console, "error").mockImplementation(() => undefined);
    const failure = new Error("quota exceeded");
    jest.spyOn(WhatsAppMessageLog, "create").mockRejectedValue(failure);
    await expect(
      logWhatsAppDelivery({ to: "+971501234567", kind: "text", source: "test", category: "system", status: "sent", waMessageId: "wamid.1" }),
    ).resolves.toBeUndefined();
    // The cause is reported through the app logger (not console) so a full or unreachable database is not a silent gap.
    expect(logger.error).toHaveBeenCalledWith({ err: failure }, "[whatsapp-log] could not record message");
    expect(consoleError).not.toHaveBeenCalled();
  });
});
