import { z } from "zod";
import { commonSchemas } from "./index";

/** Contact form submission (public, no auth) */
export const contactSchema = z.object({
  name: z.string().min(1).max(100).trim(),
  email: commonSchemas.email,
  phone: z.string().max(20).trim().optional().or(z.literal("")),
  subject: z.string().max(200).trim().optional().or(z.literal("")),
  message: z.string().min(1).max(5000).trim(),
  captchaToken: z.string().max(2000).optional(),
});

/** Employer workflow pipeline stages & settings */
export const workflowUpdateSchema = z.object({
  stages: z
    .array(
      z.object({
        id: z.string().max(50),
        label: z.string().max(100),
        enabled: z.boolean(),
        autoProgress: z.boolean(),
        order: z.number().int().min(0),
      })
    )
    .max(20),
  settings: z
    .object({
      aiAutoScreen: z.boolean().optional(),
      notifyOnStageChange: z.boolean().optional(),
      autoRejectBelow: z.number().int().min(0).max(100).optional(),
    })
    .optional(),
});

/** Employer matching weights (must total 100) */
export const matchingWeightsSchema = z.object({
  weights: z.record(z.string(), z.number().min(0).max(100)),
});

/** Notification mark-as-read */
export const notificationUpdateSchema = z.object({
  ids: z.array(commonSchemas.objectId).min(1).max(100).optional(),
  markAllRead: z.boolean().optional(),
});

// ── Template Schemas ──────────────────────────────────────────────────────────

const workflowStageTemplateSchema = z.object({
  id: z.string().max(50),
  label: z.string().max(100),
  enabled: z.boolean(),
  autoProgress: z.boolean(),
  order: z.number().int().min(0),
});

const workflowSettingsTemplateSchema = z.object({
  aiAutoScreen: z.boolean().optional(),
  notifyOnStageChange: z.boolean().optional(),
  autoRejectBelow: z.number().int().min(0).max(100).optional(),
});

/** Create/Update a workflow template */
export const workflowTemplateSchema = z.object({
  name: z.string().min(1).max(100).trim(),
  description: z.string().max(500).trim().optional(),
  stages: z.array(workflowStageTemplateSchema).min(1).max(20),
  settings: workflowSettingsTemplateSchema.optional(),
  tags: z.array(z.string().max(50)).max(10).optional(),
  isDefault: z.boolean().optional(),
});

const matchingWeightValuesSchema = z.object({
  skills: z.number().min(0).max(100),
  experience: z.number().min(0).max(100),
  education: z.number().min(0).max(100),
  location: z.number().min(0).max(100),
  salary: z.number().min(0).max(100),
  languages: z.number().min(0).max(100),
  availability: z.number().min(0).max(100),
  behaviorSignals: z.number().min(0).max(100),
});

/** Create/Update a matching weight template */
export const matchingWeightTemplateSchema = z.object({
  name: z.string().min(1).max(100).trim(),
  description: z.string().max(500).trim().optional(),
  weights: matchingWeightValuesSchema,
  tags: z.array(z.string().max(50)).max(10).optional(),
  isDefault: z.boolean().optional(),
});

/** Password change */
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(8).max(128),
});

/** PATCH /api/users/locale */
export const localeSchema = z.object({
  locale: z.enum(["en", "ar"]),
});

/** POST /api/ai/chat-history */
export const chatHistoryCreateSchema = z.object({
  threadId: commonSchemas.objectId.nullish(),
  context: z.string().min(1).max(100),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(10000),
      })
    )
    .min(1)
    .max(100),
  title: z.string().max(200).trim().nullish(),
});

/** POST /api/admin/jobs/[id]/approve */
export const jobApprovalSchema = z.object({
  approved: z.boolean(),
});

/**
 * POST /api/auth/agent-register
 * Password rule intentionally length-only (matches the previous manual check);
 * tightening to the seeker complexity rules would break the existing agent
 * signup form, which doesn't enforce them client-side.
 */
export const agentRegisterSchema = z.object({
  fullName: z.string().min(1).max(200).trim(),
  email: z.string().email().max(254).trim().toLowerCase(),
  password: z.string().min(8, "Password must be at least 8 characters").max(128),
  phone: z.string().max(30).trim().optional(),
  country: z.string().max(100).optional(),
  city: z.string().max(100).optional(),
  experience: z.string().max(100).optional(),
  specialization: z.string().max(100).optional(),
  languages: z.string().max(300).optional(),
  referralCode: z.string().max(50).optional(),
});

/** POST /api/auth/job-seeker-register */
export const jobSeekerRegisterSchema = z.object({
  name: z.string().min(1).max(200).trim(),
  email: z.string().email().max(254).trim().toLowerCase(),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(128)
    .regex(/[a-z]/, "Password must include a lowercase letter")
    .regex(/[A-Z]/, "Password must include an uppercase letter")
    .regex(/[0-9]/, "Password must include a number"),
});
