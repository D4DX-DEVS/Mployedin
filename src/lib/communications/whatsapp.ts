/**
 * WhatsApp communication adapter — powered by Dxing (app.dxing.in)
 *
 * Env vars required:
 *   DXING_API_KEY        Your Dxing API secret key
 *   DXING_Account        Your Dxing WhatsApp account unique ID
 *   DXING_BASE_URL       https://app.dxing.in/api  (default)
 */

import logger from "@/lib/logger";

const BASE_URL = process.env.DXING_BASE_URL ?? "https://app.dxing.in/api";
const SECRET   = process.env.DXING_API_KEY ?? process.env.DXING_secret ?? "";
const ACCOUNT  = process.env.DXING_Account ?? "";

// ─── Public types ─────────────────────────────────────────────────────────────

export interface WhatsAppMessage {
  /** E.164 or local format, e.g. +971501234567 or 971501234567 */
  to: string;
  /** Plain text body */
  body: string;
  /** 1 = high priority, 2 = normal (default: 1) */
  priority?: 1 | 2;
}

export interface WhatsAppMediaMessage extends WhatsAppMessage {
  /** Direct URL to jpg, png, gif, mp4, mp3, or ogg */
  mediaUrl: string;
  /** Defaults to "image" */
  mediaType?: "image" | "audio" | "video";
}

export interface WhatsAppDocumentMessage extends WhatsAppMessage {
  /** Direct URL to pdf, xls, xlsx, doc, or docx */
  documentUrl: string;
  /** e.g. "resume.pdf" */
  documentName: string;
  /** File type */
  documentType?: "pdf" | "xls" | "xlsx" | "doc" | "docx";
}

export interface WhatsAppResult {
  messageId: string;
  status: "sent" | "mock" | "error";
}

export interface DxingOtpResult {
  phone: string;
  message: string;
  messageId: string;
  otp: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function warn(label: string) {
  logger.warn({ label }, "[WhatsApp/Dxing] check DXING_API_KEY and DXING_Account env vars");
}

function isMockMode(): boolean {
  return !SECRET || !ACCOUNT;
}

// ─── Send single text message ─────────────────────────────────────────────────

/**
 * Send a plain text WhatsApp message via Dxing.
 */
export async function sendWhatsApp(msg: WhatsAppMessage): Promise<WhatsAppResult> {
  if (isMockMode()) {
    warn("Credentials not configured. Message not sent (mock mode).");
    return { messageId: "mock-" + Date.now(), status: "mock" };
  }

  const res = await fetch(`${BASE_URL}/send/whatsapp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      secret: SECRET,
      account: ACCOUNT,
      recipient: msg.to,
      type: "text",
      message: msg.body,
      priority: msg.priority ?? 1,
    }),
  });

  const data = await res.json();

  if (data.status !== 200) {
    throw new Error(`Dxing WhatsApp error: ${data.message}`);
  }

  return { messageId: data.data?.messageId ?? "unknown", status: "sent" };
}

// ─── Send media message ───────────────────────────────────────────────────────

/**
 * Send a WhatsApp message with an image, audio, or video attachment.
 */
export async function sendWhatsAppMedia(msg: WhatsAppMediaMessage): Promise<WhatsAppResult> {
  if (isMockMode()) {
    warn("Credentials not configured. Media message not sent (mock mode).");
    return { messageId: "mock-" + Date.now(), status: "mock" };
  }

  const res = await fetch(`${BASE_URL}/send/whatsapp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      secret: SECRET,
      account: ACCOUNT,
      recipient: msg.to,
      type: "media",
      message: msg.body,
      media_url: msg.mediaUrl,
      media_type: msg.mediaType ?? "image",
      priority: msg.priority ?? 1,
    }),
  });

  const data = await res.json();

  if (data.status !== 200) {
    throw new Error(`Dxing WhatsApp media error: ${data.message}`);
  }

  return { messageId: data.data?.messageId ?? "unknown", status: "sent" };
}

// ─── Send document message ────────────────────────────────────────────────────

/**
 * Send a WhatsApp message with a document attachment.
 */
export async function sendWhatsAppDocument(msg: WhatsAppDocumentMessage): Promise<WhatsAppResult> {
  if (isMockMode()) {
    warn("Credentials not configured. Document message not sent (mock mode).");
    return { messageId: "mock-" + Date.now(), status: "mock" };
  }

  const res = await fetch(`${BASE_URL}/send/whatsapp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      secret: SECRET,
      account: ACCOUNT,
      recipient: msg.to,
      type: "document",
      message: msg.body,
      document_url: msg.documentUrl,
      document_name: msg.documentName,
      document_type: msg.documentType ?? "pdf",
      priority: msg.priority ?? 1,
    }),
  });

  const data = await res.json();

  if (data.status !== 200) {
    throw new Error(`Dxing WhatsApp document error: ${data.message}`);
  }

  return { messageId: data.data?.messageId ?? "unknown", status: "sent" };
}

// ─── Bulk message ─────────────────────────────────────────────────────────────

/**
 * Send the same message to multiple recipients via Dxing bulk API.
 */
export async function sendWhatsAppBulk(params: {
  recipients: string[];
  campaign: string;
  message: string;
  priority?: 1 | 2;
}): Promise<{ campaignId: string; messageIds: string[] }> {
  if (isMockMode()) {
    warn("Credentials not configured. Bulk message not sent (mock mode).");
    return { campaignId: "mock", messageIds: [] };
  }

  const res = await fetch(`${BASE_URL}/send/whatsapp.bulk`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      secret: SECRET,
      account: ACCOUNT,
      campaign: params.campaign,
      recipients: params.recipients.join(", "),
      type: "text",
      message: params.message,
    }),
  });

  const data = await res.json();

  if (data.status !== 200) {
    throw new Error(`Dxing WhatsApp bulk error: ${data.message}`);
  }

  return {
    campaignId: data.data?.campaignId ?? "unknown",
    messageIds: data.data?.messageIds ?? [],
  };
}

// ─── OTP ──────────────────────────────────────────────────────────────────────

/**
 * Send an OTP via WhatsApp.
 * The message must contain {{otp}} placeholder, e.g.:
 *   "Your MPLOYEDIN verification code is {{otp}}. Valid for 5 minutes."
 */
export async function sendOtp(
  phone: string,
  messageTemplate = "Your MPLOYEDIN verification code is {{otp}}. It will expire in 5 minutes."
): Promise<DxingOtpResult> {
  if (isMockMode()) {
    warn("Credentials not configured. OTP not sent (mock mode).");
    const mockOtp = Math.floor(100000 + Math.random() * 900000);
    return { phone, message: messageTemplate.replace("{{otp}}", String(mockOtp)), messageId: "mock", otp: mockOtp };
  }

  const res = await fetch(`${BASE_URL}/send/otp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      secret: SECRET,
      type: "whatsapp",
      message: messageTemplate,
      phone,
      account: ACCOUNT,
      priority: 1,
    }),
  });

  const data = await res.json();

  if (data.status !== 200) {
    throw new Error(`Dxing OTP error: ${data.message}`);
  }

  return {
    phone: data.data.phone,
    message: data.data.message,
    messageId: String(data.data.messageId),
    otp: data.data.otp,
  };
}

/**
 * Verify an OTP previously sent via Dxing.
 * Returns true if valid, false if invalid/expired.
 */
export async function verifyOtp(otp: string): Promise<boolean> {
  if (isMockMode()) {
    warn("Credentials not configured. OTP verification skipped (mock mode).");
    return true;
  }

  const url = new URL(`${BASE_URL}/get/otp`);
  url.searchParams.set("secret", SECRET);
  url.searchParams.set("otp", otp);

  const res = await fetch(url.toString(), { method: "GET" });
  const data = await res.json();

  return data.status === 200;
}

// ─── Message status ───────────────────────────────────────────────────────────

/**
 * Retrieve delivery status of a previously sent message.
 */
export async function getMessageStatus(messageId: string): Promise<{
  status: string;
  recipient: string;
  message: string;
  createdAt: number;
} | null> {
  if (isMockMode()) return null;

  const url = new URL(`${BASE_URL}/get/wa.message`);
  url.searchParams.set("secret", SECRET);
  url.searchParams.set("id", messageId);
  url.searchParams.set("type", "sent");

  const res = await fetch(url.toString(), { method: "GET" });
  const data = await res.json();

  if (data.status !== 200 || !data.data) return null;

  return {
    status: data.data.status,
    recipient: data.data.recipient,
    message: data.data.message,
    createdAt: data.data.created,
  };
}

// ─── Message templates ────────────────────────────────────────────────────────

export const WhatsAppTemplates = {
  applicationConfirmation: (name: string, jobTitle: string) =>
    `Hi ${name}! ✅ Your application for *${jobTitle}* on MPLOYEDIN has been received. We'll keep you updated here. Good luck!`,

  interviewReminder: (name: string, jobTitle: string, dateTime: string) =>
    `📅 Reminder: You have an interview for *${jobTitle}* scheduled at *${dateTime}*. Log in to MPLOYEDIN for details. Good luck!`,

  statusUpdate: (name: string, jobTitle: string, status: string) =>
    `Hi ${name}! Your application for *${jobTitle}* has been updated to: *${status.toUpperCase()}*. Check your MPLOYEDIN dashboard for more info.`,

  otpVerification: (otp: string | number) =>
    `Your MPLOYEDIN verification code is *${otp}*. Valid for 5 minutes. Do not share this code with anyone.`,

  placementCongrats: (name: string, jobTitle: string, employer: string) =>
    `🎉 Congratulations ${name}! You've been placed as *${jobTitle}* at *${employer}* through MPLOYEDIN. Welcome aboard!`,
};
