import mongoose, { Document, Schema } from "mongoose";

export interface IExhibitionPerformance extends Document {
  _id: mongoose.Types.ObjectId;
  exhibitionId: mongoose.Types.ObjectId;
  /** Leads & outreach */
  leadsGenerated: number;
  employersContacted: number;
  candidatesSourced: number;
  hiresGenerated: number;
  /** Financial */
  revenue: number;
  actualCost: number;
  roi: number;
  /** Resource usage */
  resourcesUsed?: string;
  /** Notes */
  notes?: string;
  /** Who reported */
  reportedBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const ExhibitionPerformanceSchema = new Schema<IExhibitionPerformance>(
  {
    exhibitionId: {
      type: Schema.Types.ObjectId,
      ref: "ExhibitionRequest",
      required: true,
      unique: true,
      index: true,
    },
    leadsGenerated: { type: Number, default: 0, min: 0 },
    employersContacted: { type: Number, default: 0, min: 0 },
    candidatesSourced: { type: Number, default: 0, min: 0 },
    hiresGenerated: { type: Number, default: 0, min: 0 },
    revenue: { type: Number, default: 0, min: 0 },
    actualCost: { type: Number, default: 0, min: 0 },
    roi: { type: Number, default: 0 },
    resourcesUsed: { type: String, trim: true, maxlength: 2000 },
    notes: { type: String, trim: true, maxlength: 2000 },
    reportedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

export default mongoose.models.ExhibitionPerformance ??
  mongoose.model<IExhibitionPerformance>("ExhibitionPerformance", ExhibitionPerformanceSchema);
