import { z } from "zod";
import { commonSchemas } from "./index";

/**
 * The only statuses an Application can hold. Must stay in lockstep with the enum
 * on Application.status (models/Application.ts:105-114).
 *
 * This list previously also carried "screening" and "interview" here in the
 * validators while the model rejected them: such a value passed validation and
 * then threw at save(), surfacing as a 500 rather than a clean 400.
 */
export const APPLICATION_STATUSES = [
  "applied",
  "shortlisted",
  "interview_scheduled",
  "selected",
  "offer",
  "hired",
  "rejected",
  "withdrawn",
] as const;

export const applicationCreateSchema = z.object({
  jobId: commonSchemas.objectId,
  coverLetter: z.string().max(5000).trim().optional(),
  easyApply: z.boolean().optional(),
  screeningAnswers: z.array(
    z.object({
      questionId: z.string().min(1).max(50),
      questionLabel: z.string().min(1).max(500),
      answer: z.union([z.string().max(2000), z.array(z.string().max(200)), z.boolean()]),
    })
  ).max(20).optional(),
  // Attach specific profile documents (by their id) to this application.
  documentIds: z.array(z.string().max(64)).max(10).optional(),
  // Attach the profile's parsed CV (cv.originalUrl) to this application.
  includeProfileCv: z.boolean().optional(),
  // Optional portfolio link for this application (must be http/https).
  portfolioUrl: z
    .string()
    .trim()
    .max(500)
    .url()
    .refine((u) => /^https?:\/\//i.test(u), { message: "Portfolio link must start with http:// or https://" })
    .optional(),
});

export const applicationUpdateSchema = z
  .object({
    status: z.enum(APPLICATION_STATUSES).optional(),
    note: z.string().max(2000).trim().optional(),
    rejectionReason: z.string().max(500).trim().optional(),
    employerNotes: z.string().max(2000).trim().optional(),
    agentNotes: z.string().max(2000).trim().optional(),
    withdrawalReason: z
      .enum(["accepted_elsewhere", "salary_too_low", "bad_experience", "too_slow_process", "changed_mind", "personal_reasons", "other"])
      .optional(),
    withdrawalNote: z.string().max(500).trim().optional(),
    // Employer opened the application — stamps viewedByEmployerAt (clears "New" badge)
    markViewed: z.boolean().optional(),
  })
  .refine(
    (data) => data.status !== "rejected" || !!data.rejectionReason,
    { message: "Rejection reason is required when rejecting an application", path: ["rejectionReason"] }
  );

export const noteCreateSchema = z.object({
  content: z.string().min(1).max(2000).trim(),
  // mentions: array of 24-char ObjectId strings extracted from @[userId] patterns in the UI
  mentions: z.array(z.string().regex(/^[a-f\d]{24}$/i, "Invalid ObjectId")).max(20).optional(),
});

export const bulkActionSchema = z.object({
  applicationIds: z
    .array(commonSchemas.objectId)
    .min(1)
    .max(100, "Maximum 100 applications per bulk action"),
  action: z.enum(["reject", "move_stage", "send_message"]),
  params: z
    .object({
      // Enum-checked for the same reason as status above: an unvalidated stage
      // reached save() and failed there instead of returning 400.
      targetStage: z.enum(APPLICATION_STATUSES).optional(),
      rejectionReason: z.string().max(500).optional(),
      messageContent: z.string().max(5000).optional(),
      templateId: commonSchemas.objectId.optional(),
      /** Custom email subject (supports {{jobTitle}}, {{companyName}} placeholders) */
      emailSubject: z.string().max(200).optional(),
      /** Custom email body HTML (supports {{candidateName}}, {{jobTitle}}, {{companyName}}, {{status}} placeholders) */
      emailBody: z.string().max(10000).optional(),
    })
    .optional(),
});

export const npsCreateSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(500).trim().optional(),
});
