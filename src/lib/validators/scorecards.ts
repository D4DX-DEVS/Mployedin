import { z } from "zod";
import { commonSchemas } from "./index";

export const scorecardCreateSchema = z.object({
  interviewId: commonSchemas.objectId,
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

export const scorecardUpdateSchema = z.object({
  scores: z
    .object({
      technicalSkills: z.number().int().min(1).max(5),
      communication: z.number().int().min(1).max(5),
      cultureFit: z.number().int().min(1).max(5),
      problemSolving: z.number().int().min(1).max(5),
      motivation: z.number().int().min(1).max(5),
    })
    .optional(),
  recommendation: z.enum(["strong_yes", "yes", "neutral", "no", "strong_no"]).optional(),
  notes: z.string().max(3000).trim().optional(),
  strengths: z.string().max(1000).trim().optional(),
  concerns: z.string().max(1000).trim().optional(),
});

export type ScorecardCreateInput = z.infer<typeof scorecardCreateSchema>;
export type ScorecardUpdateInput = z.infer<typeof scorecardUpdateSchema>;
