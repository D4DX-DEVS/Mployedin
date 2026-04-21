import mongoose, { Document, Schema } from "mongoose";
import type { PlanTargetRole, AIFeatureKey, IEmployerFeatureLimits, IJobSeekerFeatureLimits } from "./SubscriptionPlan";

// ── Status ───────────────────────────────────────────────────────────────────
export type SubscriptionStatus = "active" | "expired" | "cancelled" | "suspended";

// ── Plan Snapshot (frozen at assignment time) ────────────────────────────────
export interface IPlanSnapshot {
  name: string;
  tier: number;
  price: number;
  currency: string;
  billingCycle: string;
  employerLimits?: IEmployerFeatureLimits;
  jobSeekerLimits?: IJobSeekerFeatureLimits;
}

// ── Usage Counters ───────────────────────────────────────────────────────────
export interface ISubscriptionUsage {
  activeJobs?: number;
  applicationsViewed?: number;
  applicationsSubmitted?: number;
  aiUsage: Record<string, number>;
}

// ── Subscription Interface ───────────────────────────────────────────────────
export interface ISubscription extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  targetRole: PlanTargetRole;
  planId: mongoose.Types.ObjectId;
  planSnapshot: IPlanSnapshot;
  status: SubscriptionStatus;
  startDate: Date;
  endDate: Date;
  autoRenew: boolean;
  usage: ISubscriptionUsage;
  usageResetAt: Date;
  assignedBy: mongoose.Types.ObjectId;
  assignedByRole: string;
  notes?: string;
  cancelledAt?: Date;
  cancelledBy?: mongoose.Types.ObjectId;
  cancellationReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

// ── Schema ───────────────────────────────────────────────────────────────────
const SubscriptionSchema = new Schema<ISubscription>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    targetRole: {
      type: String,
      enum: ["employer", "job_seeker"],
      required: true,
    },
    planId: { type: Schema.Types.ObjectId, ref: "SubscriptionPlan", required: true },
    planSnapshot: {
      type: Schema.Types.Mixed,
      required: true,
    },
    status: {
      type: String,
      enum: ["active", "expired", "cancelled", "suspended"],
      default: "active",
    },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    autoRenew: { type: Boolean, default: false },
    usage: {
      activeJobs: { type: Number, default: 0 },
      applicationsViewed: { type: Number, default: 0 },
      applicationsSubmitted: { type: Number, default: 0 },
      aiUsage: { type: Schema.Types.Mixed, default: {} },
    },
    usageResetAt: { type: Date, required: true },
    assignedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    assignedByRole: { type: String, required: true },
    notes: String,
    cancelledAt: Date,
    cancelledBy: { type: Schema.Types.ObjectId, ref: "User" },
    cancellationReason: String,
  },
  { timestamps: true },
);

SubscriptionSchema.index({ userId: 1, targetRole: 1, status: 1 });
SubscriptionSchema.index({ endDate: 1, status: 1 });
SubscriptionSchema.index({ planId: 1 });
SubscriptionSchema.index({ usageResetAt: 1, status: 1 });

export const Subscription =
  mongoose.models.Subscription ||
  mongoose.model<ISubscription>("Subscription", SubscriptionSchema);
export default Subscription;
