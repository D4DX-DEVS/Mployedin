/**
 * Meta webhook plumbing, pure functions only (no DB): signature check and
 * payload → typed events. DB effects live in webhookHandlers.ts.
 */
import { createHmac, timingSafeEqual } from "crypto";
import { isStartCode } from "./startCode";

export type WebhookStatus = "sent" | "delivered" | "read" | "failed" | "deleted";

export type WebhookEvent =
  | {
      kind: "status";
      waMessageId: string;
      status: WebhookStatus;
      timestamp: Date;
      recipientWaId: string;
      errorCode?: number;
      errorMessage?: string;
      conversationCategory?: string;
    }
  | {
      kind: "inbound_message";
      waMessageId: string;
      fromWaId: string;
      timestamp: Date;
      type: string;
      text?: string;
      /** A button reply's payload (quick reply) or id (interactive), when there is one. */
      payload?: string;
      profileName?: string;
    }
  | {
      kind: "template_status_update";
      metaId: string;
      name: string;
      language: string;
      event: string;
      reason?: string;
    };

/** A SHA-256 HMAC is 32 bytes = 64 hex chars. Anything else is not a signature. */
const SIGNATURE_HEADER = /^sha256=([0-9a-fA-F]{64})$/;

/**
 * `X-Hub-Signature-256: sha256=<hex HMAC-SHA256 of the raw body with the app secret>`.
 * Constant-time compare; a missing, malformed or wrong-length header returns
 * false instead of throwing. The secret is never logged.
 */
export function verifyWebhookSignature(rawBody: string, signatureHeader: string | null | undefined, appSecret: string): boolean {
  if (!signatureHeader || !appSecret) return false;
  const match = SIGNATURE_HEADER.exec(signatureHeader);
  if (!match) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody, "utf8").digest();
  const provided = Buffer.from(match[1], "hex");
  return expected.length === provided.length && timingSafeEqual(expected, provided);
}

const STATUSES: ReadonlySet<string> = new Set(["sent", "delivered", "read", "failed", "deleted"]);

/** Meta sends epoch seconds as a string; a missing, non-finite or out-of-range value falls back to receipt time. */
function epochToDate(ts: unknown): Date {
  const n = Number(ts);
  if (Number.isFinite(n) && n > 0) {
    const d = new Date(n * 1000);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date();
}

type Rec = Record<string, unknown>;

function isRec(v: unknown): v is Rec {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Only the plain objects of an array; anything else (missing, wrong type, junk items) yields nothing. */
function recs(v: unknown): Rec[] {
  return Array.isArray(v) ? v.filter(isRec) : [];
}

function str(v: unknown): string | undefined {
  return typeof v === "string" ? v : undefined;
}

export function parseWebhookPayload(payload: unknown): WebhookEvent[] {
  const out: WebhookEvent[] = [];
  if (!isRec(payload) || payload.object !== "whatsapp_business_account") return out;

  for (const entry of recs(payload.entry)) {
    for (const change of recs(entry.changes)) {
      const value = isRec(change.value) ? change.value : {};
      if (change.field === "messages") {
        const contacts = recs(value.contacts);
        for (const s of recs(value.statuses)) {
          const status = String(s.status ?? "");
          const id = str(s.id);
          if (!STATUSES.has(status) || id === undefined) continue;
          const first = recs(s.errors)[0];
          const details = isRec(first?.error_data) ? str(first.error_data.details) : undefined;
          out.push({
            kind: "status",
            waMessageId: id,
            status: status as WebhookStatus,
            timestamp: epochToDate(s.timestamp),
            recipientWaId: String(s.recipient_id ?? ""),
            errorCode: typeof first?.code === "number" ? first.code : undefined,
            errorMessage: details ?? str(first?.message) ?? str(first?.title),
            conversationCategory: isRec(s.pricing) ? str(s.pricing.category) : undefined,
          });
        }
        for (const m of recs(value.messages)) {
          const id = str(m.id);
          const from = str(m.from);
          if (id === undefined || from === undefined) continue;
          const contact = contacts.find((c) => c.wa_id === from);
          const button = isRec(m.button) ? m.button : undefined;
          const reply = isRec(m.interactive) && isRec(m.interactive.button_reply) ? m.interactive.button_reply : undefined;
          const text = (isRec(m.text) ? str(m.text.body) : undefined) ?? str(button?.text) ?? str(reply?.title);
          out.push({
            kind: "inbound_message",
            waMessageId: id,
            fromWaId: from,
            timestamp: epochToDate(m.timestamp),
            type: String(m.type ?? "unknown"),
            text,
            payload: str(button?.payload) ?? str(reply?.id),
            profileName: isRec(contact?.profile) ? str(contact.profile.name) : undefined,
          });
        }
      } else if (change.field === "message_template_status_update") {
        const name = str(value.message_template_name);
        if (name === undefined) continue;
        out.push({
          kind: "template_status_update",
          metaId: String(value.message_template_id ?? ""),
          name,
          language: String(value.message_template_language ?? ""),
          event: String(value.event ?? ""),
          reason: str(value.reason),
        });
      }
    }
  }
  return out;
}

/** Bidi marks (LRM, RLM, ALM), tatweel and Arabic diacritics (harakat, superscript alef). */
const IGNORABLE = /\u0640|[\u200E\u200F\u061C]|[\u064B-\u065F\u0670]/g;
const EDGE_PUNCTUATION = /^[\s\p{P}]+|[\s\p{P}]+$/gu;
/** Directional isolates (LRI, RLI, FSI, PDI): the Arabic settings page shows "START <code>" inside them, and a copied text keeps them. */
const ISOLATES = /[\u2066-\u2069]/g;

/**
 * Reduces a reply to the form the keyword sets are stored in, so common
 * spellings of the same word match: أ/إ/آ → ا, no marks or tatweel, no
 * surrounding punctuation or whitespace, any run of whitespace inside as one
 * space, lower case. (The keywords are single words, so the inner spaces only
 * matter to `START <code>`.)
 */
function normaliseKeyword(text: string): string {
  return text
    .replace(IGNORABLE, "")
    .replace(/[أإآ]/g, "ا")
    .replace(EDGE_PUNCTUATION, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

const STOP_WORDS: ReadonlySet<string> = new Set(
  ["stop", "unsubscribe", "cancel", "quit", "إيقاف", "الغاء", "إلغاء"].map(normaliseKeyword),
);
const START_WORDS: ReadonlySet<string> = new Set(
  ["start", "subscribe", "unstop", "resume", "ابدأ", "اشتراك"].map(normaliseKeyword),
);

/** A keyword message: STOP, or START with the account's personal code when one follows it (startCode.ts). */
export interface InboundKeyword {
  keyword: "stop" | "start";
  /** `START <code>`: the code, upper case. Absent on a plain START and on STOP. */
  code?: string;
}

/**
 * The keyword a text carries. STOP is a STOP word on its own, as it always was.
 * START is a START word on its own, or followed by one personal code, as the
 * settings page's button types it (`START <code>`). Directional isolates are
 * ignored for START only (the Arabic page shows the text inside them), so STOP
 * reads exactly as before. Anything else after START, or more after the code,
 * is not a keyword.
 */
export function parseKeyword(text?: string | null): InboundKeyword | null {
  if (STOP_WORDS.has(normaliseKeyword(text ?? ""))) return { keyword: "stop" };
  const [word, code, ...more] = normaliseKeyword((text ?? "").replace(ISOLATES, "")).split(" ");
  if (!START_WORDS.has(word) || more.length > 0) return null;
  if (code === undefined) return { keyword: "start" };
  const upper = code.toUpperCase();
  return isStartCode(upper) ? { keyword: "start", code: upper } : null;
}

export function classifyKeyword(text?: string | null): "stop" | "start" | null {
  return parseKeyword(text)?.keyword ?? null;
}

/** Meta's own quick-reply on marketing templates. Its label can be localised; its payload is Meta's. */
const STOP_PROMOTIONS = "stop promotions";
const isStopPromotions = (v?: string): boolean => v?.trim().toLowerCase() === STOP_PROMOTIONS;

/**
 * The keyword an inbound message carries, with a START's code. A "Stop
 * promotions" button reply (by text or payload) is a STOP: left unhandled,
 * every later broadcast to the number fails with 131050. Typed text keeps the
 * keyword rules only.
 */
export function parseInbound(ev: { type: string; text?: string; payload?: string }): InboundKeyword | null {
  if ((ev.type === "button" || ev.type === "interactive") && (isStopPromotions(ev.text) || isStopPromotions(ev.payload))) return { keyword: "stop" };
  return parseKeyword(ev.text);
}

export function classifyInbound(ev: { type: string; text?: string; payload?: string }): "stop" | "start" | null {
  return parseInbound(ev)?.keyword ?? null;
}
