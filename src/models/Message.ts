import mongoose, { Schema, Document, Model } from "mongoose";

export interface IMessage extends Document {
  channel: string;
  senderId: mongoose.Types.ObjectId;
  senderName: string;
  senderRole: string;
  content: string;
  createdAt: Date;
  updatedAt: Date;
}

const MessageSchema = new Schema<IMessage>(
  {
    channel: { type: String, required: true, index: true, default: "general" },
    senderId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    senderName: { type: String, required: true },
    senderRole: { type: String, required: true },
    content: { type: String, required: true, maxlength: 2000 },
  },
  { timestamps: true }
);

MessageSchema.index({ channel: 1, createdAt: -1 });

const Message: Model<IMessage> =
  mongoose.models.Message || mongoose.model<IMessage>("Message", MessageSchema);

export default Message;
