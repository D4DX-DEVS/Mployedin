import mongoose, { Document, Schema } from "mongoose";

export interface ISuperAgent extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;  referralCode: string;  assignedCityIds: mongoose.Types.ObjectId[];
  assignedStateIds: mongoose.Types.ObjectId[];
  agentIds: mongoose.Types.ObjectId[];
  commissions: {
    total: number;
    pending: number;
    paid: number;
  };
  overrideRate?: number; // commission override %
  createdAt: Date;
  updatedAt: Date;
}

const SuperAgentSchema = new Schema<ISuperAgent>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    referralCode: { type: String, unique: true, sparse: true },
    assignedCityIds: [{ type: Schema.Types.ObjectId, ref: "City" }],
    assignedStateIds: [{ type: Schema.Types.ObjectId, ref: "State" }],
    agentIds: [{ type: Schema.Types.ObjectId, ref: "Agent" }],
    commissions: {
      total: { type: Number, default: 0 },
      pending: { type: Number, default: 0 },
      paid: { type: Number, default: 0 },
    },
    overrideRate: { type: Number, default: 0 },
  },
  { timestamps: true }
);

SuperAgentSchema.index({ userId: 1 }, { unique: true });
SuperAgentSchema.index({ assignedCityIds: 1 });
SuperAgentSchema.index({ assignedStateIds: 1 });

export const SuperAgent =
  mongoose.models.SuperAgent ||
  mongoose.model<ISuperAgent>("SuperAgent", SuperAgentSchema);
export default SuperAgent;
