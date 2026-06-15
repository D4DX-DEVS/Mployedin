import { z } from "zod";
import { commonSchemas } from "./index";

/** Validators for employer background / reference checks (FG-7). */

const referenceContactSchema = z.object({
  name: z.string().trim().min(2).max(120),
  relationship: z.string().trim().max(120).optional(),
  company: z.string().trim().max(160).optional(),
  email: z.string().trim().email().max(160).optional().or(z.literal("")),
  phone: z.string().trim().max(40).optional(),
});

export const backgroundCheckCreateSchema = z.object({
  applicationId: commonSchemas.objectId,
  checkType: z.enum(["background", "reference", "both"]).default("reference"),
  references: z.array(referenceContactSchema).max(10).default([]),
  backgroundNotes: z.string().trim().max(2000).optional(),
});

export const backgroundCheckUpdateSchema = z.object({
  status: z.enum(["pending", "in_progress", "completed", "cancelled"]).optional(),
  outcome: z.enum(["clear", "flagged", "failed", "pending"]).optional(),
  backgroundResults: z.string().trim().max(4000).optional(),
  backgroundNotes: z.string().trim().max(2000).optional(),
  reference: z
    .object({
      index: z.number().int().min(0).max(9),
      status: z.enum(["pending", "requested", "responded", "declined"]).optional(),
      feedback: z.string().trim().max(2000).optional(),
    })
    .optional(),
});
