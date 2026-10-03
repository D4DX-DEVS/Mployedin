/**
 * @jest-environment node
 */
import { createHmac } from "crypto";
import { NextRequest } from "next/server";

const connectDB = jest.fn().mockResolvedValue(undefined);
jest.mock("@/lib/db/mongoose", () => ({ connectDB: (...a: unknown[]) => connectDB(...a) }));
const processWebhookEvents = jest.fn().mockResolvedValue({ statuses: 1, inbound: 0, templates: 0 });
jest.mock("@/lib/communications/whatsapp/webhookHandlers", () => ({ processWebhookEvents: (...a: unknown[]) => processWebhookEvents(...a) }));
jest.mock("@/lib/logger", () => ({ __esModule: true, default: { error: jest.fn(), info: jest.fn(), warn: jest.fn() } }));

import logger from "@/lib/logger";
import { GET, POST } from "@/app/api/webhooks/whatsapp/route";

const SECRET = "app-secret";
const body = JSON.stringify({
  object: "whatsapp_business_account",
  entry: [{ id: "777", changes: [{ field: "messages", value: { statuses: [{ id: "wamid.A", status: "read", timestamp: "1759147200", recipient_id: "9715" }] } }] }],
});
const sig = (b: string) => `sha256=${createHmac("sha256", SECRET).update(b, "utf8").digest("hex")}`;

beforeEach(() => {
  jest.clearAllMocks();
  process.env.WHATSAPP_APP_SECRET = SECRET;
  process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = "verify-me";
});

describe("GET /api/webhooks/whatsapp (Meta verification)", () => {
  it("echoes the challenge for the right token", async () => {
    const res = await GET(new NextRequest("http://localhost/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=12345"));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("12345");
  });
  it("refuses a wrong token", async () => {
    const res = await GET(new NextRequest("http://localhost/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=1"));
    expect(res.status).toBe(403);
  });
  it("refuses the right token under another hub.mode", async () => {
    const res = await GET(new NextRequest("http://localhost/api/webhooks/whatsapp?hub.mode=unsubscribe&hub.verify_token=verify-me&hub.challenge=1"));
    expect(res.status).toBe(403);
  });
  it("refuses a missing token, and never matches an empty one against an unset env token", async () => {
    const missing = await GET(new NextRequest("http://localhost/api/webhooks/whatsapp?hub.mode=subscribe&hub.challenge=1"));
    expect(missing.status).toBe(403);
    process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN = "";
    const empty = await GET(new NextRequest("http://localhost/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=&hub.challenge=1"));
    expect(empty.status).toBe(403);
  });
});

describe("POST /api/webhooks/whatsapp", () => {
  const post = (b: string, headers: Record<string, string>) =>
    POST(new NextRequest("http://localhost/api/webhooks/whatsapp", { method: "POST", body: b, headers: { "content-type": "application/json", ...headers } }));

  it("rejects a bad signature", async () => {
    const res = await post(body, { "x-hub-signature-256": sig(body + "x") });
    expect(res.status).toBe(401);
    expect(processWebhookEvents).not.toHaveBeenCalled();
  });
  it("rejects a missing signature header without touching the database", async () => {
    const res = await post(body, {});
    expect(res.status).toBe(401);
    expect(connectDB).not.toHaveBeenCalled();
    expect(processWebhookEvents).not.toHaveBeenCalled();
  });
  it("rejects a signature made with another secret without touching the database", async () => {
    const forged = `sha256=${createHmac("sha256", "not-the-secret").update(body, "utf8").digest("hex")}`;
    const res = await post(body, { "x-hub-signature-256": forged });
    expect(res.status).toBe(401);
    expect(connectDB).not.toHaveBeenCalled();
    expect(processWebhookEvents).not.toHaveBeenCalled();
  });
  it("processes a signed payload", async () => {
    const res = await post(body, { "x-hub-signature-256": sig(body) });
    expect(res.status).toBe(200);
    expect(processWebhookEvents).toHaveBeenCalledTimes(1);
    expect(processWebhookEvents.mock.calls[0][0]).toHaveLength(1);
  });
  it("verifies the exact bytes Meta sent, not a re-serialised copy", async () => {
    // Pretty-printed with a non-ASCII name: JSON.stringify(JSON.parse(raw)) would differ from raw.
    const raw = `{\n  "object": "whatsapp_business_account",\n  "entry": [ { "id": "777", "changes": [ { "field": "messages", "value": { "contacts": [ { "wa_id": "9715", "profile": { "name": "سارة" } } ], "messages": [ { "id": "wamid.M", "from": "9715", "timestamp": "1759147200", "type": "text", "text": { "body": "hi" } } ] } } ] } ]\n}`;
    expect(JSON.stringify(JSON.parse(raw))).not.toBe(raw);
    const res = await post(raw, { "x-hub-signature-256": sig(raw) });
    expect(res.status).toBe(200);
    expect(processWebhookEvents.mock.calls[0][0]).toEqual([expect.objectContaining({ kind: "inbound_message", fromWaId: "9715", profileName: "سارة" })]);
  });
  it("answers 503 when a STOP/START failed to apply after the database connected, so Meta redelivers", async () => {
    processWebhookEvents.mockResolvedValueOnce({ statuses: 0, inbound: 1, templates: 0, keywordFailed: true });
    const res = await post(body, { "x-hub-signature-256": sig(body) });
    expect(res.status).toBe(503);
    expect(logger.warn).toHaveBeenCalledWith("[whatsapp] a STOP/START could not be applied: asking Meta to redeliver");
  });
  it("answers 200 when only a status event (or another non-keyword event) failed", async () => {
    processWebhookEvents.mockResolvedValueOnce({ statuses: 1, inbound: 0, templates: 0, keywordFailed: false });
    const res = await post(body, { "x-hub-signature-256": sig(body) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, received: 1, statuses: 1, inbound: 0, templates: 0 });
  });
  it("still answers 200 when processing throws", async () => {
    processWebhookEvents.mockRejectedValueOnce(new Error("boom"));
    const res = await post(body, { "x-hub-signature-256": sig(body) });
    expect(res.status).toBe(200);
  });
  it("answers 503 when the database is unreachable, so Meta redelivers (a STOP must not be lost)", async () => {
    connectDB.mockRejectedValueOnce(new Error("no db"));
    const res = await post(body, { "x-hub-signature-256": sig(body) });
    expect(res.status).toBe(503);
    expect(processWebhookEvents).not.toHaveBeenCalled();
    // The log line carries the error and a fixed message, never the payload (phone numbers, message text).
    expect(logger.error).toHaveBeenCalledTimes(1);
    const [context, message] = (logger.error as jest.Mock).mock.calls[0];
    expect(Object.keys(context)).toEqual(["err"]);
    expect(context.err).toBeInstanceOf(Error);
    expect(message).toBe("[whatsapp] webhook could not reach the database");
  });
  it("answers 200 to malformed JSON that carries a valid signature", async () => {
    const raw = "{ this is not json";
    const res = await post(raw, { "x-hub-signature-256": sig(raw) });
    expect(res.status).toBe(200);
    expect(connectDB).not.toHaveBeenCalled();
    expect(processWebhookEvents).not.toHaveBeenCalled();
  });
  it("answers 200 to a signed payload it does not recognise, without a database round trip", async () => {
    for (const raw of ['{"object":"page","entry":[]}', "[]", "null", '"text"', "{}"]) {
      const res = await post(raw, { "x-hub-signature-256": sig(raw) });
      expect(res.status).toBe(200);
    }
    expect(connectDB).not.toHaveBeenCalled();
    expect(processWebhookEvents).not.toHaveBeenCalled();
  });
  it("answers 503 when the app secret is not configured", async () => {
    process.env.WHATSAPP_APP_SECRET = "";
    const res = await post(body, { "x-hub-signature-256": sig(body) });
    expect(res.status).toBe(503);
    expect(processWebhookEvents).not.toHaveBeenCalled();
  });
  it("answers 413 to a body over 1 MB, without a database round trip", async () => {
    const big = "x".repeat(1024 * 1024 + 1);
    const res = await post(big, { "x-hub-signature-256": sig(big) });
    expect(res.status).toBe(413);
    expect(connectDB).not.toHaveBeenCalled();
    expect(processWebhookEvents).not.toHaveBeenCalled();
  });
  it("accepts a body of exactly 1 MB", async () => {
    // Not JSON, but correctly signed: it passes the size cap and ends as an unrecognised payload.
    const edge = "x".repeat(1024 * 1024);
    const res = await post(edge, { "x-hub-signature-256": sig(edge) });
    expect(res.status).toBe(200);
  });
  it("counts the cap in bytes, not characters", async () => {
    // 600 000 Arabic letters are 600 000 characters but 1 200 000 bytes on the wire.
    const arabic = "س".repeat(600_000);
    expect(arabic.length).toBeLessThan(1024 * 1024);
    const res = await post(arabic, { "x-hub-signature-256": sig(arabic) });
    expect(res.status).toBe(413);
  });
  it("refuses on a declared content-length over the cap without reading the body", async () => {
    const req = new NextRequest("http://localhost/api/webhooks/whatsapp", {
      method: "POST",
      body,
      headers: { "content-type": "application/json", "content-length": String(1024 * 1024 + 1), "x-hub-signature-256": sig(body) },
    });
    const readBody = jest.spyOn(req, "text");
    const res = await POST(req);
    expect(res.status).toBe(413);
    expect(readBody).not.toHaveBeenCalled();
    expect(connectDB).not.toHaveBeenCalled();
  });
  it("ignores a junk content-length and judges the body itself", async () => {
    const res = await post(body, { "content-length": "not-a-number", "x-hub-signature-256": sig(body) });
    expect(res.status).toBe(200);
    expect(processWebhookEvents).toHaveBeenCalledTimes(1);
  });
});
