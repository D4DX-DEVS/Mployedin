import { z } from "zod";
import { commonSchemas } from "./index";

export const applicationCreateSchema = z.object({
  jobId: commonSchemas.objectId,
  coverLetter: z.string().max(5000).trim().optional(),
  easyApply: z.boolean().optional(),
});

export const applicationUpdateSchema = z
  .object({
    status: z
      .enum([
        "applied",
        "screening",
        "shortlisted",
        "interview",
        "interview_scheduled",
        "selected",
        "offer",
        "hired",
        "rejected",
        "withdrawn",
      ])
      .optional(),
    note: z.string().max(2000).trim().optional(),
    rejectionReason: z.string().max(500).trim().optional(),
    employerNotes: z.string().max(2000).trim().optional(),
    agentNotes: z.string().max(2000).trim().optional(),
    withdrawalReason: z
      .enum(["accepted_elsewhere", "salary_too_low", "bad_experience", "too_slow_process", "changed_mind", "personal_reasons", "other"])
      .optional(),
    withdrawalNote: z.string().max(500).trim().optional(),
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
      targetStage: z.string().max(50).optional(),
      rejectionReason: z.string().max(500).optional(),
      messageContent: z.string().max(2000).optional(),
      templateId: commonSchemas.objectId.optional(),
    })
    .optional(),
});

export const npsCreateSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(500).trim().optional(),
});
