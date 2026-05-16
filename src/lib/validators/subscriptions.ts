/**
 * Zod schemas for Subscription module validation.
 */

import { z } from "zod";
import { commonSchemas } from "./index";
import { INVOICE_UPDATE_STATUSES } from "@/lib/invoices/status";

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
  status: z.enum(INVOICE_UPDATE_STATUSES).optional(),
  notes: z.string().max(2000).trim().optional(),
  internalNotes: z.string().max(2000).trim().optional(),
  voidReason: z.string().max(500).trim().optional(),
  rejectionReason: z.string().max(500).trim().optional(),
});

// ── POST /api/invoices/[id]/delivery ────────────────────────────────────────
export const invoiceDeliverySchema = z.object({
  action: z.enum(["sent", "viewed", "downloaded", "reminder", "payment_notification"]),
  paymentMethod: z.string().max(50).optional(),
  referenceNumber: z.string().max(200).optional(),
  notes: z.string().max(500).optional(),
});

// ── POST /api/invoices/recruitment ──────────────────────────────────────────
const lineItemSchema = z.object({
  description: z.string().min(1).max(500).trim(),
  quantity: z.number().int().min(1).default(1),
  unitPrice: z.number().min(0),
  amount: z.number().min(0),
  jobId: commonSchemas.objectId.optional(),
});

const billingDetailsSchema = z.object({
  companyName: z.string().max(200).trim().optional(),
  contactPerson: z.string().max(200).trim().optional(),
  email: z.string().email().max(254).optional().or(z.literal("")),
  phone: z.string().max(20).trim().optional(),
  address: z.string().max(500).trim().optional(),
  city: z.string().max(100).trim().optional(),
  state: z.string().max(100).trim().optional(),
  country: z.string().max(100).trim().optional(),
  postalCode: z.string().max(20).trim().optional(),
  taxId: z.string().max(50).trim().optional(),
});

export const recruitmentInvoiceCreateSchema = z.object({
  jobId: commonSchemas.objectId,
  employerId: commonSchemas.objectId,
  // Line items (if empty, single-item invoice from amount)
  lineItems: z.array(lineItemSchema).max(50).optional(),
  // Pricing
  amount: z.number().min(0.01, "Amount must be greater than 0"),
  currency: z.string().length(3).default("AED"),
  discountPercent: z.number().min(0).max(100).default(0),
  taxType: z.string().max(50).default("none"),
  taxPercent: z.number().min(0).max(100).default(0),
  serviceCharge: z.number().min(0).default(0),
  // Payment terms
  paymentTerms: z.enum(["immediate", "net_7", "net_15", "net_30", "net_45", "net_60", "net_90", "custom"]).default("net_30"),
  customPaymentDays: z.number().int().min(1).max(365).optional(),
  dueDate: z.string().optional(),
  // Billing
  billingDetails: billingDetailsSchema.optional(),
  // Notes
  notes: z.string().max(2000).trim().optional(),
  internalNotes: z.string().max(2000).trim().optional(),
  // Status
  status: z.string().max(50).default("issued"),
  // Commission overrides (admin/super-agent only, 0-100%)
  overrideAgentRate: z.number().min(0).max(100).optional(),
  overrideSuperAgentRate: z.number().min(0).max(100).optional(),
});

// ── POST /api/invoices/[id]/payments ────────────────────────────────────────
export const invoicePaymentSchema = z.object({
  amount: z.number().min(0.01, "Payment amount must be greater than 0"),
  paymentDate: z.string().datetime().optional(),
  paymentMethod: z.enum(["bank_transfer", "cash", "cheque", "credit_card", "online", "other"]).default("bank_transfer"),
  referenceNumber: z.string().max(100).trim().optional(),
  notes: z.string().max(500).trim().optional(),
});
