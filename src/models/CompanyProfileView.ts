import mongoose, { Document, Schema } from "mongoose";
import { d1LogMirror } from "@/lib/logs/logStore";

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

// LOGS_STORE=dual: every insert is also copied to D1 (lib/logs/logStore.ts).
CompanyProfileViewSchema.plugin(d1LogMirror("company_profile_view"));

export const CompanyProfileView =
  mongoose.models.CompanyProfileView ||
  mongoose.model<ICompanyProfileView>("CompanyProfileView", CompanyProfileViewSchema);
export default CompanyProfileView;
