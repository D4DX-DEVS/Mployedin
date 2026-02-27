import mongoose, { Document, Schema } from "mongoose";

export interface IState extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  nameAr: string;
  countryId: mongoose.Types.ObjectId;
  slug: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const StateSchema = new Schema<IState>(
  {
    name: { type: String, required: true, trim: true },
    nameAr: { type: String, default: "", trim: true },
    countryId: {
      type: Schema.Types.ObjectId,
      ref: "Country",
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

StateSchema.index({ countryId: 1 });
StateSchema.index({ slug: 1 }, { unique: true });
StateSchema.index({ isActive: 1, sortOrder: 1 });

export const State =
  mongoose.models.State || mongoose.model<IState>("State", StateSchema);
export default State;
