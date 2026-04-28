import mongoose, { Document, Schema } from "mongoose";

export interface ITerritory extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  countries: string[];
  superAgentId?: mongoose.Types.ObjectId;
  /** City IDs included in this territory — synced to SuperAgent.assignedCityIds */
  cityIds: mongoose.Types.ObjectId[];
  /** State IDs included in this territory — synced to SuperAgent.assignedStateIds */
  stateIds: mongoose.Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const TerritorySchema = new Schema<ITerritory>(
  {
    name: { type: String, required: true, trim: true },
    countries: [{ type: String }],
    superAgentId: { type: Schema.Types.ObjectId, ref: "User", default: null },
    cityIds: [{ type: Schema.Types.ObjectId, ref: "City" }],
    stateIds: [{ type: Schema.Types.ObjectId, ref: "State" }],
  },
  { timestamps: true }
);

TerritorySchema.index({ name: 1 });
TerritorySchema.index({ superAgentId: 1 });

export const Territory =
  mongoose.models.Territory ||
  mongoose.model<ITerritory>("Territory", TerritorySchema);
export default Territory;
