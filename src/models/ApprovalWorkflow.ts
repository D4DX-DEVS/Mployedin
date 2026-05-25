import mongoose, { Document, Schema } from "mongoose";

export type ApprovalType = "offer" | "requisition" | "job_posting" | "budget";
export type ApprovalStatus = "pending" | "approved" | "rejected" | "cancelled";
export type ApproverDecision = "pending" | "approved" | "rejected" | "skipped";

export interface IApprover {
  userId: mongoose.Types.ObjectId;
  name: string;
  email: string;
  order: number; // sequence in approval chain
  decision: ApproverDecision;
  decidedAt?: Date;
  comments?: string;
}

export interface IApprovalWorkflow extends Document {
  _id: mongoose.Types.ObjectId;
  employerId: mongoose.Types.ObjectId;
  type: ApprovalType;
  resourceId: mongoose.Types.ObjectId; // the offer/requisition/job being approved
  resourceTitle: string;
  requestedBy: mongoose.Types.ObjectId;
  requestedByName: string;
  approvers: IApprover[];
  currentStep: number;
  status: ApprovalStatus;
  isSequential: boolean; // true = one by one, false = all at once (parallel)
  requiredApprovals: number; // how many must approve (for parallel)
  deadline?: Date;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const ApproverSchema = new Schema<IApprover>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    name: { type: String, required: true },
    email: { type: String, required: true },
    order: { type: Number, required: true },
    decision: { type: String, enum: ["pending", "approved", "rejected", "skipped"], default: "pending" },
    decidedAt: Date,
    comments: { type: String, maxlength: 500 },
  },
  { _id: true }
);

const ApprovalWorkflowSchema = new Schema<IApprovalWorkflow>(
  {
    employerId: { type: Schema.Types.ObjectId, ref: "Employer", required: true },
    type: { type: String, enum: ["offer", "requisition", "job_posting", "budget"], required: true },
    resourceId: { type: Schema.Types.ObjectId, required: true },
    resourceTitle: { type: String, required: true, maxlength: 200 },
    requestedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    requestedByName: { type: String, required: true },
    approvers: [ApproverSchema],
    currentStep: { type: Number, default: 0 },
    status: { type: String, enum: ["pending", "approved", "rejected", "cancelled"], default: "pending" },
    isSequential: { type: Boolean, default: true },
    requiredApprovals: { type: Number, default: 1 },
    deadline: Date,
    notes: { type: String, maxlength: 500 },
  },
  { timestamps: true }
);

ApprovalWorkflowSchema.index({ employerId: 1, status: 1 });
ApprovalWorkflowSchema.index({ "approvers.userId": 1, status: 1 });
ApprovalWorkflowSchema.index({ resourceId: 1 });

export default mongoose.models.ApprovalWorkflow || mongoose.model<IApprovalWorkflow>("ApprovalWorkflow", ApprovalWorkflowSchema);
