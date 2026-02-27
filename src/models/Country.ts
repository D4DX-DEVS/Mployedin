import mongoose, { Document, Schema } from "mongoose";

export interface ICountry extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  nameAr: string;
  code: string; // ISO 3166-1 alpha-2 (e.g. "AF", "US")
  phoneCode: string; // e.g. "93", "1"
  currency: string; // e.g. "Afghanis", "Dollars"
  currencyCode: string; // ISO 4217 (e.g. "AFN", "USD")
  currencySymbol: string; // e.g. "؋", "$"
  thousandSeparator: string; // e.g. ","
  decimalSeparator: string; // e.g. "."
  sortOrder: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const CountrySchema = new Schema<ICountry>(
  {
    name: { type: String, required: true, trim: true },
    nameAr: { type: String, default: "", trim: true },
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      maxlength: 3,
    },
    phoneCode: { type: String, default: "", trim: true },
    currency: { type: String, default: "", trim: true },
    currencyCode: { type: String, default: "", uppercase: true, trim: true },
    currencySymbol: { type: String, default: "", trim: true },
    thousandSeparator: { type: String, default: ",", trim: true },
    decimalSeparator: { type: String, default: ".", trim: true },
    sortOrder: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

CountrySchema.index({ code: 1 }, { unique: true });
CountrySchema.index({ isActive: 1, sortOrder: 1 });
CountrySchema.index({ name: 1 });

export const Country =
  mongoose.models.Country ||
  mongoose.model<ICountry>("Country", CountrySchema);
export default Country;
