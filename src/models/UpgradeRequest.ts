import mongoose, { Document, Schema } from "mongoose";

/**
 * A customer's request to move to another plan.
 *
 * There is no payment gateway yet, so "Choose plan" cannot charge anyone.
 * Instead the customer asks, the request reaches admins (and the employer's
 * agent), and an admin approves it — which applies the plan through
 * `applyPlanToUser` and issues the invoice to settle offline.
 */
export type UpgradeRequestStatus = "pending" | "approved" | "declined" | "cancelled";

export interface IUpgradeRequest extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  targetRole: "employer" | "job_seeker";
  fromPlanId?: mongoose.Types.ObjectId;
  fromPlanName?: string;
  toPlanId: mongoose.Types.ObjectId;
  toPlanName: string;
  toPlanPrice: number;
  toPlanCurrency: string;
  /** Employer's agent at request time, so agents can list their clients' requests. */
  agentId?: mongoose.Types.ObjectId;
  note?: string;
  status: UpgradeRequestStatus;
  decidedBy?: mongoose.Types.ObjectId;
  decidedAt?: Date;
  decisionNote?: string;
  createdAt: Date;
  updatedAt: Date;
}

const UpgradeRequestSchema = new Schema<IUpgradeRequest>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    targetRole: { type: String, enum: ["employer", "job_seeker"], required: true },
    fromPlanId: { type: Schema.Types.ObjectId, ref: "SubscriptionPlan" },
    fromPlanName: String,
    toPlanId: { type: Schema.Types.ObjectId, ref: "SubscriptionPlan", required: true },
    toPlanName: { type: String, required: true },
    toPlanPrice: { type: Number, required: true },
    toPlanCurrency: { type: String, required: true },
    agentId: { type: Schema.Types.ObjectId, ref: "Agent" },
    note: { type: String, maxlength: 500 },
    status: {
      type: String,
      enum: ["pending", "approved", "declined", "cancelled"],
      default: "pending",
      required: true,
    },
    decidedBy: { type: Schema.Types.ObjectId, ref: "User" },
    decidedAt: Date,
    decisionNote: { type: String, maxlength: 500 },
  },
  { timestamps: true },
);

UpgradeRequestSchema.index({ status: 1, createdAt: -1 });
UpgradeRequestSchema.index({ userId: 1, createdAt: -1 });
UpgradeRequestSchema.index({ agentId: 1, status: 1 });
// One open request per customer; a second ask replaces nothing silently.
UpgradeRequestSchema.index(
  { userId: 1 },
  { unique: true, partialFilterExpression: { status: "pending" } },
);

export const UpgradeRequest =
  (mongoose.models.UpgradeRequest as mongoose.Model<IUpgradeRequest>) ||
  mongoose.model<IUpgradeRequest>("UpgradeRequest", UpgradeRequestSchema);

export default UpgradeRequest;
