import mongoose, { Document, Schema } from "mongoose";

export interface IPlacement extends Document {
  _id: mongoose.Types.ObjectId;
  applicationId: mongoose.Types.ObjectId;
  jobId: mongoose.Types.ObjectId;
  jobSeekerId: mongoose.Types.ObjectId;
  employerId: mongoose.Types.ObjectId;
  agentId?: mongoose.Types.ObjectId;
  superAgentId?: mongoose.Types.ObjectId;
  placedAt: Date;
  startDate?: Date;
  salary?: number;
  currency?: string;
  offerLetterUrl?: string;
  visaStatus?:
    | "not_required"
    | "pending"
    | "approved"
    | "rejected"
    | "stamped";
  commissionPaid: boolean;
  commissionAmount?: number;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

const PlacementSchema = new Schema<IPlacement>(
  {
    applicationId: {
      type: Schema.Types.ObjectId,
      ref: "Application",
      required: true,
    },
    jobId: { type: Schema.Types.ObjectId, ref: "Job", required: true },
    jobSeekerId: {
      type: Schema.Types.ObjectId,
      ref: "JobSeeker",
      required: true,
    },
    employerId: {
      type: Schema.Types.ObjectId,
      ref: "Employer",
      required: true,
    },
    agentId: { type: Schema.Types.ObjectId, ref: "Agent" },
    superAgentId: { type: Schema.Types.ObjectId, ref: "SuperAgent" },
    placedAt: { type: Date, default: Date.now },
    startDate: Date,
    salary: Number,
    currency: { type: String, default: "AED" },
    offerLetterUrl: String,
    visaStatus: {
      type: String,
      enum: [
        "not_required",
        "pending",
        "approved",
        "rejected",
        "stamped",
      ],
    },
    commissionPaid: { type: Boolean, default: false },
    commissionAmount: Number,
    notes: String,
  },
  { timestamps: true }
);

PlacementSchema.index({ jobSeekerId: 1 });
PlacementSchema.index({ employerId: 1 });
PlacementSchema.index({ agentId: 1 });
PlacementSchema.index({ superAgentId: 1 });
PlacementSchema.index({ placedAt: -1 });

export const Placement =
  mongoose.models.Placement ||
  mongoose.model<IPlacement>("Placement", PlacementSchema);
export default Placement;
