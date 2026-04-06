import { z } from "zod";

export const aiChatSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant", "system"]),
        content: z.string().max(4000),
      })
    )
    .min(1)
    .max(50, "Maximum 50 messages per request"),
  context: z.string().max(2000).optional(),
});

export const aiReportSchema = z.object({
  query: z.string().min(1).max(500).trim(),
  reportType: z.string().max(100).optional(),
  filters: z.record(z.string(), z.unknown()).optional(),
});

export const aiMatchSchema = z.object({
  jobId: z.string().regex(/^[a-f\d]{24}$/i),
  jobSeekerId: z.string().regex(/^[a-f\d]{24}$/i).optional(),
  candidateIds: z
    .array(z.string().regex(/^[a-f\d]{24}$/i))
    .max(100, "Maximum 100 candidates per match request")
    .optional(),
  weights: z
    .object({
      skills: z.number().min(0).max(1).optional(),
      experience: z.number().min(0).max(1).optional(),
      education: z.number().min(0).max(1).optional(),
      location: z.number().min(0).max(1).optional(),
    })
    .optional(),
});

export const aiSkillsGapSchema = z.object({
  jobSeekerId: z.string().regex(/^[a-f\d]{24}$/i).optional(),
  targetRole: z.string().max(200).optional(),
  targetJobId: z.string().regex(/^[a-f\d]{24}$/i).optional(),
});

export const aiJobDescriptionSchema = z.object({
  title: z.string().min(2).max(200).trim(),
  industry: z.string().max(100).optional(),
  seniority: z.string().max(50).optional(),
  skills: z.array(z.string().max(100)).max(30).optional(),
  tone: z.enum(["professional", "casual", "creative"]).default("professional"),
});
