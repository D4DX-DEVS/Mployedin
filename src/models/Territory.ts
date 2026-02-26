import mongoose, { Document, Schema } from "mongoose";

export interface ITerritory extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  countries: string[]; // ISO 3166-1 alpha-2 codes
  superAgentId?: mongoose.Types.ObjectId;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const TerritorySchema = new Schema<ITerritory>(
  {
    name: { type: String, required: true, trim: true },
    countries: [{ type: String }],
    superAgentId: { type: Schema.Types.ObjectId, ref: "SuperAgent" },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

TerritorySchema.index({ name: 1 });
TerritorySchema.index({ superAgentId: 1 });

export const Territory =
  mongoose.models.Territory ||
  mongoose.model<ITerritory>("Territory", TerritorySchema);
export default Territory;
