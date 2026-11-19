import mongoose, { Document, Schema } from "mongoose";
import { PERIOD_TYPES, type PeriodType } from "@/lib/targets/schedule";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type TargetAssigneeRole = "super_agent" | "agent";
export type TargetStatus = "active" | "completed" | "cancelled";
export type DistributionStrategy = "equal" | "custom" | "seasonal";
/**
 * "kpi3": the three performance pillars (jobs acquired, onboarded, invoiced
 * revenue) — every profile written since 2026-11. "profit": the older
 * profit-only profiles, still readable. Documents without a type are the
 * retired employer/employee/finance profiles.
 */
export type TargetType = "profit" | "kpi3";
export const TARGET_TYPES = ["profit", "kpi3"] as const;
export type TargetSetBy = "admin" | "super_agent";
export type { PeriodType };

/** One slice of the yearly target. Bounds are whole UTC days, both inclusive. */
export interface ITargetPeriod {
  /** Names a custom period; the standard types are named by their position. */
  label?: string;
  startDate: Date;
  endDate: Date;
  profitTarget: number;
  /** Jobs to bring in (first published) in this period. */
  jobTarget?: number;
  /** Hires on closed jobs in this period. */
  conversionTarget?: number;
  /** Invoiced revenue (total minus tax) in this period, in the profile's currency. */
  revenueTarget?: number;
}

export interface ITargetProfile extends Document {
  _id: mongoose.Types.ObjectId;
  targetType: TargetType;
  assigneeId: mongoose.Types.ObjectId;
  assigneeRole: TargetAssigneeRole;
  assignedBy: mongoose.Types.ObjectId;
  year: number;
  region?: string;

  /** Yearly company-profit target, in `currency` (net invoice income, see lib/targets/profitCalculator). Admin-only finance figure. */
  profitTarget: number;
  currency: string;

  /** Yearly totals of the three pillars; always the sum of `periods`. */
  jobTarget?: number;
  conversionTarget?: number;
  revenueTarget?: number;
  /** Who set the current figures. An admin edit of a super agent's target marks it overridden. */
  setByRole?: TargetSetBy;
  overriddenByAdmin?: boolean;

  /** How the year is cut up: annual, quarterly, monthly, weekly, or the owner's own ranges. */
  periodType: PeriodType;
  /** How `profitTarget` was spread over the periods when it was set. */
  distributionStrategy: DistributionStrategy;
  /** The periods and what each is worth; they add up to `profitTarget`. */
  periods: ITargetPeriod[];

  // Link to parent profile (for agents → supervisor chain)
  parentProfileId?: mongoose.Types.ObjectId;

  notes?: string;
  status: TargetStatus;
  createdAt: Date;
  updatedAt: Date;

  /** @deprecated Retired metrics; present only on documents created before profit targets. */
  employerTarget?: number;
  employeeTarget?: number;
  financeTarget?: number;
}

/**
 * Query filter for live target profiles (profit-only and three-pillar).
 * Retired profiles carry no `targetType`, so every read of the live module
 * spreads this to leave them out. The name is kept from when profit was the
 * only kind; one person still has one active profile per year.
 */
export const PROFIT_TARGET_FILTER = { targetType: { $in: [...TARGET_TYPES] } };

/* ------------------------------------------------------------------ */
/*  Schema                                                             */
/* ------------------------------------------------------------------ */

const TargetPeriodSchema = new Schema<ITargetPeriod>(
  {
    label: { type: String, trim: true, maxlength: 60 },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    profitTarget: { type: Number, required: true, min: 0, default: 0 },
    jobTarget: { type: Number, min: 0, default: 0 },
    conversionTarget: { type: Number, min: 0, default: 0 },
    revenueTarget: { type: Number, min: 0, default: 0 },
  },
  { _id: false }
);

const TargetProfileSchema = new Schema<ITargetProfile>(
  {
    targetType: { type: String, enum: TARGET_TYPES, default: "kpi3", required: true },
    assigneeId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    assigneeRole: {
      type: String,
      enum: ["super_agent", "agent"],
      required: true,
    },
    assignedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    year: { type: Number, required: true, min: 2020, max: 2100 },
    region: { type: String, trim: true },

    profitTarget: { type: Number, required: true, min: 0, default: 0 },
    currency: { type: String, default: "AED", maxlength: 3 },

    jobTarget: { type: Number, min: 0, default: 0 },
    conversionTarget: { type: Number, min: 0, default: 0 },
    revenueTarget: { type: Number, min: 0, default: 0 },
    setByRole: { type: String, enum: ["admin", "super_agent"] },
    overriddenByAdmin: { type: Boolean, default: false },

    employerTarget: { type: Number, min: 0 },
    employeeTarget: { type: Number, min: 0 },
    financeTarget: { type: Number, min: 0 },

    periodType: { type: String, enum: PERIOD_TYPES, default: "monthly", required: true },
    distributionStrategy: {
      type: String,
      enum: ["equal", "custom", "seasonal"],
      default: "equal",
    },
    periods: { type: [TargetPeriodSchema], default: [] },

    parentProfileId: { type: Schema.Types.ObjectId, ref: "TargetProfile" },
    notes: { type: String, maxlength: 2000 },
    status: {
      type: String,
      enum: ["active", "completed", "cancelled"],
      default: "active",
    },
  },
  { timestamps: true }
);

// One active profile per person per year. Retired profiles are cancelled by
// scripts/migrate-retire-legacy-targets.mjs, so they never hold this slot.
TargetProfileSchema.index(
  { assigneeId: 1, year: 1, assigneeRole: 1 },
  { unique: true, partialFilterExpression: { status: "active" } }
);
TargetProfileSchema.index({ assignedBy: 1 });
TargetProfileSchema.index({ parentProfileId: 1 });
TargetProfileSchema.index({ status: 1, year: 1 });
TargetProfileSchema.index({ region: 1, year: 1 });
TargetProfileSchema.index({ assigneeRole: 1, year: 1 });

// `mongoose.models.X ||` keeps the FIRST schema a long-running dev server saw:
// after this file changes, hot reload kept writing profiles through the old
// model, which dropped the new fields and saved empty, still-"active" rows that
// then blocked the real ones. Outside production the model is registered again
// each time this module is evaluated (which only happens when it changes).
if (process.env.NODE_ENV !== "production" && mongoose.models.TargetProfile) {
  mongoose.deleteModel("TargetProfile");
}

export const TargetProfile =
  mongoose.models.TargetProfile ||
  mongoose.model<ITargetProfile>("TargetProfile", TargetProfileSchema);

export default TargetProfile;
