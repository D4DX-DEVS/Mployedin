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
  country?: string;
  currencyCode?: string;
  timezone?: string;
  workingHoursStart?: string;
  workingHoursEnd?: string;
  workingDays?: string[];
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
    country: { type: String, default: "" },
    currencyCode: { type: String, default: "AED" },
    timezone: { type: String, default: "Asia/Dubai" },
    workingHoursStart: { type: String, default: "09:00" },
    workingHoursEnd: { type: String, default: "18:00" },
    workingDays: { type: [String], default: ["Mon", "Tue", "Wed", "Thu", "Fri"] },
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
