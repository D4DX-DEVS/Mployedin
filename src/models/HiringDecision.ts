import mongoose, { Document, Schema } from "mongoose";

export type HiringDecisionOutcome = "advance" | "hire" | "reject" | "hold" | "no_decision";

export interface IHiringDecision extends Document {
  _id: mongoose.Types.ObjectId;
  applicationId: mongoose.Types.ObjectId;
  interviewId?: mongoose.Types.ObjectId;
  employerId: mongoose.Types.ObjectId;
  decidedBy: mongoose.Types.ObjectId;         // User who made the final call
  outcome: HiringDecisionOutcome;
  reasoning?: string;                          // max 2000 chars
  overriddenConsensus?: boolean;              // true if decision differs from panel consensus
  consensusSummary?: {
    totalEvaluators: number;
    averageOverall: number;
    suggestedDecision: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

const HiringDecisionSchema = new Schema<IHiringDecision>(
  {
    applicationId: {
      type: Schema.Types.ObjectId,
      ref: "Application",
      required: true,
    },
    interviewId: {
      type: Schema.Types.ObjectId,
      ref: "Interview",
    },
    employerId: {
      type: Schema.Types.ObjectId,
      ref: "Employer",
      required: true,
    },
    decidedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    outcome: {
      type: String,
      enum: ["advance", "hire", "reject", "hold", "no_decision"],
      required: true,
    },
    reasoning: { type: String, maxlength: 2000 },
    overriddenConsensus: { type: Boolean, default: false },
    consensusSummary: {
      totalEvaluators: Number,
      averageOverall: Number,
      suggestedDecision: String,
    },
  },
  { timestamps: true }
);

HiringDecisionSchema.index({ applicationId: 1 });
HiringDecisionSchema.index({ employerId: 1 });
HiringDecisionSchema.index({ interviewId: 1 });

export const HiringDecision =
  mongoose.models.HiringDecision ||
  mongoose.model<IHiringDecision>("HiringDecision", HiringDecisionSchema);
export default HiringDecision;
