import mongoose, { Document, Schema } from "mongoose";

export type WebhookEvent =
  | "invoice.created"
  | "invoice.paid"
  | "invoice.credit_note"
  | "commission.created"
  | "commission.approved"
  | "commission.paid"
  | "commission.disputed"
  | "commission.clawed_back"
  | "application.created"
  | "application.status_changed"
  | "job.created"
  | "job.updated"
  | "job.closed"
  | "interview.scheduled"
  | "offer.sent"
  | "offer.accepted"
  | "candidate.hired";

export const WEBHOOK_EVENTS: WebhookEvent[] = [
  "invoice.created",
  "invoice.paid",
  "invoice.credit_note",
  "commission.created",
  "commission.approved",
  "commission.paid",
  "commission.disputed",
  "commission.clawed_back",
  "application.created",
  "application.status_changed",
  "job.created",
  "job.updated",
  "job.closed",
  "interview.scheduled",
  "offer.sent",
  "offer.accepted",
  "candidate.hired",
];

export interface IWebhookDelivery {
  event: string;
  status: "success" | "failed";
  statusCode?: number;
  responseTime?: number;
  error?: string;
  deliveredAt: Date;
  /**
   * The exact body that was sent, retained for failed deliveries only.
   *
   * An admin could see that a delivery failed and do nothing about it — the
   * only way to re-send was to make the underlying event happen again. Storing
   * the payload is what makes redelivery a real replay rather than a fresh
   * ping. Successful deliveries do not keep it: there is nothing to replay and
   * the log holds 50 entries per webhook.
   */
  payload?: string;
}

export interface IWebhook extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  url: string;
  secret: string;
  events: WebhookEvent[];
  headers?: Record<string, string>;
  isActive: boolean;
  retryCount: number;
  lastTriggeredAt?: Date;
  lastStatus?: "success" | "failed";
  deliveryLog: IWebhookDelivery[];
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const WebhookDeliverySchema = new Schema<IWebhookDelivery>(
  {
    payload: { type: String },
    event: { type: String, required: true },
    status: { type: String, enum: ["success", "failed"], required: true },
    statusCode: Number,
    responseTime: Number,
    error: String,
    deliveredAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const WebhookSchema = new Schema<IWebhook>(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    url: { type: String, required: true, trim: true, maxlength: 2048 },
    secret: { type: String, required: true, select: false },
    events: [{ type: String, enum: WEBHOOK_EVENTS }],
    headers: { type: Schema.Types.Mixed },
    isActive: { type: Boolean, default: true },
    retryCount: { type: Number, default: 3, min: 0, max: 10 },
    lastTriggeredAt: Date,
    lastStatus: { type: String, enum: ["success", "failed"] },
    deliveryLog: {
      type: [WebhookDeliverySchema],
      default: [],
      validate: [(v: IWebhookDelivery[]) => v.length <= 50, "Max 50 delivery logs"],
    },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
);

WebhookSchema.index({ events: 1, isActive: 1 });
WebhookSchema.index({ createdBy: 1 });

export const Webhook =
  mongoose.models.Webhook || mongoose.model<IWebhook>("Webhook", WebhookSchema);

export default Webhook;
