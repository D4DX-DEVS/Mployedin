import mongoose, { Document, Schema } from "mongoose";

export type MessageRole = "user" | "assistant" | "system";
export type ConversationContext =
  | "cv_extraction"
  | "job_match"
  | "general_assist"
  | "interview_prep"
  | "employer_assist"
  | "agent_assist"
  | "super_agent_assist"
  | "admin_assist"
  | "job_creator"
  | "interview_ai"
  | "screening_ai";

export interface IMessage {
  role: MessageRole;
  content: string;
  model?: string;
  tokens?: number;
  timestamp: Date;
}

export interface IConversationThread extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  context: ConversationContext;
  title?: string;
  messages: IMessage[];
  isActive: boolean;
  meta?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const MessageSchema = new Schema<IMessage>(
  {
    role: { type: String, enum: ["user", "assistant", "system"], required: true },
    content: { type: String, required: true },
    model: String,
    tokens: Number,
    timestamp: { type: Date, default: Date.now },
  },
  { _id: false }
);

const ConversationThreadSchema = new Schema<IConversationThread>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    context: {
      type: String,
      enum: [
        "cv_extraction",
        "job_match",
        "general_assist",
        "interview_prep",
        "employer_assist",
        "agent_assist",
        "super_agent_assist",
        "admin_assist",
        "job_creator",
        "interview_ai",
        "screening_ai",
      ],
      required: true,
    },
    title: String,
    messages: [MessageSchema],
    isActive: { type: Boolean, default: true },
    meta: Schema.Types.Mixed,
  },
  { timestamps: true }
);

ConversationThreadSchema.index({ userId: 1 });
ConversationThreadSchema.index({ context: 1 });
ConversationThreadSchema.index({ createdAt: -1 });

// Force schema refresh in dev (Turbopack HMR caches the old model)
if (mongoose.models.ConversationThread) {
  delete (mongoose.models as Record<string, unknown>).ConversationThread;
}

export const ConversationThread = mongoose.model<IConversationThread>(
  "ConversationThread",
  ConversationThreadSchema
);
export default ConversationThread;
