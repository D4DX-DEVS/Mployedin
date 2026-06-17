import mongoose, { Document, Schema } from "mongoose";

export type OfferStatus =
  | "pending"
  | "accepted"
  | "declined"
  | "expired"
  | "withdrawn"
  | "countered";

/** A single entry in the offer's activity timeline. */
export type OfferEventType =
  | "created"
  | "revised"
  | "reminded"
  | "viewed"
  | "accepted"
  | "declined"
  | "countered"
  | "withdrawn"
  | "expired";

export interface IOfferEvent {
  type: OfferEventType;
  at: Date;
  /** Role of the actor who triggered the event. */
  actorRole?: string;
  /** Display name of the actor (cached for fast rendering). */
  actorName?: string;
  note?: string;
}

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
  /** Number of times the offer terms have been revised (starts at 1). */
  revisionNumber: number;
  /** When the candidate first opened the offer. */
  viewedAt?: Date;
  /** Most recent reminder sent to the candidate. */
  lastRemindedAt?: Date;
  /** Total reminders sent. */
  reminderCount: number;
  /** Candidate's counter-proposal when status is "countered". */
  counterOffer?: {
    amount: number;
    currency: string;
    period: "monthly" | "annually";
    note?: string;
    proposedAt: Date;
  };
  /** Chronological activity timeline. */
  events: IOfferEvent[];
  /** Candidate e-signature captured at acceptance (FG-6). */
  signature?: {
    fullName: string;
    signedAt: Date;
    ip?: string;
  };
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
      enum: ["pending", "accepted", "declined", "expired", "withdrawn", "countered"],
      default: "pending",
    },
    expiresAt: { type: Date, required: true },
    respondedAt: Date,
    declineReason: String,
    revisionNumber: { type: Number, default: 1 },
    viewedAt: Date,
    lastRemindedAt: Date,
    reminderCount: { type: Number, default: 0 },
    counterOffer: {
      amount: { type: Number },
      currency: { type: String },
      period: { type: String, enum: ["monthly", "annually"] },
      note: { type: String },
      proposedAt: { type: Date },
    },
    events: [
      {
        type: {
          type: String,
          enum: [
            "created",
            "revised",
            "reminded",
            "viewed",
            "accepted",
            "declined",
            "countered",
            "withdrawn",
            "expired",
          ],
          required: true,
        },
        at: { type: Date, default: Date.now },
        actorRole: { type: String },
        actorName: { type: String },
        note: { type: String },
      },
    ],
    signature: {
      fullName: { type: String },
      signedAt: { type: Date },
      ip: { type: String },
    },
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
