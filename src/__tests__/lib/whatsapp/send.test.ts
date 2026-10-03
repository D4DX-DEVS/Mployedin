/**
 * @jest-environment node
 */
import { WhatsAppApiError } from "@/lib/communications/whatsapp/errors";

const sendTemplateMessage = jest.fn();
const sendTextMessage = jest.fn();
jest.mock("@/lib/communications/whatsapp/cloudApi", () => ({
  sendTemplateMessage: (...a: unknown[]) => sendTemplateMessage(...a),
  sendTextMessage: (...a: unknown[]) => sendTextMessage(...a),
}));
const logWhatsAppDelivery = jest.fn().mockResolvedValue(undefined);
jest.mock("@/models/WhatsAppMessageLog", () => ({
  __esModule: true,
  logWhatsAppDelivery: (...a: unknown[]) => logWhatsAppDelivery(...a),
  default: {},
}));
jest.mock("@/lib/logger", () => ({ __esModule: true, default: { error: jest.fn(), info: jest.fn(), warn: jest.fn() } }));
const isNumberSuppressed = jest.fn().mockResolvedValue(false);
jest.mock("@/models/WhatsAppSuppression", () => ({ __esModule: true, isNumberSuppressed: (...a: unknown[]) => isNumberSuppressed(...a) }));

import logger from "@/lib/logger";
import { sendWhatsAppTemplate, sendWhatsAppText } from "@/lib/communications/whatsapp/send";

function live() {
  process.env.WHATSAPP_ACCESS_TOKEN = "tok";
  process.env.WHATSAPP_PHONE_NUMBER_ID = "555";
  process.env.WHATSAPP_APP_SECRET = "sec";
  process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = "verify";
}
afterEach(() => {
  jest.clearAllMocks();
  isNumberSuppressed.mockResolvedValue(false);
  for (const k of ["WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_APP_SECRET", "WHATSAPP_WEBHOOK_VERIFY_TOKEN"]) process.env[k] = "";
});

// A STOP is also recorded against the number (WhatsAppSuppression), so it holds
// whichever account the number is typed on: a re-ticked channel cannot undo it.
describe("a number on the suppression list", () => {
  it("is skipped with reason opted_out before any send, and logged like the other skips", async () => {
    live();
    isNumberSuppressed.mockResolvedValue(true);
    const out = await sendWhatsAppTemplate({ to: "+971 50 123 4567", templateName: "t", language: "en", params: [], source: "orchestrator", userId: "u1", category: "applications" });
    expect(out).toEqual({ status: "skipped", reason: "opted_out" });
    expect(isNumberSuppressed).toHaveBeenCalledWith("+971501234567");
    expect(sendTemplateMessage).not.toHaveBeenCalled();
    expect(logWhatsAppDelivery).toHaveBeenCalledTimes(1);
    expect(logWhatsAppDelivery).toHaveBeenCalledWith(expect.objectContaining({ status: "skipped", skipReason: "opted_out", to: "+971501234567", userId: "u1", kind: "template", source: "orchestrator" }));
  });

  it("is skipped in mock mode too", async () => {
    isNumberSuppressed.mockResolvedValue(true);
    const out = await sendWhatsAppText({ to: "+971501234567", body: "hi", source: "test" });
    expect(out).toEqual({ status: "skipped", reason: "opted_out" });
    expect(logWhatsAppDelivery).toHaveBeenCalledWith(expect.objectContaining({ status: "skipped", skipReason: "opted_out", kind: "text" }));
    expect(logWhatsAppDelivery).not.toHaveBeenCalledWith(expect.objectContaining({ status: "mock" }));
  });

  it("is still reached by a send that bypasses the list (the STOP/START confirmations)", async () => {
    live();
    isNumberSuppressed.mockResolvedValue(true);
    sendTextMessage.mockResolvedValue({ messageId: "wamid.c" });
    const out = await sendWhatsAppText({ to: "+971501234567", body: "You will no longer receive…", source: "auto_reply", bypassSuppression: true });
    expect(out).toEqual({ status: "sent", messageId: "wamid.c" });
    expect(isNumberSuppressed).not.toHaveBeenCalled();
  });

  // C4: only the STOP/START text confirmations may skip the list. A template send has no bypass, so even a
  // caller that slips the flag in (an untyped object) is still checked.
  it("is still checked for a template send that carries a bypass flag", async () => {
    live();
    isNumberSuppressed.mockResolvedValue(true);
    const input = { to: "+971501234567", templateName: "t", language: "en", params: [], source: "broadcast", bypassSuppression: true } as Parameters<typeof sendWhatsAppTemplate>[0];
    const out = await sendWhatsAppTemplate(input);
    expect(out).toEqual({ status: "skipped", reason: "opted_out" });
    expect(isNumberSuppressed).toHaveBeenCalledWith("+971501234567");
    expect(sendTemplateMessage).not.toHaveBeenCalled();
  });

  it("refuses to send, without throwing, when the list cannot be read", async () => {
    live();
    isNumberSuppressed.mockRejectedValue(new Error("db down"));
    const out = await sendWhatsAppTemplate({ to: "+971501234567", templateName: "t", language: "en", params: [], source: "broadcast" });
    expect(out.status).toBe("failed");
    expect(sendTemplateMessage).not.toHaveBeenCalled();
    expect(logWhatsAppDelivery).toHaveBeenCalledWith(expect.objectContaining({ status: "failed", to: "+971501234567" }));
  });

  it("is not consulted for a number that cannot be normalised", async () => {
    await sendWhatsAppTemplate({ to: "0501234567", templateName: "t", language: "en", params: [], source: "test" });
    expect(isNumberSuppressed).not.toHaveBeenCalled();
  });
});

describe("sendWhatsAppTemplate", () => {
  it("returns mock and logs a mock row when not configured", async () => {
    const out = await sendWhatsAppTemplate({ to: "+971501234567", templateName: "t", language: "en", params: ["Sara"], source: "test" });
    expect(out.status).toBe("mock");
    expect(sendTemplateMessage).not.toHaveBeenCalled();
    expect(logWhatsAppDelivery).toHaveBeenCalledWith(expect.objectContaining({ status: "mock", to: "+971501234567", kind: "template", templateName: "t", source: "test" }));
  });

  it("sends with sanitised params and logs sent", async () => {
    live();
    sendTemplateMessage.mockResolvedValue({ messageId: "wamid.9" });
    const out = await sendWhatsAppTemplate({ to: "+971 50 123 4567", templateName: "t", language: "en", params: ["Sa\nra", "ok"], source: "orchestrator", userId: "u1", category: "applications", notificationType: "application_received" });
    expect(out).toEqual({ status: "sent", messageId: "wamid.9" });
    expect(sendTemplateMessage).toHaveBeenCalledWith({ to: "971501234567", name: "t", language: "en", bodyParams: ["Sa ra", "ok"] });
    expect(logWhatsAppDelivery).toHaveBeenCalledWith(expect.objectContaining({ status: "sent", to: "+971501234567", waMessageId: "wamid.9", userId: "u1", category: "applications", notificationType: "application_received" }));
  });

  it("logs failed with the Meta code and kind, without throwing", async () => {
    live();
    sendTemplateMessage.mockRejectedValue(new WhatsAppApiError({ code: 132001, message: "Template name does not exist", httpStatus: 404 }));
    const out = await sendWhatsAppTemplate({ to: "+971501234567", templateName: "missing", language: "en", params: [], source: "broadcast" });
    expect(out.status).toBe("failed");
    expect(logWhatsAppDelivery).toHaveBeenCalledWith(expect.objectContaining({ status: "failed", errorCode: 132001, errorKind: "template_error", errorMessage: "Template name does not exist" }));
  });

  it("keeps the phone number out of the failure log line (the log row already has it)", async () => {
    live();
    sendTemplateMessage.mockRejectedValue(new WhatsAppApiError({ code: 132001, message: "Template name does not exist", httpStatus: 404 }));
    await sendWhatsAppTemplate({ to: "+971501234567", templateName: "missing", language: "en", params: [], source: "broadcast" });
    const [ctx] = (logger.warn as jest.Mock).mock.calls[0];
    expect(ctx).not.toHaveProperty("to");
    expect(ctx).not.toHaveProperty("recipient");
    expect(ctx).toEqual({ template: "missing", errorKind: "template_error", errorCode: 132001, errorName: "WhatsAppApiError", errorMessage: "Template name does not exist" });
  });

  it("keeps a network failure debuggable in the log line: its name and system code, without the original error", async () => {
    live();
    // What cloudApi now throws for a refused connection and for the 15 s abort.
    const refused = Object.assign(new TypeError("fetch failed"), { cause: { code: "ECONNREFUSED" } });
    const timeout = Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" });
    sendTemplateMessage.mockRejectedValueOnce(refused).mockRejectedValueOnce(timeout);
    const send = () => sendWhatsAppTemplate({ to: "+971501234567", templateName: "t", language: "en", params: [], source: "broadcast" });
    await send();
    await send();
    const [first, second] = (logger.warn as jest.Mock).mock.calls.map(([ctx]) => ctx);
    expect(first).toEqual({ template: "t", errorName: "TypeError", causeCode: "ECONNREFUSED", errorMessage: "fetch failed" });
    expect(second).toEqual({ template: "t", errorName: "TimeoutError", errorMessage: "The operation was aborted due to timeout" });
    for (const ctx of [first, second]) expect(Object.values(ctx).some((v) => typeof v === "object" && v !== null)).toBe(false);
    // The stored row keeps its existing fields; the name and code are log-only.
    expect(logWhatsAppDelivery.mock.calls[0][0]).not.toHaveProperty("errorName");
  });

  describe("a failure whose message carries the access token", () => {
    // Node's fetch puts the whole Authorization value in its TypeError when the token has a stray control character.
    const echo = (token: string) => new TypeError(`Headers.append: "Bearer ${token}" is an invalid header value.`);
    const TOKEN = "EAABsecret123token";
    const send = () => sendWhatsAppTemplate({ to: "+971501234567", templateName: "t", language: "en", params: [], source: "broadcast" });

    it("keeps the token out of the outcome, the stored row and the log line", async () => {
      live();
      sendTemplateMessage.mockRejectedValue(echo(TOKEN));
      const out = await send();
      expect(out.status).toBe("failed");
      if (out.status !== "failed") throw new Error("unreachable");
      expect(out.error.message).toBe('Headers.append: "Bearer [redacted]" is an invalid header value.');
      expect(out.errorKind).toBeUndefined();
      expect(logWhatsAppDelivery).toHaveBeenCalledWith(expect.objectContaining({ status: "failed", errorMessage: 'Headers.append: "Bearer [redacted]" is an invalid header value.' }));
      for (const sink of [out, logWhatsAppDelivery.mock.calls, (logger.warn as jest.Mock).mock.calls, (logger.error as jest.Mock).mock.calls]) {
        expect(JSON.stringify(sink, (_k, v) => (v instanceof Error ? { name: v.name, message: v.message, stack: v.stack } : v))).not.toContain(TOKEN);
      }
    });

    it("does not log the original error object, whose stack repeats the message", async () => {
      live();
      sendTemplateMessage.mockRejectedValue(echo(TOKEN));
      await send();
      const [ctx] = (logger.warn as jest.Mock).mock.calls[0];
      expect(ctx).not.toHaveProperty("err");
      expect(Object.values(ctx).some((v) => v instanceof Error)).toBe(false);
    });

    it("blanks the configured secrets even when no Bearer prefix is echoed, and still reports the Graph kind", async () => {
      live();
      process.env.WHATSAPP_ACCESS_TOKEN = "EAABlongsecretvalue";
      sendTemplateMessage.mockRejectedValue(new WhatsAppApiError({ code: 190, message: "Session for EAABlongsecretvalue has expired", httpStatus: 401 }));
      const out = await send();
      if (out.status !== "failed") throw new Error("unreachable");
      expect(out.error.message).toBe("Session for [redacted] has expired");
      expect(out.errorKind).toBe("auth");
      expect(logWhatsAppDelivery).toHaveBeenCalledWith(expect.objectContaining({ errorCode: 190, errorKind: "auth", errorMessage: "Session for [redacted] has expired" }));
    });

    it("turns a thrown non-Error into a failed outcome too", async () => {
      live();
      sendTemplateMessage.mockRejectedValue(`boom Bearer ${TOKEN}`);
      const out = await send();
      if (out.status !== "failed") throw new Error("unreachable");
      expect(out.error).toBeInstanceOf(Error);
      expect(out.error.message).toBe("boom Bearer [redacted]");
    });
  });

  it("logs a network failure as failed with no error kind", async () => {
    live();
    sendTemplateMessage.mockRejectedValue(new Error("fetch failed"));
    const out = await sendWhatsAppTemplate({ to: "+971501234567", templateName: "t", language: "en", params: [], source: "broadcast" });
    expect(out).toEqual({ status: "failed", error: expect.any(Error), errorKind: undefined });
    const logged = logWhatsAppDelivery.mock.calls[0][0];
    expect(logged).toEqual(expect.objectContaining({ status: "failed", to: "+971501234567", errorMessage: "fetch failed" }));
    expect(logged.errorKind).toBeUndefined();
    expect(logged.errorCode).toBeUndefined();
  });

  it("logs skipped invalid_phone for an unusable number", async () => {
    live();
    const out = await sendWhatsAppTemplate({ to: "0501234567", templateName: "t", language: "en", params: [], source: "test" });
    expect(out.status).toBe("failed");
    expect(sendTemplateMessage).not.toHaveBeenCalled();
    expect(logWhatsAppDelivery).toHaveBeenCalledWith(expect.objectContaining({ status: "skipped", to: "0501234567", skipReason: "invalid_phone" }));
  });
});

describe("Meta's wa_id", () => {
  it("is returned with a sent outcome, for the callers that know the user to store", async () => {
    live();
    sendTemplateMessage.mockResolvedValue({ messageId: "wamid.9", waId: "5215512345678" });
    sendTextMessage.mockResolvedValue({ messageId: "wamid.t", waId: "5215512345678" });
    expect(await sendWhatsAppTemplate({ to: "+52 55 1234 5678", templateName: "t", language: "es", params: [], source: "broadcast" })).toEqual({ status: "sent", messageId: "wamid.9", waId: "5215512345678" });
    expect(await sendWhatsAppText({ to: "+52 55 1234 5678", body: "hi", source: "auto_reply" })).toEqual({ status: "sent", messageId: "wamid.t", waId: "5215512345678" });
  });

  it("is left off when Meta's answer carries none", async () => {
    live();
    sendTemplateMessage.mockResolvedValue({ messageId: "wamid.9" });
    const out = await sendWhatsAppTemplate({ to: "+971501234567", templateName: "t", language: "en", params: [], source: "broadcast" });
    expect(out).not.toHaveProperty("waId");
  });
});

describe("sendWhatsAppText", () => {
  it("sends free text and logs kind text", async () => {
    live();
    sendTextMessage.mockResolvedValue({ messageId: "wamid.t" });
    const out = await sendWhatsAppText({ to: "+971501234567", body: "Hello", source: "auto_reply", category: "system" });
    expect(out).toEqual({ status: "sent", messageId: "wamid.t" });
    expect(sendTextMessage).toHaveBeenCalledWith({ to: "971501234567", body: "Hello" });
    expect(logWhatsAppDelivery).toHaveBeenCalledWith(expect.objectContaining({ kind: "text", status: "sent" }));
  });
});

describe("Meta 2xx response without a message id", () => {
  it("still counts as sent but never stores the 'unknown' placeholder as waMessageId", async () => {
    live();
    sendTemplateMessage.mockResolvedValue({ messageId: "unknown" });
    sendTextMessage.mockResolvedValue({ messageId: "unknown" });
    const tpl = await sendWhatsAppTemplate({ to: "+971501234567", templateName: "t", language: "en", params: [], source: "test" });
    const txt = await sendWhatsAppText({ to: "+971501234567", body: "Hello", source: "test" });
    expect(tpl.status).toBe("sent");
    expect(txt.status).toBe("sent");
    expect(logWhatsAppDelivery).toHaveBeenCalledTimes(2);
    for (const [row] of logWhatsAppDelivery.mock.calls) {
      expect(row).toEqual(expect.objectContaining({ status: "sent" }));
      expect(row.waMessageId).toBeUndefined();
    }
  });
});

describe("a log write that rejects", () => {
  it("never turns an accepted send into a failure and never writes a failed row", async () => {
    live();
    sendTemplateMessage.mockResolvedValue({ messageId: "wamid.9" });
    sendTextMessage.mockResolvedValue({ messageId: "wamid.t" });

    logWhatsAppDelivery.mockRejectedValueOnce(new Error("quota exceeded"));
    const tpl = await sendWhatsAppTemplate({ to: "+971501234567", templateName: "t", language: "en", params: [], source: "test" });
    expect(tpl).toEqual({ status: "sent", messageId: "wamid.9" });

    logWhatsAppDelivery.mockRejectedValueOnce(new Error("quota exceeded"));
    const txt = await sendWhatsAppText({ to: "+971501234567", body: "Hello", source: "test" });
    expect(txt).toEqual({ status: "sent", messageId: "wamid.t" });

    expect(logWhatsAppDelivery).toHaveBeenCalledTimes(2);
    expect(logWhatsAppDelivery).not.toHaveBeenCalledWith(expect.objectContaining({ status: "failed" }));
  });
});
