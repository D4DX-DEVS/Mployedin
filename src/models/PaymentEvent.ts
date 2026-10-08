import mongoose, { Document, Schema } from "mongoose";

/**
 * Processed payment-gateway webhook events — the idempotency ledger.
 *
 * The webhook route INSERTS a row before doing any work. The unique
 * (provider, eventId) index makes that insert the atomic claim: a duplicate
 * delivery (gateway retry, replay) fails with E11000 and is acknowledged
 * without reprocessing. If processing throws, the row is deleted so the
 * gateway's retry can claim it again.
 *
 * Stores provider ids and amounts only — never card or bank details.
 */
export interface IPaymentEvent extends Document {
  provider: "stripe" | "razorpay";
  eventId: string;
  eventType: string;
  providerEventType: string;
  status: "processing" | "processed";
  invoiceId?: mongoose.Types.ObjectId;
  paymentId?: string;
  sessionId?: string;
  amount?: number;
  currency?: string;
  outcome?: string;
  processedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const PaymentEventSchema = new Schema<IPaymentEvent>(
  {
    provider: { type: String, enum: ["stripe", "razorpay"], required: true },
    eventId: { type: String, required: true, maxlength: 200 },
    eventType: { type: String, required: true, maxlength: 50 },
    providerEventType: { type: String, maxlength: 100 },
    status: { type: String, enum: ["processing", "processed"], default: "processing" },
    invoiceId: { type: Schema.Types.ObjectId, ref: "Invoice" },
    paymentId: { type: String, maxlength: 200 },
    sessionId: { type: String, maxlength: 200 },
    amount: Number,
    currency: { type: String, maxlength: 3 },
    outcome: { type: String, maxlength: 200 },
    processedAt: Date,
  },
  { timestamps: true },
);

PaymentEventSchema.index({ provider: 1, eventId: 1 }, { unique: true });
PaymentEventSchema.index({ invoiceId: 1, createdAt: -1 });
// Ledger rows are only needed while a provider may still retry (Stripe: 3 days,
// Razorpay: 24h). Keep 90 days for support investigations.
PaymentEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

export const PaymentEvent =
  mongoose.models.PaymentEvent ||
  mongoose.model<IPaymentEvent>("PaymentEvent", PaymentEventSchema);
export default PaymentEvent;
