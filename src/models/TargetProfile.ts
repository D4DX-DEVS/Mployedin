import mongoose, { Document, Schema } from "mongoose";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type TargetAssigneeRole = "super_agent" | "agent";
export type TargetStatus = "active" | "completed" | "cancelled";
export type DistributionStrategy = "equal" | "custom" | "seasonal";

export interface IMonthlyTarget {
  month: number; // 1–12
  employerTarget: number;
  employeeTarget: number;
  financeTarget: number;
}

export interface ITargetProfile extends Document {
  _id: mongoose.Types.ObjectId;
  assigneeId: mongoose.Types.ObjectId;
  assigneeRole: TargetAssigneeRole;
  assignedBy: mongoose.Types.ObjectId;
  year: number;
  region?: string;

  // Unified annual targets (all 3 in one doc)
  employerTarget: number;
  employeeTarget: number;
  financeTarget: number;
  currency: string;

  // Monthly distribution
  distributionStrategy: DistributionStrategy;
  monthlyTargets: IMonthlyTarget[];

  // Link to parent profile (for agents → supervisor chain)
  parentProfileId?: mongoose.Types.ObjectId;

  notes?: string;
  status: TargetStatus;
  createdAt: Date;
  updatedAt: Date;
}

/* ------------------------------------------------------------------ */
/*  Schema                                                             */
/* ------------------------------------------------------------------ */

const MonthlyTargetSchema = new Schema<IMonthlyTarget>(
  {
    month: { type: Number, required: true, min: 1, max: 12 },
    employerTarget: { type: Number, required: true, min: 0, default: 0 },
    employeeTarget: { type: Number, required: true, min: 0, default: 0 },
    financeTarget: { type: Number, required: true, min: 0, default: 0 },
  },
  { _id: false }
);

const TargetProfileSchema = new Schema<ITargetProfile>(
  {
    assigneeId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    assigneeRole: {
      type: String,
      enum: ["super_agent", "agent"],
      required: true,
    },
    assignedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    year: { type: Number, required: true, min: 2020, max: 2100 },
    region: { type: String, trim: true },

    employerTarget: { type: Number, required: true, min: 0, default: 0 },
    employeeTarget: { type: Number, required: true, min: 0, default: 0 },
    financeTarget: { type: Number, required: true, min: 0, default: 0 },
    currency: { type: String, default: "AED", maxlength: 3 },

    distributionStrategy: {
      type: String,
      enum: ["equal", "custom", "seasonal"],
      default: "equal",
    },
    monthlyTargets: { type: [MonthlyTargetSchema], default: [] },

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

// One active unified profile per person per year.
TargetProfileSchema.index(
  { assigneeId: 1, year: 1, assigneeRole: 1 },
  { unique: true, partialFilterExpression: { status: "active" } }
);
TargetProfileSchema.index({ assignedBy: 1 });
TargetProfileSchema.index({ parentProfileId: 1 });
TargetProfileSchema.index({ status: 1, year: 1 });
TargetProfileSchema.index({ region: 1, year: 1 });
TargetProfileSchema.index({ assigneeRole: 1, year: 1 });

export const TargetProfile =
  mongoose.models.TargetProfile ||
  mongoose.model<ITargetProfile>("TargetProfile", TargetProfileSchema);

export default TargetProfile;
