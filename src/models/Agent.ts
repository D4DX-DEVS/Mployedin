import mongoose, { Document, Schema } from "mongoose";

export interface IAgentPerformance {
  leadsGenerated: number;
  employersCreated: number;
  vacanciesPosted: number;
  jobSeekersSubmitted: number;
  interviewsScheduled: number;
  placementsCompleted: number;
}

export interface IActivityLog {
  action: string;
  targetId?: mongoose.Types.ObjectId;
  targetType?: string;
  meta?: Record<string, unknown>;
  timestamp: Date;
}

export interface IAgent extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  superAgentId?: mongoose.Types.ObjectId;
  assignedCityIds: mongoose.Types.ObjectId[];
  assignedStateIds: mongoose.Types.ObjectId[];
  assignedEmployerIds: mongoose.Types.ObjectId[];
  assignedJobSeekerIds: mongoose.Types.ObjectId[];
  performance: IAgentPerformance;
  activityLog: IActivityLog[];
  commissionRate?: number; // percentage
  createdAt: Date;
  updatedAt: Date;
}

const ActivityLogSchema = new Schema<IActivityLog>(
  {
    action: { type: String, required: true },
    targetId: Schema.Types.ObjectId,
    targetType: String,
    meta: Schema.Types.Mixed,
    timestamp: { type: Date, default: Date.now },
  },
  { _id: false }
);

const AgentSchema = new Schema<IAgent>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    superAgentId: { type: Schema.Types.ObjectId, ref: "SuperAgent" },
    assignedCityIds: [{ type: Schema.Types.ObjectId, ref: "City" }],
    assignedStateIds: [{ type: Schema.Types.ObjectId, ref: "State" }],
    assignedEmployerIds: [{ type: Schema.Types.ObjectId, ref: "Employer" }],
    assignedJobSeekerIds: [{ type: Schema.Types.ObjectId, ref: "JobSeeker" }],
    performance: {
      leadsGenerated: { type: Number, default: 0 },
      employersCreated: { type: Number, default: 0 },
      vacanciesPosted: { type: Number, default: 0 },
      jobSeekersSubmitted: { type: Number, default: 0 },
      interviewsScheduled: { type: Number, default: 0 },
      placementsCompleted: { type: Number, default: 0 },
    },
    activityLog: [ActivityLogSchema],
    commissionRate: { type: Number, default: 0 },
  },
  { timestamps: true }
);

AgentSchema.index({ userId: 1 }, { unique: true });
AgentSchema.index({ superAgentId: 1 });
AgentSchema.index({ assignedCityIds: 1 });
AgentSchema.index({ assignedStateIds: 1 });

export const Agent =
  mongoose.models.Agent || mongoose.model<IAgent>("Agent", AgentSchema);
export default Agent;
