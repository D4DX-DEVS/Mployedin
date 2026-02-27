import mongoose, { Document, Schema } from "mongoose";

export interface ICity extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  nameAr: string;
  stateId: mongoose.Types.ObjectId;
  slug: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const CitySchema = new Schema<ICity>(
  {
    name: { type: String, required: true, trim: true },
    nameAr: { type: String, default: "", trim: true },
    stateId: {
      type: Schema.Types.ObjectId,
      ref: "State",
      required: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

CitySchema.index({ stateId: 1 });
CitySchema.index({ slug: 1 }, { unique: true });
CitySchema.index({ isActive: 1, sortOrder: 1 });

export const City =
  mongoose.models.City || mongoose.model<ICity>("City", CitySchema);
export default City;
