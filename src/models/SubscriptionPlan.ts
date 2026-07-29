import mongoose, { Document, Schema } from "mongoose";

// Re-export shared types & constants so existing server-side imports keep working
export type {
  PlanTargetRole,
  AIFeatureKey,
  IAIFeatureLimit,
  IEmployerFeatureLimits,
  IJobSeekerFeatureLimits,
} from "@/types/subscription-plan";
export { AI_FEATURE_KEYS } from "@/types/subscription-plan";

import type {
  AIFeatureKey,
  IAIFeatureLimit,
  IEmployerFeatureLimits,
  IJobSeekerFeatureLimits,
  PlanTargetRole,
} from "@/types/subscription-plan";
import { AI_FEATURE_KEYS } from "@/types/subscription-plan";

// ── Subscription Plan Interface ──────────────────────────────────────────────
export interface ISubscriptionPlan extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  slug: string;
  targetRole: PlanTargetRole;
  tier: number;
  description?: string;
  price: number;
  currency: string;
  billingCycle: "monthly" | "quarterly" | "yearly";
  employerLimits?: IEmployerFeatureLimits;
  jobSeekerLimits?: IJobSeekerFeatureLimits;
  isActive: boolean;
  isDefault: boolean;
  sortOrder: number;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

// ── AI Feature Limit Sub-Schema ──────────────────────────────────────────────
const AIFeatureLimitSchema = new Schema(
  {
    feature: { type: String, enum: AI_FEATURE_KEYS, required: true },
    enabled: { type: Boolean, default: false },
    monthlyLimit: { type: Number, default: 0, min: 0 },
  },
  { _id: false },
);

// ── Employer Limits Sub-Schema ───────────────────────────────────────────────
const EmployerFeatureLimitsSchema = new Schema(
  {
    maxActiveJobs: { type: Number, required: true, min: -1 },
    maxApplicationsViewPerMonth: { type: Number, required: true, min: -1 },
    maxTeamMembers: { type: Number, required: true, min: -1 },
    aiFeatures: { type: [AIFeatureLimitSchema], default: [] },
    analyticsLevel: { type: String, enum: ["none", "basic", "advanced"], default: "none" },
    dataExport: { type: Boolean, default: false },
    commTemplates: { type: Boolean, default: false },
    scorecardEvaluations: { type: Boolean, default: false },
    matchingWeightCustomization: { type: Boolean, default: false },
    workflowCustomization: { type: Boolean, default: false },
    prioritySupport: { type: Boolean, default: false },
    featuredJobListings: { type: Number, default: 0, min: -1 },
    brandedCompanyPage: { type: Boolean, default: false },
  },
  { _id: false },
);

// ── Job Seeker Limits Sub-Schema ─────────────────────────────────────────────
const JobSeekerFeatureLimitsSchema = new Schema(
  {
    maxApplicationsPerMonth: { type: Number, required: true, min: -1 },
    aiFeatures: { type: [AIFeatureLimitSchema], default: [] },
    profileVisibilityBoost: { type: Boolean, default: false },
    salaryInsights: { type: Boolean, default: false },
    priorityApplicationReview: { type: Boolean, default: false },
    resumeBuilderAccess: { type: Boolean, default: false },
  },
  { _id: false },
);

// ── Main Schema ──────────────────────────────────────────────────────────────
const SubscriptionPlanSchema = new Schema<ISubscriptionPlan>(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    slug: { type: String, required: true, unique: true, lowercase: true },
    targetRole: {
      type: String,
      enum: ["employer", "job_seeker"],
      required: true,
    },
    tier: { type: Number, required: true, min: 0, max: 10 },
    description: { type: String, maxlength: 500 },
    price: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, default: "AED", maxlength: 3 },
    billingCycle: {
      type: String,
      enum: ["monthly", "quarterly", "yearly"],
      required: true,
      default: "monthly",
    },
    employerLimits: { type: EmployerFeatureLimitsSchema },
    jobSeekerLimits: { type: JobSeekerFeatureLimitsSchema },
    isActive: { type: Boolean, default: true },
    isDefault: { type: Boolean, default: false },
    sortOrder: { type: Number, default: 0 },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true },
);

SubscriptionPlanSchema.index({ targetRole: 1, isActive: 1, sortOrder: 1 });
SubscriptionPlanSchema.index(
  { targetRole: 1, isDefault: 1 },
  {
    unique: true,
    name: "unique_default_subscription_plan_per_role",
    partialFilterExpression: { isDefault: true },
  },
);

// Auto-generate slug from targetRole + name
SubscriptionPlanSchema.pre("validate", function () {
  if (this.isModified("name") || this.isModified("targetRole") || !this.slug) {
    this.slug = `${this.targetRole}_${this.name}`.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_]/g, "");
  }
});

export const SubscriptionPlan =
  mongoose.models.SubscriptionPlan ||
  mongoose.model<ISubscriptionPlan>("SubscriptionPlan", SubscriptionPlanSchema);
export default SubscriptionPlan;
