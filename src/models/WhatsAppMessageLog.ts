import mongoose, { Document, Schema } from "mongoose";
import logger from "@/lib/logger";

/**
 * WhatsAppMessageLog — one row per outbound WhatsApp message (or a deliberate
 * skip), mirroring EmailLog. Status moves forward as Meta's webhooks arrive:
 * sent → delivered → read, or sent → failed. TTL 90 days (index in indexes.ts).
 */
export const WHATSAPP_MESSAGE_STATUSES = ["sent", "delivered", "read", "failed", "mock", "skipped"] as const;
export const WHATSAPP_SOURCES = ["orchestrator", "broadcast", "schedule", "test", "auto_reply"] as const;
export type WhatsAppMessageStatus = (typeof WHATSAPP_MESSAGE_STATUSES)[number];
export type WhatsAppSource = (typeof WHATSAPP_SOURCES)[number];

export interface IWhatsAppMessageLog extends Document {
  _id: mongoose.Types.ObjectId;
  userId?: string;
  to: string; // E.164 with "+"
  waMessageId?: string;
  kind: "template" | "text";
  templateName?: string;
  templateLanguage?: string;
  source: WhatsAppSource;
  category: string;
  notificationType?: string;
  status: WhatsAppMessageStatus;
  errorCode?: number;
  errorKind?: string;
  errorMessage?: string;
  skipReason?: string;
  scheduleId?: string;
  broadcastId?: string;
  conversationCategory?: string;
  sentAt: Date;
  statusAt?: Date;
  createdAt: Date;
}

const WhatsAppMessageLogSchema = new Schema<IWhatsAppMessageLog>(
  {
    userId: { type: String },
    to: { type: String, required: true },
    waMessageId: { type: String },
    kind: { type: String, enum: ["template", "text"], required: true },
    templateName: String,
    templateLanguage: String,
    source: { type: String, enum: WHATSAPP_SOURCES, required: true },
    category: { type: String, required: true },
    notificationType: String,
    status: { type: String, enum: WHATSAPP_MESSAGE_STATUSES, required: true },
    errorCode: Number,
    errorKind: String,
    errorMessage: String,
    skipReason: String,
    scheduleId: String,
    broadcastId: String,
    conversationCategory: String,
    sentAt: { type: Date, default: Date.now },
    statusAt: Date,
  },
  { timestamps: true },
);

export interface WhatsAppLogInput {
  userId?: string;
  to: string;
  waMessageId?: string;
  kind: "template" | "text";
  templateName?: string;
  templateLanguage?: string;
  source: WhatsAppSource;
  category: string;
  notificationType?: string;
  status: WhatsAppMessageStatus;
  errorCode?: number;
  errorKind?: string;
  errorMessage?: string;
  skipReason?: string;
  scheduleId?: string;
  broadcastId?: string;
}

/** Log a delivery attempt. Never throws — logging must not break sending. */
export async function logWhatsAppDelivery(data: WhatsAppLogInput): Promise<void> {
  try {
    await WhatsAppMessageLog.create({ ...data, sentAt: new Date() });
  } catch (err) {
    logger.error({ err }, "[whatsapp-log] could not record message");
  }
}

export const WhatsAppMessageLog =
  mongoose.models.WhatsAppMessageLog ||
  mongoose.model<IWhatsAppMessageLog>("WhatsAppMessageLog", WhatsAppMessageLogSchema);

export default WhatsAppMessageLog;
