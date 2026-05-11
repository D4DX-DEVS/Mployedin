import { z } from "zod";
import { commonSchemas } from "./index";

export const targetCreateSchema = z.object({
  assigneeId: commonSchemas.objectId,
  assigneeRole: z.enum(["super_agent", "agent"]),
  type: z.enum(["employer", "employee", "finance"]),
  year: z.number().int().min(2020).max(2100),
  month: z.number().int().min(1).max(12).optional(),
  targetValue: z.number().min(0),
  currency: z.string().length(3).default("AED"),
  notes: z.string().max(2000).trim().optional(),
});

export const targetUpdateSchema = z.object({
  targetValue: z.number().min(0).optional(),
  currency: z.string().length(3).optional(),
  notes: z.string().max(2000).trim().optional(),
  status: z.enum(["active", "completed", "cancelled"]).optional(),
});

export const targetDistributeSchema = z.object({
  targetId: commonSchemas.objectId,
  monthlyValues: z
    .array(z.object({ month: z.number().int().min(1).max(12), value: z.number().min(0) }))
    .min(1)
    .max(12)
    .optional(),
});

export const agentDistributeSchema = z.object({
  month: z.number().int().min(1).max(12),
  year: z.number().int().min(2020).max(2100),
  type: z.enum(["employer", "employee", "finance"]),
  allocations: z
    .array(z.object({ agentUserId: commonSchemas.objectId, value: z.number().min(0) }))
    .min(1),
});
