import mongoose, { Document, Schema } from "mongoose";

export interface IOfferLetterVariable {
  key: string;
  label: string;
  defaultValue?: string;
}

export interface IOfferLetterTemplate extends Document {
  _id: mongoose.Types.ObjectId;
  employerId: mongoose.Types.ObjectId;
  name: string;
  content: string; // HTML template with {{variables}}
  variables: IOfferLetterVariable[];
  isDefault: boolean;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface IOfferLetter extends Document {
  _id: mongoose.Types.ObjectId;
  offerId: mongoose.Types.ObjectId;
  employerId: mongoose.Types.ObjectId;
  templateId?: mongoose.Types.ObjectId;
  candidateName: string;
  candidateEmail: string;
  content: string; // Rendered HTML
  variableValues: Record<string, string>;
  status: "draft" | "sent" | "viewed" | "signed" | "declined";
  sentAt?: Date;
  viewedAt?: Date;
  signedAt?: Date;
  signatureData?: string; // Base64 signature image
  signatureIp?: string;
  declinedAt?: Date;
  declineReason?: string;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const VariableSchema = new Schema<IOfferLetterVariable>(
  {
    key: { type: String, required: true },
    label: { type: String, required: true },
    defaultValue: String,
  },
  { _id: false }
);

const OfferLetterTemplateSchema = new Schema<IOfferLetterTemplate>(
  {
    employerId: { type: Schema.Types.ObjectId, ref: "Employer", required: true },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    content: { type: String, required: true, maxlength: 50000 },
    variables: [VariableSchema],
    isDefault: { type: Boolean, default: false },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

OfferLetterTemplateSchema.index({ employerId: 1 });

const OfferLetterSchema = new Schema<IOfferLetter>(
  {
    offerId: { type: Schema.Types.ObjectId, ref: "Offer", required: true },
    employerId: { type: Schema.Types.ObjectId, ref: "Employer", required: true },
    templateId: { type: Schema.Types.ObjectId, ref: "OfferLetterTemplate" },
    candidateName: { type: String, required: true },
    candidateEmail: { type: String, required: true },
    content: { type: String, required: true, maxlength: 50000 },
    variableValues: { type: Map, of: String, default: {} },
    status: { type: String, enum: ["draft", "sent", "viewed", "signed", "declined"], default: "draft" },
    sentAt: Date,
    viewedAt: Date,
    signedAt: Date,
    signatureData: String,
    signatureIp: String,
    declinedAt: Date,
    declineReason: { type: String, maxlength: 500 },
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

OfferLetterSchema.index({ offerId: 1 });
OfferLetterSchema.index({ employerId: 1 });
OfferLetterSchema.index({ status: 1 });

export const OfferLetterTemplate =
  mongoose.models.OfferLetterTemplate || mongoose.model<IOfferLetterTemplate>("OfferLetterTemplate", OfferLetterTemplateSchema);

export default mongoose.models.OfferLetter || mongoose.model<IOfferLetter>("OfferLetter", OfferLetterSchema);
