import mongoose, { Document, Schema } from "mongoose";

export interface ICompanyProfileView extends Document {
  viewerId: mongoose.Types.ObjectId;
  employerId: mongoose.Types.ObjectId;
  viewedAt: Date;
}

const CompanyProfileViewSchema = new Schema<ICompanyProfileView>(
  {
    viewerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    employerId: { type: Schema.Types.ObjectId, ref: "Employer", required: true },
    viewedAt: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

CompanyProfileViewSchema.index({ viewerId: 1, employerId: 1 });
CompanyProfileViewSchema.index({ employerId: 1, viewedAt: -1 });

export const CompanyProfileView =
  mongoose.models.CompanyProfileView ||
  mongoose.model<ICompanyProfileView>("CompanyProfileView", CompanyProfileViewSchema);
export default CompanyProfileView;
