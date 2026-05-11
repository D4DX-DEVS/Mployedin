import mongoose, { Document, Schema } from "mongoose";

export type ExhibitionRequestStatus =
  | "pending"
  | "approved"
  | "rejected";

export type ExhibitionParticipationType =
  | "standy"
  | "stall"
  | "booth"
  | "sponsorship"
  | "other";

export interface IExhibitionRequest extends Document {
  _id: mongoose.Types.ObjectId;
  /** Agent who submitted the request */
  agentId: mongoose.Types.ObjectId;
  /** Super agent who reviews the request */
  superAgentId?: mongoose.Types.ObjectId;
  /** Exhibition / event name */
  eventName: string;
  /** Event description */
  description?: string;
  /** Where the event takes place */
  eventLocation?: string;
  /** Start date of the event */
  eventStartDate: Date;
  /** End date of the event */
  eventEndDate: Date;
  /** What the agent wants to exhibit */
  participationType: ExhibitionParticipationType;
  /** Additional details about participation */
  participationDetails?: string;
  /** Estimated budget */
  estimatedBudget?: number;
  /** Currency for the budget */
  budgetCurrency?: string;
  /** Current status */
  status: ExhibitionRequestStatus;
  /** Reviewer (super agent or admin) who approved/rejected */
  reviewedBy?: mongoose.Types.ObjectId;
  /** When it was reviewed */
  reviewedAt?: Date;
  /** Review notes from the approver */
  reviewNote?: string;
  /** Status change history */
  statusHistory: {
    status: ExhibitionRequestStatus;
    changedAt: Date;
    changedBy?: mongoose.Types.ObjectId;
    note?: string;
  }[];
  createdAt: Date;
  updatedAt: Date;
}

const ExhibitionRequestSchema = new Schema<IExhibitionRequest>(
  {
    agentId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    superAgentId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },
    eventName: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, trim: true, maxlength: 2000 },
    eventLocation: { type: String, trim: true, maxlength: 300 },
    eventStartDate: { type: Date, required: true },
    eventEndDate: { type: Date, required: true },
    participationType: {
      type: String,
      enum: ["standy", "stall", "booth", "sponsorship", "other"],
      required: true,
    },
    participationDetails: { type: String, trim: true, maxlength: 1000 },
    estimatedBudget: { type: Number, min: 0 },
    budgetCurrency: { type: String, default: "USD", maxlength: 5 },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
      index: true,
    },
    reviewedBy: { type: Schema.Types.ObjectId, ref: "User" },
    reviewedAt: { type: Date },
    reviewNote: { type: String, trim: true, maxlength: 1000 },
    statusHistory: [
      {
        status: { type: String, enum: ["pending", "approved", "rejected"] },
        changedAt: { type: Date, default: Date.now },
        changedBy: { type: Schema.Types.ObjectId, ref: "User" },
        note: { type: String, maxlength: 500 },
      },
    ],
  },
  { timestamps: true }
);

export default mongoose.models.ExhibitionRequest ??
  mongoose.model<IExhibitionRequest>("ExhibitionRequest", ExhibitionRequestSchema);
