import mongoose, { Document, Schema } from "mongoose";
import type { PlanTargetRole, AIFeatureKey, IEmployerFeatureLimits, IJobSeekerFeatureLimits } from "./SubscriptionPlan";

// ── Status ───────────────────────────────────────────────────────────────────
/**
 * past_due: the period ended (or a renewal payment failed) and the renewal
 * invoice is unpaid. Access continues for PAST_DUE_GRACE_DAYS (see
 * lib/subscription/gracePeriod.ts), then the invoice-overdue cron suspends it.
 */
export type SubscriptionStatus = "active" | "past_due" | "expired" | "cancelled" | "suspended";

/** Downgrade requested mid-period — applied by the subscription-expiry cron at endDate. */
export interface IPendingPlanChange {
  planId: mongoose.Types.ObjectId;
  planName?: string;
  requestedAt: Date;
  requestedBy?: mongoose.Types.ObjectId;
  effectiveAt: Date;
}

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
  /** When the subscription entered past_due (start of the payment grace window). */
  pastDueSince?: Date;
  suspendedAt?: Date;
  pendingPlanChange?: IPendingPlanChange | null;
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
      enum: ["active", "past_due", "expired", "cancelled", "suspended"],
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
    pastDueSince: Date,
    suspendedAt: Date,
    pendingPlanChange: {
      type: new Schema(
        {
          planId: { type: Schema.Types.ObjectId, ref: "SubscriptionPlan", required: true },
          planName: String,
          requestedAt: { type: Date, required: true },
          requestedBy: { type: Schema.Types.ObjectId, ref: "User" },
          effectiveAt: { type: Date, required: true },
        },
        { _id: false },
      ),
      default: undefined,
    },
  },
  { timestamps: true },
);

SubscriptionSchema.index({ userId: 1, targetRole: 1, status: 1 });
SubscriptionSchema.index({ endDate: 1, status: 1 });
SubscriptionSchema.index({ planId: 1 });
SubscriptionSchema.index({ usageResetAt: 1, status: 1 });
SubscriptionSchema.index({ status: 1, pastDueSince: 1 });

export const Subscription =
  mongoose.models.Subscription ||
  mongoose.model<ISubscription>("Subscription", SubscriptionSchema);
export default Subscription;
