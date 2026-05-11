import mongoose, { Document, Schema } from "mongoose";

export type TargetType = "employer" | "employee" | "finance";
export type TargetStatus = "active" | "completed" | "cancelled";
export type TargetAssigneeRole = "super_agent" | "agent";

export interface ITarget extends Document {
  _id: mongoose.Types.ObjectId;
  assigneeId: mongoose.Types.ObjectId;
  assigneeRole: TargetAssigneeRole;
  assignedBy: mongoose.Types.ObjectId;
  type: TargetType;
  year: number;
  month?: number;
  targetValue: number;
  currency?: string;
  parentTargetId?: mongoose.Types.ObjectId;
  notes?: string;
  status: TargetStatus;
  createdAt: Date;
  updatedAt: Date;
}

const TargetSchema = new Schema<ITarget>(
  {
    assigneeId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    assigneeRole: {
      type: String,
      enum: ["super_agent", "agent"],
      required: true,
    },
    assignedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    type: {
      type: String,
      enum: ["employer", "employee", "finance"],
      required: true,
    },
    year: { type: Number, required: true },
    month: { type: Number, min: 1, max: 12 },
    targetValue: { type: Number, required: true, min: 0 },
    currency: { type: String, default: "AED" },
    parentTargetId: { type: Schema.Types.ObjectId, ref: "Target" },
    notes: { type: String, maxlength: 2000 },
    status: {
      type: String,
      enum: ["active", "completed", "cancelled"],
      default: "active",
    },
  },
  { timestamps: true }
);

TargetSchema.index({ assigneeId: 1, year: 1, month: 1, type: 1 });
TargetSchema.index({ assignedBy: 1 });
TargetSchema.index({ parentTargetId: 1 });
TargetSchema.index({ status: 1 });

export const Target =
  mongoose.models.Target || mongoose.model<ITarget>("Target", TargetSchema);
export default Target;
