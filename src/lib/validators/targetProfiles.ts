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

/** A non-negative integer: jobs or onboarded hires. */
const countSchema = z.number().int().min(0).max(1_000_000);

/** Invoiced revenue: finite, non-negative, at most two decimals. */
const revenueSchema = z
  .number()
  .finite()
  .min(0)
  .max(1_000_000_000_000)
  .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6, {
    message: "Use at most two decimal places",
  });

/** One period of a profit schedule. Bounds are whole days, both inclusive. */
export const targetPeriodSchema = z.object({
  label: z.string().max(60).trim().optional(),
  startDate: isoDateSchema,
  endDate: isoDateSchema,
  profitTarget: profitAmountSchema,
});

/** One period of a KPI3 schedule. Bounds are whole days, both inclusive. */
export const kpi3PeriodSchema = z.object({
  label: z.string().max(60).trim().optional(),
  startDate: isoDateSchema,
  endDate: isoDateSchema,
  profitTarget: profitAmountSchema.optional().default(0),
  jobTarget: countSchema.optional().default(0),
  conversionTarget: countSchema.optional().default(0),
  revenueTarget: revenueSchema.optional().default(0),
});

const periodsSchema = z.array(targetPeriodSchema).min(1).max(MAX_PERIODS);
const kpi3PeriodsSchema = z.array(kpi3PeriodSchema).min(1).max(MAX_PERIODS);

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
    assigneeRole: z.enum(["super_agent", "agent"]).default("super_agent"),
    year: z.number().int().min(2020).max(2100),
    region: z.string().max(100).trim().optional(),
    targetType: z.enum(["profit", "kpi3"]).default("kpi3").optional(),

    profitTarget: profitAmountSchema,
    currency: z.string().length(3).default("AED"),

    // KPI3 yearly totals (sums of periods)
    jobTarget: countSchema.optional(),
    conversionTarget: countSchema.optional(),
    revenueTarget: revenueSchema.optional(),

    periodType: periodTypeSchema.default("monthly"),
    distributionStrategy: strategySchema.default("equal"),
    periods: periodsSchema.optional(),

    notes: z.string().max(2000).trim().optional(),
  })
  .superRefine((data, ctx) => requirePeriodsWhenNotGenerable(data, ctx));

/* ------------------------------------------------------------------ */
/*  Create — KPI3 target profile (3 pillars: jobs, onboarded, revenue) */
/* ------------------------------------------------------------------ */

export const kpi3ProfileCreateSchema = z
  .object({
    assigneeId: commonSchemas.objectId,
    assigneeRole: z.enum(["super_agent", "agent"]),
    year: z.number().int().min(2020).max(2100),
    region: z.string().max(100).trim().optional(),

    // Admin-only finance figure (R9)
    profitTarget: profitAmountSchema.default(0),
    // No default: an edit without a currency keeps the stored one (SA-16);
    // the route falls back to AED only on create.
    currency: z.string().length(3).optional(),

    // KPI3 yearly totals (sums of periods)
    jobTarget: countSchema.optional(),
    conversionTarget: countSchema.optional(),
    revenueTarget: revenueSchema.optional(),

    periodType: periodTypeSchema.default("monthly"),
    distributionStrategy: strategySchema.default("equal"),
    periods: kpi3PeriodsSchema.optional(),

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
  reason: z.string().max(500).trim().optional(),
});

/** Update for KPI3 profiles */
export const kpi3ProfileUpdateSchema = z.object({
  profitTarget: profitAmountSchema.optional(),
  currency: z.string().length(3).optional(),
  region: z.string().max(100).trim().optional(),
  jobTarget: countSchema.optional(),
  conversionTarget: countSchema.optional(),
  revenueTarget: revenueSchema.optional(),
  periodType: periodTypeSchema.optional(),
  distributionStrategy: strategySchema.optional(),
  periods: kpi3PeriodsSchema.optional(),
  notes: z.string().max(2000).trim().optional(),
  status: z.enum(["active", "completed", "cancelled"]).optional(),
  reason: z.string().max(500).trim().optional(),
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
        profitTarget: profitAmountSchema.default(0),
        currency: z.string().length(3).optional(),
        // kpi3 (default): the three yearly targets; profit stays 0 (R9).
        targetType: z.enum(["profit", "kpi3"]).default("kpi3"),
        jobTarget: countSchema.default(0),
        conversionTarget: countSchema.default(0),
        revenueTarget: revenueSchema.default(0),
        periodType: periodTypeSchema.optional(),
        distributionStrategy: strategySchema.optional(),
        // kpi3 periods carry each month's three figures; profit periods carry profitTarget.
        periods: kpi3PeriodsSchema.optional(),
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
