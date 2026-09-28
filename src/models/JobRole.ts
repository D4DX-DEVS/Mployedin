import mongoose from "mongoose";
import { createAttributeModel, type IAttribute } from "./shared/attributeModel";

/** A job position / title (e.g. "Frontend Developer") grouped by functional area. */
export interface IJobRole extends IAttribute {
  functionalAreaId?: mongoose.Types.ObjectId;
  functionalArea: string;
  aliases: string[];
}

export const JobRole = createAttributeModel<IJobRole>(
  "JobRole",
  {
    functionalAreaId: { type: mongoose.Schema.Types.ObjectId, ref: "FunctionalArea" },
    functionalArea: { type: String, default: "", trim: true },
    aliases: { type: [String], default: [] },
  },
  "jobroles",
);
export default JobRole;
