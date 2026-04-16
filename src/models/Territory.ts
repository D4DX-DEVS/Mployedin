import mongoose, { Document, Schema } from "mongoose";

export interface ITerritory extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  countries: string[];
  superAgentId?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const TerritorySchema = new Schema<ITerritory>(
  {
    name: { type: String, required: true, trim: true },
    countries: [{ type: String }],
    superAgentId: { type: Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

TerritorySchema.index({ name: 1 });
TerritorySchema.index({ superAgentId: 1 });

export const Territory =
  mongoose.models.Territory ||
  mongoose.model<ITerritory>("Territory", TerritorySchema);
export default Territory;
