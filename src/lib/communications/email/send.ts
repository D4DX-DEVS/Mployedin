import jwt from "jsonwebtoken";
import { logEmailDelivery } from "@/models/EmailLog";
import logger from "@/lib/logger";
import type { EmailPayload } from "./types";
import { resolveTransport } from "./resolveTransport";

/**
 * Seed and QA accounts use reserved domains (RFC 2606 .test/.invalid/.example,
 * plus our own test.* subdomains). They can never receive mail, but every attempt
 * still spends one of the sending account's limited daily recipients and earns a
 * bounce against its reputation — 26 of 229 digest recipients on 2026-09-17.
 */
const UNDELIVERABLE_HOST = /(^|\.)(test|invalid|example|localhost)$|^test\./i;

export function isUndeliverableAddress(address: string): boolean {
  const host = address.split("@")[1]?.trim().toLowerCase();
  return host ? UNDELIVERABLE_HOST.test(host) : true;
}

export async function sendEmail(payload: EmailPayload): Promise<{ messageId: string }> {
  const toAddr = Array.isArray(payload.to) ? payload.to.join(", ") : payload.to;

  // Refuse reserved test domains before a connection is opened, so seeded data
  // cannot eat the daily sending quota that OTP and password-reset mail shares.
  const deliverable = (Array.isArray(payload.to) ? payload.to : [payload.to]).filter((a) => !isUndeliverableAddress(a));
  if (deliverable.length === 0) {
    logEmailDelivery({
      userId: payload.userId,
      to: toAddr,
      subject: payload.subject,
      category: payload.category ?? "system",
      source: payload.source ?? "direct",
      status: "failed",
      errorMessage: "Not sent: reserved test domain (RFC 2606) — this address can never receive mail",
    }).catch((err) => { logger.error({ err, to: toAddr }, "Failed to log skipped email"); });
    throw new Error("Recipient address is a reserved test domain and cannot receive mail");
  }

  const { transporter: t, fromEmail, fromName, provider, sesConfigurationSet } = await resolveTransport(payload.employerId);
  const senderName = payload.senderName || fromName || "MPLOYEDIN";

  // Build List-Unsubscribe headers (RFC 8058) if userId is provided
  const headers: Record<string, string> = {};
  if (payload.userId && process.env.NEXTAUTH_SECRET) {
    // Same precedence as lib/http/publicOrigin.ts and lib/auth/config.ts —
    // skipping NEXT_PUBLIC_APP_URL sent staging unsubscribe links to production.
    const baseUrl =
      process.env.NEXT_PUBLIC_BASE_URL ??
      process.env.NEXTAUTH_URL ??
      process.env.NEXT_PUBLIC_APP_URL ??
      "https://mployedin.com";
    const token = jwt.sign({ userId: payload.userId, action: "unsubscribe" }, process.env.NEXTAUTH_SECRET, { expiresIn: "90d" });
    const unsubUrl = `${baseUrl}/api/unsubscribe?token=${token}`;
    headers["List-Unsubscribe"] = `<${unsubUrl}>`;
    headers["List-Unsubscribe-Post"] = "List-Unsubscribe=One-Click";
  }

  try {
    const info = await t.sendMail({
      from: `${senderName} <${fromEmail}>`,
      to: toAddr,
      subject: payload.subject,
      html: payload.html,
      text: payload.text ?? payload.html.replace(/<[^>]+>/g, ""),
      replyTo: payload.replyTo,
      headers,
      attachments: payload.attachments?.map((a) => ({
        filename: a.filename,
        content: a.content,
        contentType: a.contentType,
      })),
      // nodemailer's SES transport merges this into the SendEmailCommand input.
      ...(provider === "ses" && sesConfigurationSet ? { ses: { ConfigurationSetName: sesConfigurationSet } } : {}),
    });

    // Log successful delivery (non-blocking)
    logEmailDelivery({
      userId: payload.userId,
      to: toAddr,
      subject: payload.subject,
      category: payload.category ?? "system",
      source: payload.source ?? "direct",
      status: "sent",
      messageId: info.messageId,
      metadata: { provider },
    }).catch((err) => { logger.error({ err, to: toAddr, subject: payload.subject }, "Failed to log email delivery"); });

    return { messageId: info.messageId };
  } catch (err) {
    // Log failure (non-blocking)
    logEmailDelivery({
      userId: payload.userId,
      to: toAddr,
      subject: payload.subject,
      category: payload.category ?? "system",
      source: payload.source ?? "direct",
      status: "failed",
      errorMessage: err instanceof Error ? err.message : "Unknown error",
      metadata: { provider },
    }).catch((logErr) => { logger.error({ err: logErr, to: toAddr, subject: payload.subject }, "Failed to log email failure"); });

    throw err;
  }
}
