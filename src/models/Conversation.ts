import mongoose, { Schema, Document, Model } from "mongoose";

export interface IParticipantDetail {
  userId: mongoose.Types.ObjectId;
  name: string;
  role: string;
  avatar?: string;
  headline?: string;
  companyName?: string;
}

export type ConversationType = "dm" | "customer_care";
export type CustomerCareStatus = "open" | "assigned" | "resolved" | "closed";
export type CustomerCarePriority = "low" | "medium" | "high" | "urgent";

export interface ICustomerCare {
  status: CustomerCareStatus;
  assignedTo?: mongoose.Types.ObjectId; // admin user handling the ticket
  priority: CustomerCarePriority;
  category?: string; // e.g. "account", "job_search", "technical", "billing", "other"
  closedAt?: Date;
  resolvedAt?: Date;
}

export interface IConversation extends Document {
  _id: mongoose.Types.ObjectId;
  type: ConversationType;
  participants: mongoose.Types.ObjectId[]; // always exactly 2
  participantDetails: IParticipantDetail[];
  lastMessage?: string;
  lastMessageAt?: Date;
  lastSenderId?: mongoose.Types.ObjectId;
  unreadCounts: Map<string, number>; // userId (string) → unread count
  customerCare?: ICustomerCare;
  createdAt: Date;
  updatedAt: Date;
}

const ParticipantDetailSchema = new Schema<IParticipantDetail>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    name: { type: String, required: true },
    role: { type: String, required: true },
    avatar: String,
    headline: String,
    companyName: String,
  },
  { _id: false }
);

const CustomerCareSchema = new Schema<ICustomerCare>(
  {
    status: {
      type: String,
      enum: ["open", "assigned", "resolved", "closed"],
      default: "open",
    },
    assignedTo: { type: Schema.Types.ObjectId, ref: "User" },
    priority: {
      type: String,
      enum: ["low", "medium", "high", "urgent"],
      default: "medium",
    },
    category: {
      type: String,
      enum: ["account", "job_search", "technical", "billing", "other"],
    },
    closedAt: Date,
    resolvedAt: Date,
  },
  { _id: false }
);

const ConversationSchema = new Schema<IConversation>(
  {
    type: {
      type: String,
      enum: ["dm", "customer_care"],
      default: "dm",
    },
    participants: {
      type: [Schema.Types.ObjectId],
      ref: "User",
      required: true,
      validate: { validator: (v: unknown[]) => v.length === 2, message: "Conversation must have exactly 2 participants" },
    },
    participantDetails: [ParticipantDetailSchema],
    lastMessage: String,
    lastMessageAt: Date,
    lastSenderId: { type: Schema.Types.ObjectId, ref: "User" },
    unreadCounts: { type: Map, of: Number, default: {} },
    customerCare: CustomerCareSchema,
  },
  { timestamps: true }
);

// Index for participant lookups; uniqueness enforced at application layer
ConversationSchema.index({ participants: 1 });
// Index for efficient customer care queries
ConversationSchema.index({ type: 1, "customerCare.status": 1 });
ConversationSchema.index({ "customerCare.assignedTo": 1 });

const Conversation: Model<IConversation> =
  mongoose.models.Conversation ||
  mongoose.model<IConversation>("Conversation", ConversationSchema);

export default Conversation;
