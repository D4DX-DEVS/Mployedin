/**
 * The one door every WhatsApp send goes through. Honours the number-level
 * suppression list (a STOP from the number) and mock mode, writes a
 * WhatsAppMessageLog row for every attempt or skip, and never throws — callers
 * read the outcome and decide what a failure means for them.
 */
import logger from "@/lib/logger";
import { logWhatsAppDelivery, type WhatsAppLogInput, type WhatsAppSource } from "@/models/WhatsAppMessageLog";
import { isNumberSuppressed } from "@/models/WhatsAppSuppression";
import { whatsAppMode } from "./config";
import { sendTemplateMessage, sendTextMessage } from "./cloudApi";
import { WhatsAppApiError, type WhatsAppErrorKind } from "./errors";
import { toWaRecipient } from "./phone";
import { summarizeError } from "./redact";
import { sanitizeTemplateParam } from "./tokens";

export type SendOutcome =
  /** `waId`: Meta's id for the recipient (sent only), which can differ from the typed number; callers that know the user store it. */
  | { status: "sent" | "mock"; messageId: string; waId?: string }
  | { status: "failed"; error: Error; errorKind?: WhatsAppErrorKind }
  /** The number replied STOP (WhatsAppSuppression): nothing was sent. */
  | { status: "skipped"; reason: "opted_out" };

interface CommonInput {
  to: string;
  userId?: string;
  source: WhatsAppSource;
  category?: string;
  notificationType?: string;
}

export interface SendTemplateInput extends CommonInput {
  templateName: string;
  language: string;
  params: string[];
  scheduleId?: string;
  broadcastId?: string;
}

export interface SendTextInput extends CommonInput {
  body: string;
  /**
   * Skips the suppression check. Only the keyword replies in
   * webhookHandlers.ts pass it: the STOP/START confirmations (the STOP reply
   * goes to a number that has just been suppressed, and the promise of a
   * confirmation is part of the opt-out) and the reply to a START that
   * verified nobody, which answers the number's own message. Text only: no
   * template send can skip the list (a source scan test pins both,
   * bypassSuppressionScope.test.ts).
   */
  bypassSuppression?: boolean;
}

/** The log fields known before the attempt; the outcome fields are added per branch. */
type LogBase = Omit<WhatsAppLogInput, "status" | "waMessageId" | "errorCode" | "errorKind" | "errorMessage" | "skipReason">;

/**
 * The outcome's error is rebuilt from the scrubbed message, not passed through: Node's
 * fetch echoes a malformed Authorization header ("Bearer …") in its TypeError, and this
 * message is stored on the log row and relayed by every caller. A fresh Error also drops
 * the original's stack, which repeats the message.
 */
function failure(err: unknown): Extract<SendOutcome, { status: "failed" }> {
  return { status: "failed", error: new Error(summarizeError(err).message), errorKind: err instanceof WhatsAppApiError ? err.kind : undefined };
}

/**
 * cloudApi reports `"unknown"` when Meta's 2xx body carries no message id. The
 * log's `waMessageId` index is unique + sparse, so that placeholder must never
 * be stored (a second one would collide); an absent field is skipped by the index.
 */
function loggableMessageId(messageId: string): string | undefined {
  return messageId && messageId !== "unknown" ? messageId : undefined;
}

/** logWhatsAppDelivery already swallows write errors; this keeps the facade's "never throws" even if that changes. */
async function record(row: WhatsAppLogInput): Promise<void> {
  try {
    await logWhatsAppDelivery(row);
  } catch (err) {
    logger.error({ err }, "[whatsapp] could not record message log");
  }
}

/**
 * Shared by template and text sends: validate the number, honour the suppression
 * list and mock mode, call Meta, log the outcome.
 */
async function deliver(
  base: LogBase,
  send: (recipient: string) => Promise<{ messageId: string; waId?: string }>,
  bypassSuppression = false,
): Promise<SendOutcome> {
  const recipient = toWaRecipient(base.to);
  if (!recipient) {
    // Raw input stays on the skipped row: there is no valid number to normalise.
    await record({ ...base, status: "skipped", skipReason: "invalid_phone" });
    return failure(new Error("Recipient phone is not a valid international number"));
  }
  const row = { ...base, to: `+${recipient}` };
  // A STOP from the number, until a newer START (the rule lives in the model:
  // isSuppressionInForce), holds for every send path (orchestrator, broadcast,
  // schedule, test), whichever account carries the number. Checked in mock mode
  // too, so a mock run shows the same skips.
  if (!bypassSuppression) {
    let suppressed: boolean;
    try {
      suppressed = await isNumberSuppressed(row.to);
    } catch (err) {
      // A withdrawn consent must fail as "do not send": an unreadable list refuses the send.
      const f = failure(new Error("The WhatsApp opt-out list could not be read"));
      logger.warn({ errorName: summarizeError(err).name }, "[whatsapp] opt-out list unreadable, send refused");
      await record({ ...row, status: "failed", errorMessage: f.error.message });
      return f;
    }
    if (suppressed) {
      await record({ ...row, status: "skipped", skipReason: "opted_out" });
      return { status: "skipped", reason: "opted_out" };
    }
  }
  if (whatsAppMode() === "mock") {
    await record({ ...row, status: "mock" });
    return { status: "mock", messageId: `mock-${Date.now()}` };
  }
  let res: { messageId: string; waId?: string };
  try {
    res = await send(recipient);
  } catch (err) {
    const f = failure(err);
    const errorCode = err instanceof WhatsAppApiError ? err.code : undefined;
    const { name: errorName, causeCode } = summarizeError(err);
    // No phone number and no raw `err` (its stack repeats the message): the log row carries the number, and the message here is the scrubbed one.
    // errorName and causeCode keep a network failure debuggable (TimeoutError, ECONNREFUSED) without the original error.
    logger.warn({ template: base.templateName, errorKind: f.errorKind, errorCode, errorName, causeCode, errorMessage: f.error.message }, `[whatsapp] ${base.kind} send failed`);
    await record({
      ...row,
      status: "failed",
      errorCode,
      errorKind: f.errorKind,
      errorMessage: f.error.message,
    });
    return f;
  }
  // Outside the try: Meta accepted the message, so nothing about logging it may turn this into a failure.
  await record({ ...row, status: "sent", waMessageId: loggableMessageId(res.messageId) });
  return { status: "sent", messageId: res.messageId, ...(res.waId ? { waId: res.waId } : {}) };
}

export async function sendWhatsAppTemplate(input: SendTemplateInput): Promise<SendOutcome> {
  return deliver(
    {
      userId: input.userId,
      to: input.to,
      kind: "template",
      templateName: input.templateName,
      templateLanguage: input.language,
      source: input.source,
      category: input.category ?? "system",
      notificationType: input.notificationType,
      scheduleId: input.scheduleId,
      broadcastId: input.broadcastId,
    },
    (recipient) =>
      sendTemplateMessage({
        to: recipient,
        name: input.templateName,
        language: input.language,
        bodyParams: input.params.map(sanitizeTemplateParam),
      }),
  );
}

export async function sendWhatsAppText(input: SendTextInput): Promise<SendOutcome> {
  return deliver(
    {
      userId: input.userId,
      to: input.to,
      kind: "text",
      source: input.source,
      category: input.category ?? "system",
      notificationType: input.notificationType,
    },
    (recipient) => sendTextMessage({ to: recipient, body: input.body }),
    input.bypassSuppression,
  );
}
