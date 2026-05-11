/**
 * Zod schemas for Subscription module validation.
 */

import { z } from "zod";
import { commonSchemas } from "./index";

// ── AI Feature Keys ──────────────────────────────────────────────────────────
const AI_FEATURE_KEYS = [
  "ai_chat", "ai_daily_insights", "ai_job_matching", "ai_cv_extraction",
  "ai_interview_questions", "ai_skills_gap", "ai_candidate_screening",
  "ai_salary_benchmark", "ai_job_description", "ai_hiring_reports",
  "ai_voice_input", "ai_skills_suggest", "ai_profile_fill",
  "ai_enhance_text", "ai_generate_summary",
] as const;

const aiFeatureLimitSchema = z.object({
  feature: z.enum(AI_FEATURE_KEYS),
  enabled: z.boolean(),
  monthlyLimit: z.number().int().min(0),
});

// ── Employer Limits ──────────────────────────────────────────────────────────
const employerLimitsSchema = z.object({
  maxActiveJobs: z.number().int().min(-1),
  maxApplicationsViewPerMonth: z.number().int().min(-1),
  maxTeamMembers: z.number().int().min(-1),
  aiFeatures: z.array(aiFeatureLimitSchema),
  analyticsLevel: z.enum(["none", "basic", "advanced"]),
  dataExport: z.boolean(),
  commTemplates: z.boolean(),
  scorecardEvaluations: z.boolean(),
  matchingWeightCustomization: z.boolean(),
  workflowCustomization: z.boolean(),
  prioritySupport: z.boolean(),
  featuredJobListings: z.number().int().min(-1),
  brandedCompanyPage: z.boolean(),
});

// ── Job Seeker Limits ────────────────────────────────────────────────────────
const jobSeekerLimitsSchema = z.object({
  maxApplicationsPerMonth: z.number().int().min(-1),
  aiFeatures: z.array(aiFeatureLimitSchema),
  profileVisibilityBoost: z.boolean(),
  salaryInsights: z.boolean(),
  priorityApplicationReview: z.boolean(),
  resumeBuilderAccess: z.boolean(),
});

// ── POST /api/admin/subscription-plans ────────────────────────────────────────
export const subscriptionPlanCreateSchema = z
  .object({
    name: z.string().min(1).max(100).trim(),
    targetRole: z.enum(["employer", "job_seeker"]),
    tier: z.number().int().min(0).max(10),
    description: z.string().max(500).trim().optional(),
    price: z.number().min(0),
    currency: z.string().min(1).max(3).default("AED"),
    billingCycle: z.enum(["monthly", "quarterly", "yearly"]),
    employerLimits: employerLimitsSchema.optional(),
    jobSeekerLimits: jobSeekerLimitsSchema.optional(),
    isActive: z.boolean().optional(),
    isDefault: z.boolean().optional(),
    sortOrder: z.number().int().min(0).optional(),
  })
  .refine(
    (d) =>
      d.targetRole === "employer" ? !!d.employerLimits : !!d.jobSeekerLimits,
    { message: "Feature limits must match the targetRole" },
  );

// ── PATCH /api/admin/subscription-plans/[id] ──────────────────────────────────
export const subscriptionPlanUpdateSchema = z.object({
  name: z.string().min(1).max(100).trim().optional(),
  targetRole: z.enum(["employer", "job_seeker"]).optional(),
  tier: z.number().int().min(0).max(10).optional(),
  description: z.string().max(500).trim().optional(),
  price: z.number().min(0).optional(),
  currency: z.string().min(1).max(3).optional(),
  billingCycle: z.enum(["monthly", "quarterly", "yearly"]).optional(),
  employerLimits: employerLimitsSchema.optional(),
  jobSeekerLimits: jobSeekerLimitsSchema.optional(),
  isActive: z.boolean().optional(),
  isDefault: z.boolean().optional(),
  sortOrder: z.number().int().min(0).optional(),
});

// ── POST /api/subscriptions/assign ───────────────────────────────────────────
export const subscriptionAssignSchema = z.object({
  userId: commonSchemas.objectId,
  planId: commonSchemas.objectId,
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  autoRenew: z.boolean().optional(),
  notes: z.string().max(500).trim().optional(),
});

// ── POST /api/subscriptions/change ───────────────────────────────────────────
export const subscriptionChangeSchema = z.object({
  userId: commonSchemas.objectId,
  newPlanId: commonSchemas.objectId,
  reason: z.string().max(500).trim().optional(),
});

// ── PATCH /api/subscriptions/[id]/cancel ─────────────────────────────────────
export const subscriptionCancelSchema = z.object({
  reason: z.string().max(500).trim().optional(),
});

// ── POST /api/subscriptions/renew ────────────────────────────────────────────
export const subscriptionRenewSchema = z.object({
  subscriptionId: commonSchemas.objectId,
  notes: z.string().max(500).trim().optional(),
});

// ── PATCH /api/invoices/[id] ─────────────────────────────────────────────────
export const invoiceUpdateSchema = z.object({
  status: z.enum(["paid", "void"]).optional(),
  notes: z.string().max(500).trim().optional(),
});

// ── POST /api/invoices/recruitment ──────────────────────────────────────────
export const recruitmentInvoiceCreateSchema = z.object({
  jobId: commonSchemas.objectId,
  employerId: commonSchemas.objectId,
  amount: z.number().min(0.01, "Amount must be greater than 0"),
  currency: z.string().length(3).default("AED"),
  notes: z.string().max(2000).trim().optional(),
});
