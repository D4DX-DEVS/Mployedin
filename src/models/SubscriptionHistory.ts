import mongoose, { Document, Schema } from "mongoose";

// ── Types ────────────────────────────────────────────────────────────────────
export type SubscriptionAction =
  | "assigned"
  | "upgraded"
  | "downgraded"
  | "renewed"
  | "cancelled"
  | "expired"
  | "suspended"
  | "reactivated";

// ── Interface ────────────────────────────────────────────────────────────────
export interface ISubscriptionHistory extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  subscriptionId: mongoose.Types.ObjectId;
  action: SubscriptionAction;
  fromPlanId?: mongoose.Types.ObjectId;
  toPlanId?: mongoose.Types.ObjectId;
  fromPlanName?: string;
  toPlanName?: string;
  performedBy?: mongoose.Types.ObjectId;
  performedByRole: string;
  reason?: string;
  meta?: Record<string, unknown>;
  createdAt: Date;
}

// ── Schema ───────────────────────────────────────────────────────────────────
const SubscriptionHistorySchema = new Schema<ISubscriptionHistory>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    subscriptionId: { type: Schema.Types.ObjectId, ref: "Subscription", required: true },
    action: {
      type: String,
      enum: ["assigned", "upgraded", "downgraded", "renewed", "cancelled", "expired", "suspended", "reactivated"],
      required: true,
    },
    fromPlanId: { type: Schema.Types.ObjectId, ref: "SubscriptionPlan" },
    toPlanId: { type: Schema.Types.ObjectId, ref: "SubscriptionPlan" },
    fromPlanName: String,
    toPlanName: String,
    // Optional: system-initiated events (auto-renewal, expiry, online purchase)
    // have no human actor — performedByRole:"system" conveys the actor instead.
    performedBy: { type: Schema.Types.ObjectId, ref: "User" },
    performedByRole: { type: String, required: true },
    reason: String,
    meta: { type: Schema.Types.Mixed },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

SubscriptionHistorySchema.index({ userId: 1, createdAt: -1 });
SubscriptionHistorySchema.index({ subscriptionId: 1 });

export const SubscriptionHistory =
  mongoose.models.SubscriptionHistory ||
  mongoose.model<ISubscriptionHistory>("SubscriptionHistory", SubscriptionHistorySchema);
export default SubscriptionHistory;
