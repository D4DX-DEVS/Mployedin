import mongoose, { Document, Schema } from "mongoose";

/**
 * A super agent's territory, by name. The region itself — the cities and
 * states — lives on the SuperAgent profile (`assignedCityIds` /
 * `assignedStateIds`), which every super-agent screen, scope helper and lead
 * route reads. This document only names it, one per super agent.
 *
 * Older documents also carry `countries`, `cityIds` and `stateIds`. Nothing
 * reads them: the countries were a hardcoded GCC list and the ids never
 * reached the super agent.
 */
export interface ITerritory extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  /** User id of the super agent (role super_agent), not the SuperAgent profile id. */
  superAgentId?: mongoose.Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const TerritorySchema = new Schema<ITerritory>(
  {
    name: { type: String, required: true, trim: true },
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
