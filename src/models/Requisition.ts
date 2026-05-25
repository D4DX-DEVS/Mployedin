import mongoose, { Document, Schema } from "mongoose";

export type RequisitionStatus = "draft" | "pending_approval" | "approved" | "open" | "filled" | "cancelled" | "on_hold";
export type RequisitionPriority = "low" | "medium" | "high" | "urgent";

export interface IRequisition extends Document {
  _id: mongoose.Types.ObjectId;
  employerId: mongoose.Types.ObjectId;
  title: string;
  department: string;
  hiringManagerId: mongoose.Types.ObjectId;
  hiringManagerName: string;
  positions: number; // headcount needed
  filledPositions: number;
  priority: RequisitionPriority;
  status: RequisitionStatus;
  jobId?: mongoose.Types.ObjectId; // linked job posting when created
  budgetMin?: number;
  budgetMax?: number;
  budgetCurrency?: string;
  justification: string;
  requirements?: string;
  targetStartDate?: Date;
  approvedAt?: Date;
  approvedBy?: mongoose.Types.ObjectId;
  closedAt?: Date;
  closedReason?: string;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const RequisitionSchema = new Schema<IRequisition>(
  {
    employerId: { type: Schema.Types.ObjectId, ref: "Employer", required: true },
    title: { type: String, required: true, trim: true, maxlength: 200 },
    department: { type: String, required: true, trim: true, maxlength: 100 },
    hiringManagerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    hiringManagerName: { type: String, required: true },
    positions: { type: Number, required: true, min: 1, max: 100 },
    filledPositions: { type: Number, default: 0 },
    priority: { type: String, enum: ["low", "medium", "high", "urgent"], default: "medium" },
    status: { type: String, enum: ["draft", "pending_approval", "approved", "open", "filled", "cancelled", "on_hold"], default: "draft" },
    jobId: { type: Schema.Types.ObjectId, ref: "Job" },
    budgetMin: Number,
    budgetMax: Number,
    budgetCurrency: { type: String, default: "USD" },
    justification: { type: String, required: true, maxlength: 2000 },
    requirements: { type: String, maxlength: 2000 },
    targetStartDate: Date,
    approvedAt: Date,
    approvedBy: { type: Schema.Types.ObjectId, ref: "User" },
    closedAt: Date,
    closedReason: { type: String, maxlength: 500 },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

RequisitionSchema.index({ employerId: 1, status: 1 });
RequisitionSchema.index({ hiringManagerId: 1 });

export default mongoose.models.Requisition || mongoose.model<IRequisition>("Requisition", RequisitionSchema);
