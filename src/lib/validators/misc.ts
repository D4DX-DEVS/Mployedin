import { z } from "zod";
import { strongPasswordSchema } from "@/lib/security/passwordPolicy";
import { commonSchemas } from "./index";
import { PIPELINE_STAGES, normalizeStageId } from "@/lib/hiring/pipeline";
import {
  MAX_WORKFLOW_STAGES,
  STAGE_ID_PATTERN,
  STAGE_LABEL_MAX,
  validateWorkflowStageDefs,
  type StageListProblem,
} from "@/lib/hiring/workflowStages";
import { SHORTLIST_TARGET_MAX, SHORTLIST_TARGET_MIN } from "@/lib/hiring/workflowSettings";

/** Contact form submission (public, no auth) */
export const contactSchema = z.object({
  name: z.string().min(1).max(100).trim(),
  email: commonSchemas.email,
  phone: commonSchemas.phone.optional().or(z.literal("")),
  subject: z.string().max(200).trim().optional().or(z.literal("")),
  message: z.string().min(1).max(5000).trim(),
  captchaToken: z.string().max(2000).optional(),
});

/** The three hiring rules. `aiAutoScreen` is retired but still accepted from old clients. */
const hiringRulesSchema = z.object({
  aiAutoScreen: z.boolean().optional(),
  notifyOnStageChange: z.boolean().optional(),
  autoRejectBelow: z.number().int().min(0).max(100).optional(),
  autoRejectEnabled: z.boolean().optional(),
  shortlistTarget: z.number().int().min(SHORTLIST_TARGET_MIN).max(SHORTLIST_TARGET_MAX).optional(),
  autoShortlistEnabled: z.boolean().optional(),
  autoShortlistAbove: z.number().int().min(0).max(100).optional(),
});

const STAGE_PROBLEM_MESSAGES: Record<StageListProblem, string> = {
  too_few: "A workflow needs at least two stages.",
  too_many: `A workflow can have at most ${MAX_WORKFLOW_STAGES} stages.`,
  first_not_applied: "The first stage must be an Applied stage.",
  no_hired: "The workflow needs a Hired stage.",
  phase_backwards: "Stages must follow the pipeline order.",
  duplicate_id: "Two stages share the same id.",
  bad_id: "A stage id is not valid.",
  empty_label: "Every stage needs a name.",
};

/** One stage: a name hung on an application status (lib/hiring/workflowStages.ts). */
const workflowStageDefSchema = z.object({
  id: z.string().regex(STAGE_ID_PATTERN),
  label: z.string().trim().min(1).max(STAGE_LABEL_MAX),
  phase: z.enum(PIPELINE_STAGES),
  order: z.number().int().min(0).max(100).optional(),
});

/** A whole stage list, checked the same way the editor checks it. */
export const workflowStageListSchema = z
  .array(workflowStageDefSchema)
  .max(MAX_WORKFLOW_STAGES)
  .superRefine((stages, ctx) => {
    for (const problem of validateWorkflowStageDefs(stages)) {
      ctx.addIssue({ code: "custom", message: STAGE_PROBLEM_MESSAGES[problem] });
    }
  })
  .transform((stages) => stages.map((stage, i) => ({ ...stage, order: i + 1 })));

/**
 * Employer workflow settings (+ optional pipeline stages).
 * The builder saves rules only since 2026-09-10; `stages` stays accepted so
 * stored lists and older clients keep round-tripping.
 */
export const workflowUpdateSchema = z.object({
  stages: z
    .array(
      z.object({
        id: z
          .string()
          .max(50)
          .refine((id) => normalizeStageId(id) !== null, { message: "Unknown pipeline stage id" }),
        label: z.string().max(100),
        enabled: z.boolean(),
        autoProgress: z.boolean(),
        order: z.number().int().min(0),
      })
    )
    .max(20)
    .optional(),
  settings: hiringRulesSchema.optional(),
  /** Per job: put the job on this template (null = back to automatic matching). */
  templateId: z.union([commonSchemas.objectId, z.null()]).optional(),
  /** Per job: stages edited for this job only. */
  customStages: workflowStageListSchema.optional(),
  /** Per employer: the template new jobs fall back to when none matches (null = platform default). */
  defaultTemplateId: z.union([commonSchemas.objectId, z.null()]).optional(),
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


const matchValues = (max: number) => z.array(z.string().trim().min(1).max(max)).max(30);

/** Which jobs a template is picked for automatically. */
export const workflowTemplateMatchSchema = z.object({
  categories: matchValues(100).optional(),
  employmentTypes: z.array(z.enum(["full_time", "part_time", "contract", "internship", "freelance", "walk_in"])).max(6).optional(),
  workModes: z.array(z.enum(["onsite", "hybrid", "remote"])).max(3).optional(),
  titleKeywords: matchValues(60).optional(),
  minExperienceYears: z.number().int().min(0).max(40).nullable().optional(),
});

/** Create/Update a workflow template */
export const workflowTemplateSchema = z.object({
  name: z.string().min(1).max(100).trim(),
  description: z.string().max(500).trim().optional(),
  stages: workflowStageListSchema,
  /** Retired: hiring rules live on the employer and the job, never on a template. Accepted and ignored. */
  settings: hiringRulesSchema.optional(),
  tags: z.array(z.string().max(50)).max(10).optional(),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
  priority: z.number().int().min(0).max(100).optional(),
  match: workflowTemplateMatchSchema.optional(),
});

/** Admin actions on a template that are not an edit. */
export const workflowTemplateActionSchema = z.object({
  action: z.enum(["set_default", "unset_default", "archive", "restore", "duplicate"]),
});

const matchingWeightValuesSchema = z.object({
  skills: z.number().min(0).max(100),
  experience: z.number().min(0).max(100),
  education: z.number().min(0).max(100),
  industryExperience: z.number().min(0).max(100),
  preferredQualifications: z.number().min(0).max(100),
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
  newPassword: strongPasswordSchema,
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

/**
 * POST /api/auth/agent-register
 * Password rule intentionally length-only (matches the previous manual check);
 * tightening to the seeker complexity rules would break the existing agent
 * signup form, which doesn't enforce them client-side.
 */
/**
 * Every self-service sign-up must carry the Terms/Privacy tick. The forms
 * check it too, but a direct API call skipped them and made an account with no
 * acceptance on record.
 */
export const TERMS_REQUIRED_MESSAGE = "Please accept the Terms of Service and Privacy Policy to create an account.";
const termsAcceptedField = z.literal(true, { error: TERMS_REQUIRED_MESSAGE });

export const agentRegisterSchema = z.object({
  fullName: z.string().min(1).max(200).trim(),
  email: z.string().email().max(254).trim().toLowerCase(),
  password: strongPasswordSchema,
  phone: commonSchemas.phone.optional().or(z.literal("")),
  country: z.string().max(100).optional(),
  city: z.string().max(100).optional(),
  experience: z.string().max(100).optional(),
  specialization: z.string().max(100).optional(),
  languages: z.string().max(300).optional(),
  referralCode: z.string().max(50).optional(),
  termsAccepted: termsAcceptedField,
  /** The visitor's cookie-banner choice, if they made one before signing up. */
  cookieConsent: z.enum(["accepted", "declined"]).optional(),
});

/** POST /api/auth/job-seeker-register */
export const jobSeekerRegisterSchema = z.object({
  name: z.string().min(1).max(200).trim(),
  email: z.string().email().max(254).trim().toLowerCase(),
  password: strongPasswordSchema,
  /** Shape is enforced by attachJobSeekerReferral; a bad code never blocks signup. */
  referralCode: z.string().trim().max(32).optional(),
  /** The Terms/Privacy checkbox; recorded in the consent log. */
  termsAccepted: termsAcceptedField,
  /** The visitor's cookie-banner choice, if they made one before signing up. */
  cookieConsent: z.enum(["accepted", "declined"]).optional(),
});
