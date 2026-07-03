import { z } from "zod";
import { commonSchemas } from "./index";

export const placementCreateSchema = z.object({
  applicationId: commonSchemas.objectId,
  jobId: commonSchemas.objectId,
  jobSeekerId: commonSchemas.objectId,
  employerId: commonSchemas.objectId,
  agentId: commonSchemas.objectId.optional(),
  superAgentId: commonSchemas.objectId.optional(),
  startDate: z.string().datetime().optional(),
  salary: z.number().min(0).optional(),
  currency: z.string().length(3).default("USD"),
  visaStatus: z.string().max(100).optional(),
  notes: z.string().max(2000).trim().optional(),
});

export const placementUpdateSchema = z.object({
  status: z.enum(["active", "completed", "terminated"]).optional(),
  startDate: z.string().datetime().optional(),
  salary: z.number().min(0).optional(),
  currency: z.string().length(3).optional(),
  visaStatus: z.string().max(100).optional(),
  commissionPaid: z.boolean().optional(),
  commissionAmount: z.number().min(0).optional(),
  notes: z.string().max(2000).trim().optional(),
});
