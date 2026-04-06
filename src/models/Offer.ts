import mongoose, { Document, Schema } from "mongoose";

export type OfferStatus = "pending" | "accepted" | "declined" | "expired" | "withdrawn";

export interface IOffer extends Document {
  _id: mongoose.Types.ObjectId;
  applicationId: mongoose.Types.ObjectId;
  jobId: mongoose.Types.ObjectId;
  jobSeekerId: mongoose.Types.ObjectId;
  employerId: mongoose.Types.ObjectId;
  salary: {
    amount: number;
    currency: string;
    period: "monthly" | "annually";
  };
  startDate: Date;
  benefits?: string;
  notes?: string;
  status: OfferStatus;
  expiresAt: Date;
  respondedAt?: Date;
  declineReason?: string;
  createdAt: Date;
  updatedAt: Date;
}

const OfferSchema = new Schema<IOffer>(
  {
    applicationId: {
      type: Schema.Types.ObjectId,
      ref: "Application",
      required: true,
    },
    jobId: {
      type: Schema.Types.ObjectId,
      ref: "Job",
      required: true,
    },
    jobSeekerId: {
      type: Schema.Types.ObjectId,
      ref: "JobSeeker",
      required: true,
    },
    employerId: {
      type: Schema.Types.ObjectId,
      ref: "Employer",
      required: true,
    },
    salary: {
      amount: { type: Number, required: true },
      currency: { type: String, required: true },
      period: {
        type: String,
        enum: ["monthly", "annually"],
        required: true,
      },
    },
    startDate: { type: Date, required: true },
    benefits: String,
    notes: String,
    status: {
      type: String,
      enum: ["pending", "accepted", "declined", "expired", "withdrawn"],
      default: "pending",
    },
    expiresAt: { type: Date, required: true },
    respondedAt: Date,
    declineReason: String,
  },
  { timestamps: true }
);

OfferSchema.index({ applicationId: 1 });
OfferSchema.index({ jobSeekerId: 1 });
OfferSchema.index({ employerId: 1 });
OfferSchema.index({ status: 1 });

export const Offer =
  mongoose.models.Offer || mongoose.model<IOffer>("Offer", OfferSchema);
export default Offer;
