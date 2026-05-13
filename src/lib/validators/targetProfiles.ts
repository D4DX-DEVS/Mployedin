import { z } from "zod";
import { commonSchemas } from "./index";

/* ------------------------------------------------------------------ */
/*  Monthly target sub-schema                                          */
/* ------------------------------------------------------------------ */

const monthlyTargetSchema = z.object({
  month: z.number().int().min(1).max(12),
  employerTarget: z.number().min(0).default(0),
  employeeTarget: z.number().min(0).default(0),
  financeTarget: z.number().min(0).default(0),
});

/* ------------------------------------------------------------------ */
/*  Create — unified target profile                                    */
/* ------------------------------------------------------------------ */

export const targetProfileCreateSchema = z.object({
  assigneeId: commonSchemas.objectId,
  assigneeRole: z.enum(["super_agent", "agent"]),
  year: z.number().int().min(2020).max(2100),
  region: z.string().max(100).trim().optional(),

  employerTarget: z.number().min(0),
  employeeTarget: z.number().min(0),
  financeTarget: z.number().min(0),
  currency: z.string().length(3).default("AED"),

  distributionStrategy: z.enum(["equal", "custom", "seasonal"]).default("equal"),
  monthlyTargets: z.array(monthlyTargetSchema).max(12).optional(),

  parentProfileId: commonSchemas.objectId.optional(),
  notes: z.string().max(2000).trim().optional(),
});

/* ------------------------------------------------------------------ */
/*  Update — partial fields                                            */
/* ------------------------------------------------------------------ */

export const targetProfileUpdateSchema = z.object({
  employerTarget: z.number().min(0).optional(),
  employeeTarget: z.number().min(0).optional(),
  financeTarget: z.number().min(0).optional(),
  currency: z.string().length(3).optional(),
  region: z.string().max(100).trim().optional(),
  distributionStrategy: z.enum(["equal", "custom", "seasonal"]).optional(),
  monthlyTargets: z.array(monthlyTargetSchema).max(12).optional(),
  notes: z.string().max(2000).trim().optional(),
  status: z.enum(["active", "completed", "cancelled"]).optional(),
});

/* ------------------------------------------------------------------ */
/*  Monthly distribution                                               */
/* ------------------------------------------------------------------ */

export const targetProfileDistributeSchema = z.object({
  profileId: commonSchemas.objectId,
  strategy: z.enum(["equal", "custom", "seasonal"]).default("equal"),
  monthlyTargets: z.array(monthlyTargetSchema).length(12).optional(),
});

/* ------------------------------------------------------------------ */
/*  Bulk create — assign to multiple people                            */
/* ------------------------------------------------------------------ */

export const targetProfileBulkCreateSchema = z.object({
  assigneeIds: z.array(commonSchemas.objectId).min(1).max(100),
  assigneeRole: z.enum(["super_agent", "agent"]),
  year: z.number().int().min(2020).max(2100),
  region: z.string().max(100).trim().optional(),
  employerTarget: z.number().min(0),
  employeeTarget: z.number().min(0),
  financeTarget: z.number().min(0),
  currency: z.string().length(3).default("AED"),
  distributionStrategy: z.enum(["equal", "custom", "seasonal"]).default("equal"),
  notes: z.string().max(2000).trim().optional(),
});

/* ------------------------------------------------------------------ */
/*  Clone from previous year                                           */
/* ------------------------------------------------------------------ */

export const targetProfileCloneSchema = z.object({
  sourceYear: z.number().int().min(2020).max(2100),
  targetYear: z.number().int().min(2020).max(2100),
  adjustmentPct: z.number().min(-100).max(500).default(0),
});

/* ------------------------------------------------------------------ */
/*  Agent distribute — supervisor splits targets to agents             */
/* ------------------------------------------------------------------ */

export const agentTargetDistributeSchema = z.object({
  year: z.number().int().min(2020).max(2100),
  allocationMode: z.enum(["equal", "weighted", "manual"]).default("manual"),
  allocations: z
    .array(
      z.object({
        agentUserId: commonSchemas.objectId,
        employerTarget: z.number().min(0),
        employeeTarget: z.number().min(0),
        financeTarget: z.number().min(0),
        weight: z.number().min(0).max(100).optional(),
        distributionStrategy: z.enum(["equal", "custom", "seasonal"]).default("equal"),
        monthlyTargets: z.array(monthlyTargetSchema).length(12).optional(),
        notes: z.string().max(500).trim().optional(),
      })
    )
    .min(1)
    .max(100),
}).superRefine((data, ctx) => {
  const ids = data.allocations.map((allocation) => allocation.agentUserId);
  if (new Set(ids).size !== ids.length) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Duplicate agent selection is not allowed",
      path: ["allocations"],
    });
  }

  data.allocations.forEach((allocation, index) => {
    if (allocation.distributionStrategy === "custom" && !allocation.monthlyTargets) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Custom monthly distribution requires monthly targets",
        path: ["allocations", index, "monthlyTargets"],
      });
    }
  });
});

/* ------------------------------------------------------------------ */
/*  Re-export old schemas for backward compatibility                   */
/* ------------------------------------------------------------------ */

export {
  targetCreateSchema,
  targetUpdateSchema,
  targetDistributeSchema,
  agentDistributeSchema,
} from "./targets";
