/**
 * @jest-environment node
 */
import { createHmac } from "crypto";
import { verifyWebhookSignature, parseWebhookPayload, classifyKeyword, classifyInbound, parseKeyword, parseInbound } from "@/lib/communications/whatsapp/webhook";

const SECRET = "app-secret";
const sign = (body: string) => `sha256=${createHmac("sha256", SECRET).update(body, "utf8").digest("hex")}`;

describe("verifyWebhookSignature", () => {
  const body = JSON.stringify({ object: "whatsapp_business_account", entry: [] });
  it("accepts a correct signature", () => expect(verifyWebhookSignature(body, sign(body), SECRET)).toBe(true));
  it("rejects a tampered body, a missing header, a wrong scheme and an empty secret", () => {
    expect(verifyWebhookSignature(body + " ", sign(body), SECRET)).toBe(false);
    expect(verifyWebhookSignature(body, null, SECRET)).toBe(false);
    expect(verifyWebhookSignature(body, sign(body).replace("sha256=", "sha1="), SECRET)).toBe(false);
    expect(verifyWebhookSignature(body, "sha256=zz", SECRET)).toBe(false);
    expect(verifyWebhookSignature(body, sign(body), "")).toBe(false);
  });
  it("never throws on a malformed, truncated or padded header", () => {
    const good = sign(body);
    const hex = good.slice("sha256=".length);
    expect(verifyWebhookSignature(body, undefined, SECRET)).toBe(false);
    expect(verifyWebhookSignature(body, "", SECRET)).toBe(false);
    expect(verifyWebhookSignature(body, "sha256", SECRET)).toBe(false);
    expect(verifyWebhookSignature(body, "sha256=", SECRET)).toBe(false);
    expect(verifyWebhookSignature(body, `sha256=${hex.slice(0, -2)}`, SECRET)).toBe(false);
    expect(verifyWebhookSignature(body, `sha256=${hex}00`, SECRET)).toBe(false);
    expect(verifyWebhookSignature(body, `${good}zz`, SECRET)).toBe(false);
    expect(verifyWebhookSignature(body, `${good}=extra`, SECRET)).toBe(false);
    expect(verifyWebhookSignature(body, "💥".repeat(40), SECRET)).toBe(false);
  });
  it("accepts an uppercase hex digest and signs the UTF-8 bytes of a non-ASCII body", () => {
    const arabic = JSON.stringify({ text: "مرحبا" });
    const upper = `sha256=${createHmac("sha256", SECRET).update(arabic, "utf8").digest("hex").toUpperCase()}`;
    expect(verifyWebhookSignature(arabic, sign(arabic), SECRET)).toBe(true);
    expect(verifyWebhookSignature(arabic, upper, SECRET)).toBe(true);
  });
  it("rejects a signature made with a different secret", () => {
    const other = `sha256=${createHmac("sha256", "other").update(body, "utf8").digest("hex")}`;
    expect(verifyWebhookSignature(body, other, SECRET)).toBe(false);
  });
});

const FIXTURE = {
  object: "whatsapp_business_account",
  entry: [
    {
      id: "777",
      changes: [
        {
          field: "messages",
          value: {
            messaging_product: "whatsapp",
            metadata: { display_phone_number: "97140000000", phone_number_id: "555" },
            statuses: [
              { id: "wamid.A", status: "delivered", timestamp: "1759147200", recipient_id: "971501234567", conversation: { id: "c1", origin: { type: "utility" } }, pricing: { billable: true, pricing_model: "PMP", category: "utility" } },
              { id: "wamid.B", status: "failed", timestamp: "1759147260", recipient_id: "971501234567", errors: [{ code: 131026, title: "Message undeliverable", message: "Message undeliverable", error_data: { details: "Recipient not on WhatsApp" } }] },
              { id: "wamid.C", status: "bogus", timestamp: "1759147260", recipient_id: "971501234567" },
            ],
          },
        },
        {
          field: "messages",
          value: {
            messaging_product: "whatsapp",
            metadata: { display_phone_number: "97140000000", phone_number_id: "555" },
            contacts: [{ profile: { name: "Sara" }, wa_id: "971501234567" }],
            messages: [{ from: "971501234567", id: "wamid.IN", timestamp: "1759147300", type: "text", text: { body: "STOP" } }],
          },
        },
        {
          field: "message_template_status_update",
          value: { event: "APPROVED", message_template_id: 123, message_template_name: "mployedin_application_status", message_template_language: "en" },
        },
      ],
    },
  ],
};

describe("parseWebhookPayload", () => {
  it("yields typed events and skips unknown statuses", () => {
    const events = parseWebhookPayload(FIXTURE);
    expect(events).toEqual([
      { kind: "status", waMessageId: "wamid.A", status: "delivered", timestamp: new Date(1759147200 * 1000), recipientWaId: "971501234567", errorCode: undefined, errorMessage: undefined, conversationCategory: "utility" },
      { kind: "status", waMessageId: "wamid.B", status: "failed", timestamp: new Date(1759147260 * 1000), recipientWaId: "971501234567", errorCode: 131026, errorMessage: "Recipient not on WhatsApp", conversationCategory: undefined },
      { kind: "inbound_message", waMessageId: "wamid.IN", fromWaId: "971501234567", timestamp: new Date(1759147300 * 1000), type: "text", text: "STOP", profileName: "Sara" },
      { kind: "template_status_update", metaId: "123", name: "mployedin_application_status", language: "en", event: "APPROVED", reason: undefined },
    ]);
  });
  it("returns nothing for foreign or malformed payloads", () => {
    expect(parseWebhookPayload({ object: "page", entry: [] })).toEqual([]);
    expect(parseWebhookPayload(null)).toEqual([]);
    expect(parseWebhookPayload("x")).toEqual([]);
  });
  it("skips malformed entries, changes and items instead of throwing", () => {
    const junk = {
      object: "whatsapp_business_account",
      entry: [
        null,
        "x",
        { changes: "nope" },
        { changes: [null, 5, { field: "messages" }, { field: "messages", value: null }, { field: "messages", value: { statuses: "x", messages: 7 } }] },
        {
          changes: [
            {
              field: "messages",
              value: {
                contacts: "x",
                statuses: [null, 3, { id: 9, status: "sent" }, { id: "wamid.OK", status: "sent", timestamp: "1759147200", recipient_id: "971501234567", errors: "x", pricing: "x" }],
                messages: [null, { id: "wamid.NOFROM" }, { from: "971501234567", id: "wamid.IMG", timestamp: "1759147300", type: "image" }],
              },
            },
            { field: "message_template_status_update", value: null },
            { field: "message_template_status_update", value: { event: "APPROVED" } },
          ],
        },
      ],
    };
    expect(parseWebhookPayload(junk)).toEqual([
      { kind: "status", waMessageId: "wamid.OK", status: "sent", timestamp: new Date(1759147200 * 1000), recipientWaId: "971501234567", errorCode: undefined, errorMessage: undefined, conversationCategory: undefined },
      { kind: "inbound_message", waMessageId: "wamid.IMG", fromWaId: "971501234567", timestamp: new Date(1759147300 * 1000), type: "image", text: undefined, profileName: undefined },
    ]);
  });
  it("falls back to receipt time for a missing, non-numeric or out-of-range timestamp", () => {
    const status = (timestamp: unknown) => ({
      object: "whatsapp_business_account",
      entry: [{ changes: [{ field: "messages", value: { statuses: [{ id: "wamid.T", status: "sent", timestamp, recipient_id: "971501234567" }] } }] }],
    });
    for (const ts of ["1e20", "abc", "0", "-5", undefined, "Infinity"]) {
      const before = Date.now();
      const [event] = parseWebhookPayload(status(ts));
      const t = (event as { timestamp: Date }).timestamp.getTime();
      expect(Number.isNaN(t)).toBe(false);
      expect(t).toBeGreaterThanOrEqual(before);
      expect(t).toBeLessThanOrEqual(Date.now());
    }
  });
  it("reads a quick-reply button as text, falls back to the error message, and carries a template rejection reason", () => {
    const events = parseWebhookPayload({
      object: "whatsapp_business_account",
      entry: [
        {
          changes: [
            {
              field: "messages",
              value: {
                statuses: [{ id: "wamid.F", status: "failed", timestamp: "1759147260", recipient_id: "971501234567", errors: [{ code: 131047, title: "Re-engagement message", message: "Re-engagement message window closed" }] }],
                messages: [{ from: "971501234567", id: "wamid.BTN", timestamp: "1759147300", type: "button", button: { text: "Stop", payload: "p" } }],
              },
            },
            { field: "message_template_status_update", value: { event: "REJECTED", message_template_id: "9", message_template_name: "t", message_template_language: "ar", reason: "INVALID_FORMAT" } },
          ],
        },
      ],
    });
    expect(events).toEqual([
      { kind: "status", waMessageId: "wamid.F", status: "failed", timestamp: new Date(1759147260 * 1000), recipientWaId: "971501234567", errorCode: 131047, errorMessage: "Re-engagement message window closed", conversationCategory: undefined },
      { kind: "inbound_message", waMessageId: "wamid.BTN", fromWaId: "971501234567", timestamp: new Date(1759147300 * 1000), type: "button", text: "Stop", payload: "p", profileName: undefined },
      { kind: "template_status_update", metaId: "9", name: "t", language: "ar", event: "REJECTED", reason: "INVALID_FORMAT" },
    ]);
  });
});

describe("Meta's \"Stop promotions\" quick-reply", () => {
  const msg = (m: Record<string, unknown>) =>
    parseWebhookPayload({ object: "whatsapp_business_account", entry: [{ changes: [{ field: "messages", value: { messages: [{ from: "971501234567", id: "wamid.Q", timestamp: "1759147300", ...m }] } }] }] })[0];

  it("reads an interactive button reply's title as text and its id as payload", () => {
    const ev = msg({ type: "interactive", interactive: { type: "button_reply", button_reply: { id: "opt-out", title: "Stop promotions" } } });
    expect(ev).toEqual(expect.objectContaining({ kind: "inbound_message", type: "interactive", text: "Stop promotions", payload: "opt-out" }));
  });

  it("classifies the button as STOP by its text or its payload, case-insensitively and trimmed", () => {
    expect(classifyInbound(msg({ type: "button", button: { text: "Stop promotions", payload: "Stop promotions" } }) as never)).toBe("stop");
    expect(classifyInbound(msg({ type: "button", button: { text: "  stop PROMOTIONS ", payload: "x" } }) as never)).toBe("stop");
    // The label can be localised; the payload stays Meta's.
    expect(classifyInbound(msg({ type: "button", button: { text: "إيقاف العروض الترويجية", payload: "Stop promotions" } }) as never)).toBe("stop");
    expect(classifyInbound(msg({ type: "interactive", interactive: { type: "button_reply", button_reply: { id: "stop promotions", title: "No thanks" } } }) as never)).toBe("stop");
  });

  it("leaves other buttons to the keyword rules, and does not widen typed text", () => {
    expect(classifyInbound({ type: "button", text: "Start", payload: "resume" })).toBe("start");
    expect(classifyInbound({ type: "button", text: "Yes please", payload: "promo-yes" })).toBeNull();
    expect(classifyInbound({ type: "text", text: "Stop promotions" })).toBeNull();
    expect(classifyInbound({ type: "text", text: "STOP" })).toBe("stop");
  });
});

describe("classifyKeyword", () => {
  it("recognises opt-out and opt-in words in both languages, case-insensitively", () => {
    expect(classifyKeyword("STOP")).toBe("stop");
    expect(classifyKeyword(" unsubscribe. ")).toBe("stop");
    expect(classifyKeyword("إيقاف")).toBe("stop");
    expect(classifyKeyword("Start")).toBe("start");
    expect(classifyKeyword("ابدأ")).toBe("start");
    expect(classifyKeyword("hello, is my interview confirmed?")).toBeNull();
    expect(classifyKeyword(undefined)).toBeNull();
  });
  it("honours common Arabic spellings: alef forms, diacritics, tatweel and bidi marks", () => {
    expect(classifyKeyword("ايقاف")).toBe("stop");
    expect(classifyKeyword("إيقاف")).toBe("stop");
    expect(classifyKeyword("الغاء")).toBe("stop");
    expect(classifyKeyword("إلغاء")).toBe("stop");
    expect(classifyKeyword("ألغاء")).toBe("stop");
    expect(classifyKeyword("ابدأ")).toBe("start");
    expect(classifyKeyword("ابدا")).toBe("start");
    expect(classifyKeyword("اشتراك")).toBe("start");
    // diacritised (fatha, kasra, shadda, sukun) and tatweel-stretched forms
    expect(classifyKeyword("إ\u0650يق\u064Eاف\u064C")).toBe("stop");
    expect(classifyKeyword("ا\u0650ب\u0652د\u064Eأ")).toBe("start");
    expect(classifyKeyword("إيق\u0640\u0640\u0640اف")).toBe("stop");
    // bidi marks that WhatsApp adds around right-to-left text
    expect(classifyKeyword("\u200ESTOP")).toBe("stop");
    expect(classifyKeyword("\u200FSTOP\u200E")).toBe("stop");
    expect(classifyKeyword("\u061Cإيقاف\u200F")).toBe("stop");
  });
  it("ignores leading and trailing punctuation and whitespace, ASCII and Arabic", () => {
    expect(classifyKeyword("!stop")).toBe("stop");
    expect(classifyKeyword("  ...STOP!!!  ")).toBe("stop");
    expect(classifyKeyword("«stop»")).toBe("stop");
    expect(classifyKeyword("،إيقاف؟")).toBe("stop");
    expect(classifyKeyword("؛ابدأ!")).toBe("start");
    expect(classifyKeyword("(Start)")).toBe("start");
  });
  it("still returns null for non-keywords after normalising", () => {
    expect(classifyKeyword("!!!")).toBeNull();
    expect(classifyKeyword("\u200E")).toBeNull();
    expect(classifyKeyword("ايقاف الرسائل من فضلك")).toBeNull();
    expect(classifyKeyword("stop.calling")).toBeNull();
  });
  it("returns null for empty input and for words that merely contain a keyword", () => {
    expect(classifyKeyword(null)).toBeNull();
    expect(classifyKeyword("")).toBeNull();
    expect(classifyKeyword("   ")).toBeNull();
    expect(classifyKeyword("please stop calling me")).toBeNull();
    expect(classifyKeyword("starting soon")).toBeNull();
  });
});

// K3 (owner decision 2026-10-03): the settings page's button types `START <code>`, the account's personal code. The
// keyword rules above are extended in place (one matcher), so STOP must read exactly as it did.
describe("START with the account's personal code", () => {
  it("reads START <code>: case-insensitive, trimmed, internal whitespace collapsed, the code upper-cased", () => {
    for (const text of ["START K7P4QX", "start k7p4qx", "  Start   K7p4Qx  ", "START\tK7P4QX", "START\u00A0K7P4QX", "START K7P4QX.", "\u200ESTART K7P4QX"]) {
      expect([text, parseKeyword(text)]).toEqual([text, { keyword: "start", code: "K7P4QX" }]);
    }
  });

  it("reads a plain START as a START with no code", () => {
    expect(parseKeyword("START")).toEqual({ keyword: "start" });
    expect(parseKeyword("START")).not.toHaveProperty("code");
    expect(parseKeyword(" resume! ")).toEqual({ keyword: "start" });
  });

  it("accepts the code after the other START words too, Arabic included", () => {
    expect(parseKeyword("ابدأ K7P4QX")).toEqual({ keyword: "start", code: "K7P4QX" });
    expect(parseKeyword("resume k7p4qx")).toEqual({ keyword: "start", code: "K7P4QX" });
  });

  it("accepts the text copied from the Arabic settings page, where START and the code sit in directional isolates", () => {
    expect(parseKeyword("\u2066START K7P4QX\u2069")).toEqual({ keyword: "start", code: "K7P4QX" });
    expect(parseKeyword("أرسل \u2066START K7P4QX\u2069")).toBeNull();
  });

  it("is not a keyword when what follows START is not a code, or more follows it", () => {
    for (const text of ["START please", "START K7P4Q", "START K7P4QXX", "START K7P4Q0", "START K7P4QO", "START K7P4QI", "START K7P-4QX", "start the interview", "START K7P4QX now", "START START", "STARTK7P4QX"]) {
      expect([text, parseKeyword(text)]).toEqual([text, null]);
    }
  });

  it("never reads a code after STOP: a STOP is a STOP only on its own, as before", () => {
    expect(parseKeyword("STOP K7P4QX")).toBeNull();
    expect(parseKeyword("STOP")).toEqual({ keyword: "stop" });
  });

  it("classifyKeyword and classifyInbound answer start for START <code>, so a failure still asks Meta to redeliver", () => {
    expect(classifyKeyword("START K7P4QX")).toBe("start");
    expect(classifyInbound({ type: "text", text: "start k7p4qx" })).toBe("start");
    expect(parseInbound({ type: "text", text: "start k7p4qx" })).toEqual({ keyword: "start", code: "K7P4QX" });
    expect(parseInbound({ type: "button", text: "Stop promotions", payload: "x" })).toEqual({ keyword: "stop" });
    expect(parseInbound({ type: "text", text: "hello" })).toBeNull();
  });

  // The matcher before this change, frozen here: STOP must answer exactly as it did, for every input.
  const OLD_IGNORABLE = /\u0640|[\u200E\u200F\u061C]|[\u064B-\u065F\u0670]/g;
  const OLD_EDGE = /^[\s\p{P}]+|[\s\p{P}]+$/gu;
  const oldNormalise = (t: string) => t.replace(OLD_IGNORABLE, "").replace(/[أإآ]/g, "ا").replace(OLD_EDGE, "").toLowerCase();
  const OLD_STOP = new Set(["stop", "unsubscribe", "cancel", "quit", "إيقاف", "الغاء", "إلغاء"].map(oldNormalise));
  const OLD_START = new Set(["start", "subscribe", "unstop", "resume", "ابدأ", "اشتراك"].map(oldNormalise));
  const oldClassify = (t?: string | null) => {
    const w = oldNormalise(t ?? "");
    return OLD_STOP.has(w) ? "stop" : OLD_START.has(w) ? "start" : null;
  };

  it("answers STOP for exactly the inputs it did before (STOP unchanged byte for byte)", () => {
    const words = ["stop", "STOP", "Stop", "unsubscribe", "cancel", "quit", "إيقاف", "ايقاف", "الغاء", "إلغاء", "start", "stop promotions", "stopp", "st op"];
    const wraps = ["", " ", "  ", "\t", "\u00A0", "!", "...", "«", "\u200E", "\u200F", "\u061C", "\u2066", "\u2069", "\u0640", "،", "؟"];
    const tails = ["", " K7P4QX", " please", "  now", "\u2069"];
    let compared = 0;
    for (const w of words) for (const a of wraps) for (const b of wraps) for (const tail of tails) {
      const text = a + w + tail + b;
      expect([text, classifyKeyword(text) === "stop"]).toEqual([text, oldClassify(text) === "stop"]);
      compared += 1;
    }
    expect(compared).toBeGreaterThan(10000);
  });

  it("still answers start wherever it did before (a plain START reads as it did)", () => {
    for (const w of ["start", "START", "subscribe", "unstop", "resume", "ابدأ", "ابدا", "اشتراك", "(Start)", "؛ابدأ!", "\u200Estart"]) {
      expect([w, oldClassify(w), classifyKeyword(w)]).toEqual([w, "start", "start"]);
    }
  });
});
