import { createHash, timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { connectDB } from "@/lib/db/mongoose";
import logger from "@/lib/logger";
import { readWhatsAppEnv } from "@/lib/communications/whatsapp/config";
import { parseWebhookPayload, verifyWebhookSignature } from "@/lib/communications/whatsapp/webhook";
import { processWebhookEvents } from "@/lib/communications/whatsapp/webhookHandlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Meta WhatsApp webhook.
 *  GET  — subscription handshake: echo hub.challenge when hub.verify_token matches.
 *  POST — events. Authenticated by X-Hub-Signature-256 over the RAW body. After
 *         a valid signature we answer 200 for anything we cannot act on or that
 *         fails while processing (Meta retries non-2xx and would loop on a
 *         processing bug), but 503 when the database is unreachable or a
 *         STOP/START failed to apply, so Meta redelivers the batch (a dropped
 *         STOP would break the opt-out promise). Redelivery is safe: statuses
 *         only move forward and keywords have an order guard.
 *         No session, no CSRF (this exact path is exempt in csrf.ts).
 */
const MAX_BODY_BYTES = 1024 * 1024;

/** Constant-time compare of the handshake token (digests make the lengths equal). */
function verifyTokenMatches(provided: string | null, expected: string): boolean {
  if (!provided) return false;
  const a = createHash("sha256").update(provided).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const { webhookVerifyToken } = readWhatsAppEnv();
  if (sp.get("hub.mode") === "subscribe" && webhookVerifyToken && verifyTokenMatches(sp.get("hub.verify_token"), webhookVerifyToken)) {
    return new NextResponse(sp.get("hub.challenge") ?? "", { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

export async function POST(req: NextRequest) {
  const { appSecret } = readWhatsAppEnv();
  if (!appSecret) return NextResponse.json({ error: "WhatsApp webhook not configured" }, { status: 503 });

  // A declared size over the cap is refused before the body is read at all.
  const declaredBytes = Number(req.headers.get("content-length"));
  if (Number.isFinite(declaredBytes) && declaredBytes > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }

  // Read once, as text: the signature covers these exact bytes, so nothing may re-serialise the body before it is checked.
  const raw = await req.text();
  // Bytes, not characters: a body of multi-byte text (Arabic names) is longer on the wire than `raw.length` says.
  if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }
  if (!verifyWebhookSignature(raw, req.headers.get("x-hub-signature-256"), appSecret)) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: true, received: 0 });
  }

  const events = parseWebhookPayload(payload);
  // Nothing we act on (another object type, an empty batch): acknowledge without a database round trip.
  if (events.length === 0) return NextResponse.json({ ok: true, received: 0 });

  // No database means no event can be applied, STOP included: answer 503 so Meta redelivers (webhookHandlers.ts lists what a redelivery repeats).
  try {
    await connectDB();
  } catch (err) {
    logger.error({ err }, "[whatsapp] webhook could not reach the database");
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  try {
    const { keywordFailed, ...counts } = await processWebhookEvents(events);
    // The database connected but a write failed (a full or write-blocked cluster): a STOP must not be acknowledged unapplied.
    if (keywordFailed) {
      logger.warn("[whatsapp] a STOP/START could not be applied: asking Meta to redeliver");
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
    }
    return NextResponse.json({ ok: true, received: events.length, ...counts });
  } catch (err) {
    // processWebhookEvents already isolates each event; anything reaching here is a bug a retry would only repeat.
    logger.error({ err }, "[whatsapp] webhook processing failed");
    return NextResponse.json({ ok: true, received: events.length });
  }
}
