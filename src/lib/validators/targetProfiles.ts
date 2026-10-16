import { z } from "zod";
import { commonSchemas } from "./index";
import { MAX_PERIODS, PERIOD_TYPES, isIsoDate } from "@/lib/targets/schedule";

/* ------------------------------------------------------------------ */
/*  Shared building blocks                                             */
/* ------------------------------------------------------------------ */

const strategySchema = z.enum(["equal", "custom", "seasonal"]);
const periodTypeSchema = z.enum(PERIOD_TYPES);

/** A profit amount: finite, non-negative, at most two decimals (minor units). */
const profitAmountSchema = z
  .number()
  .finite()
  .min(0)
  .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6, {
    message: "Use at most two decimal places",
  });

const isoDateSchema = z.string().refine(isIsoDate, { message: "Use a real date as YYYY-MM-DD" });

/** One period of a schedule. Bounds are whole days, both inclusive. */
export const targetPeriodSchema = z.object({
  label: z.string().max(60).trim().optional(),
  startDate: isoDateSchema,
  endDate: isoDateSchema,
  profitTarget: profitAmountSchema,
});

const periodsSchema = z.array(targetPeriodSchema).min(1).max(MAX_PERIODS);

/** A custom split, or a custom set of periods, cannot be generated: it has to be sent. */
function requirePeriodsWhenNotGenerable(
  data: { periodType?: string; distributionStrategy?: string; periods?: unknown[] },
  ctx: z.RefinementCtx,
  path: (string | number)[] = [],
) {
  if (data.periods) return;
  if (data.periodType === "custom") {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "A custom schedule needs its periods", path: [...path, "periods"] });
  }
}

/* ------------------------------------------------------------------ */
/*  Create — profit target profile                                     */
/* ------------------------------------------------------------------ */

// Admin sets the top of the chain. Agent targets are carved out of their super
// agent's target by the super agent (agentTargetDistributeSchema), so an agent
// profile is never created from free-form input and always has a parent.
export const targetProfileCreateSchema = z
  .object({
    assigneeId: commonSchemas.objectId,
    assigneeRole: z.literal("super_agent"),
    year: z.number().int().min(2020).max(2100),
    region: z.string().max(100).trim().optional(),

    profitTarget: profitAmountSchema,
    currency: z.string().length(3).default("AED"),

    periodType: periodTypeSchema.default("monthly"),
    distributionStrategy: strategySchema.default("equal"),
    periods: periodsSchema.optional(),

    notes: z.string().max(2000).trim().optional(),
  })
  .superRefine((data, ctx) => requirePeriodsWhenNotGenerable(data, ctx));

/* ------------------------------------------------------------------ */
/*  Update — partial fields                                            */
/* ------------------------------------------------------------------ */

export const targetProfileUpdateSchema = z.object({
  profitTarget: profitAmountSchema.optional(),
  currency: z.string().length(3).optional(),
  region: z.string().max(100).trim().optional(),
  periodType: periodTypeSchema.optional(),
  distributionStrategy: strategySchema.optional(),
  periods: periodsSchema.optional(),
  notes: z.string().max(2000).trim().optional(),
  status: z.enum(["active", "completed", "cancelled"]).optional(),
});

/* ------------------------------------------------------------------ */
/*  Reassign — admin transfers an active profile                       */
/* ------------------------------------------------------------------ */

export const targetProfileReassignSchema = z.object({
  newAssigneeId: commonSchemas.objectId,
  reason: z.string().max(500).trim().optional(),
});

/* ------------------------------------------------------------------ */
/*  Bulk create — same target for several super agents                 */
/* ------------------------------------------------------------------ */

export const targetProfileBulkCreateSchema = z
  .object({
    assigneeIds: z.array(commonSchemas.objectId).min(1).max(100),
    // Admin sets the top of the chain; super agents split it among agents.
    assigneeRole: z.literal("super_agent"),
    year: z.number().int().min(2020).max(2100),
    region: z.string().max(100).trim().optional(),
    profitTarget: profitAmountSchema,
    currency: z.string().length(3).default("AED"),
    periodType: periodTypeSchema.default("monthly"),
    distributionStrategy: strategySchema.default("equal"),
    periods: periodsSchema.optional(),
    notes: z.string().max(2000).trim().optional(),
  })
  .superRefine((data, ctx) => {
    requirePeriodsWhenNotGenerable(data, ctx);
    if (data.distributionStrategy === "custom" && !data.periods && data.periodType !== "annual") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "A custom split requires the periods and their amounts",
        path: ["periods"],
      });
    }
  });

/* ------------------------------------------------------------------ */
/*  Bulk tabular — a different target per super agent                  */
/* ------------------------------------------------------------------ */

export const targetProfileBulkTabularSchema = z.object({
  year: z.number().int().min(2020).max(2100),
  assigneeRole: z.literal("super_agent"),
  currency: z.string().length(3).default("AED"),
  region: z.string().max(100).trim().optional(),
  targets: z
    .array(
      z.object({
        assigneeId: commonSchemas.objectId,
        profitTarget: profitAmountSchema,
        currency: z.string().length(3).optional(),
        periodType: periodTypeSchema.optional(),
        distributionStrategy: strategySchema.optional(),
        periods: periodsSchema.optional(),
        notes: z.string().max(2000).trim().optional(),
      })
    )
    .min(1)
    .max(100),
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
/*  Agent distribute — super agent splits their target to agents       */
/* ------------------------------------------------------------------ */

export const agentTargetDistributeSchema = z
  .object({
    year: z.number().int().min(2020).max(2100),
    allocationMode: z.enum(["equal", "weighted", "manual"]).default("manual"),
    allocations: z
      .array(
        z.object({
          agentUserId: commonSchemas.objectId,
          profitTarget: profitAmountSchema,
          weight: z.number().min(0).max(100).optional(),
          periodType: periodTypeSchema.default("monthly"),
          distributionStrategy: strategySchema.default("equal"),
          periods: periodsSchema.optional(),
          notes: z.string().max(500).trim().optional(),
        })
      )
      .min(1)
      .max(100),
  })
  .superRefine((data, ctx) => {
    const ids = data.allocations.map((allocation) => allocation.agentUserId);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Duplicate agent selection is not allowed",
        path: ["allocations"],
      });
    }

    data.allocations.forEach((allocation, index) => {
      requirePeriodsWhenNotGenerable(allocation, ctx, ["allocations", index]);
      if (allocation.distributionStrategy === "custom" && !allocation.periods && allocation.periodType !== "annual") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "A custom split requires the periods and their amounts",
          path: ["allocations", index, "periods"],
        });
      }
    });
  });
