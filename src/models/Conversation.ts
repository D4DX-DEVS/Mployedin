import mongoose, { Schema, Document, Model } from "mongoose";

export interface IParticipantDetail {
  userId: mongoose.Types.ObjectId;
  name: string;
  role: string;
  avatar?: string;
}

export interface IConversation extends Document {
  _id: mongoose.Types.ObjectId;
  participants: mongoose.Types.ObjectId[]; // always exactly 2
  participantDetails: IParticipantDetail[];
  lastMessage?: string;
  lastMessageAt?: Date;
  lastSenderId?: mongoose.Types.ObjectId;
  unreadCounts: Map<string, number>; // userId (string) → unread count
  createdAt: Date;
  updatedAt: Date;
}

const ParticipantDetailSchema = new Schema<IParticipantDetail>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    name: { type: String, required: true },
    role: { type: String, required: true },
    avatar: String,
  },
  { _id: false }
);

const ConversationSchema = new Schema<IConversation>(
  {
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
  },
  { timestamps: true }
);

// Unique compound index so there's only ever one conversation between two users
ConversationSchema.index({ participants: 1 }, { unique: true });

const Conversation: Model<IConversation> =
  mongoose.models.Conversation ||
  mongoose.model<IConversation>("Conversation", ConversationSchema);

export default Conversation;
