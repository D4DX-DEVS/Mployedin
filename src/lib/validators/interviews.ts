import { z } from "zod";
import { commonSchemas } from "./index";

export const interviewCreateSchema = z.object({
  applicationId: commonSchemas.objectId,
  jobSeekerId: commonSchemas.objectId.optional(),
  jobId: commonSchemas.objectId.optional(),
  employerId: commonSchemas.objectId.optional(),
  agentId: commonSchemas.objectId.optional(),
  scheduledAt: z.string().datetime().refine(
    (d) => new Date(d) > new Date(),
    { message: "Interview must be scheduled in the future" }
  ),
  duration: z.number().int().min(15).max(480).default(45),
  type: z.enum(["in_person", "video", "phone"]).default("video"),
  location: z.string().max(500).optional(),
  meetLink: z.string().url().max(2048).optional().or(z.literal("")),
  instructions: z.string().max(2000).optional(),
  notes: z.string().max(2000).optional(),
});

export const interviewUpdateSchema = z.object({
  scheduledAt: z.string().datetime().optional(),
  duration: z.number().int().min(15).max(480).optional(),
  type: z.enum(["in_person", "video", "phone"]).optional(),
  location: z.string().max(500).optional(),
  meetLink: z.string().url().max(2048).optional().or(z.literal("")),
  status: z
    .enum(["scheduled", "confirmed", "completed", "cancelled", "no_show", "rescheduled"])
    .optional(),
  feedback: z.string().max(5000).optional(),
  notes: z.string().max(2000).optional(),
});

export const scorecardCreateSchema = z.object({
  scores: z.object({
    technicalSkills: z.number().int().min(1).max(5),
    communication: z.number().int().min(1).max(5),
    cultureFit: z.number().int().min(1).max(5),
    problemSolving: z.number().int().min(1).max(5),
    motivation: z.number().int().min(1).max(5),
  }),
  recommendation: z.enum(["strong_yes", "yes", "neutral", "no", "strong_no"]),
  notes: z.string().max(3000).trim().optional(),
  strengths: z.string().max(1000).trim().optional(),
  concerns: z.string().max(1000).trim().optional(),
});

export const interviewBulkSchema = z.object({
  candidates: z
    .array(
      z.object({
        jobSeekerId: commonSchemas.objectId,
        applicationId: commonSchemas.objectId.optional(),
      })
    )
    .min(1)
    .max(100, "Maximum 100 candidates per bulk interview scheduling"),
  scheduledAt: z.string().datetime().refine(
    (d) => new Date(d) > new Date(),
    { message: "Interview must be scheduled in the future" }
  ),
  duration: z.number().int().min(15).max(480).default(45),
  type: z.enum(["in_person", "video", "phone"]).default("video"),
  location: z.string().max(500).optional(),
  meetLink: z.string().url().max(2048).optional().or(z.literal("")),
  jobId: commonSchemas.objectId.optional(),
});
